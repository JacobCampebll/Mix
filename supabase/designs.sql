-- designs + design_events: DesignBook storage, RLS, stage rules, audit trail.
--
-- APPLIED to the live project 2026-09-03 as migrations
--   designs_table_events_rls_and_review_flag
--   current_technician_fixed_search_path
-- Kept here so the repo describes the database. Verified with a rolled-back
-- transaction impersonating a contractor (jcampbe2), a Central Office
-- reviewer (adenmark) and an unrelated technician - 13 checks, all as
-- intended (see the commit that added this file).
--
-- Design decisions (Jacob, 2026-09-03):
--   * Real columns for what gets filtered and reported on; JSONB for the
--     form body (`values`, `rows`) until the MixPack field map settles.
--   * A design is readable by its author and by anyone whose effective plant
--     access includes its plant - technician_effective_plant_access, so
--     Central Office (all_plants) sees everything. Derived in ONE place.
--   * Only a reviewer (technicians.can_review) may move a design past
--     Internal Review or send it back to Draft, and never their own design.
--     Enforced by a trigger, so no page can skip it.
--   * can_review is separate from all_plants on purpose: "sees every plant"
--     and "may approve" are different powers, even if the same 12 people
--     hold both today. The seed script sets both by company.

alter table technicians
  add column if not exists can_review boolean not null default false;
comment on column technicians.can_review is
  'May move a design past Internal Review (Released, Approved) and send one back to Draft. Set for KYTC Central Office Materials. Admin-controlled; the seed script sets it by company.';
update technicians set can_review = true
 where company = 'Central Office Materials' and not can_review;

create or replace function current_technician()
returns technicians
language sql stable security invoker set search_path = public
as $$ select t from technicians t where t.user_id = auth.uid() limit 1 $$;

create table if not exists designs (
  id              uuid primary key default gen_random_uuid(),
  contract_id     text not null,
  letting_date    date not null,
  amp_number      text not null references plants(amp_number),
  sm_id           text not null references technicians(sm_id),
  author_user_id  uuid not null default auth.uid(),
  author_name     text not null,                 -- denormalised: contractors cannot read other technicians' rows
  mix_signature   text,                          -- "CL3 ASPH SURF 0.38A PG64-22", from kytc-lookup
  mix             jsonb,                         -- {class, layer, size, binder, bid_lines}
  mix_id          text,                          -- KYTC-assigned, filled in later
  origin          text not null check (origin in ('legacy', 'new')),
  stage           text not null default 'Draft'
                  check (stage in ('Draft', 'Internal Review', 'Released', 'Approved')),
  values          jsonb not null default '{}'::jsonb,
  rows            jsonb not null default '{}'::jsonb,   -- {aggregate:[...], ct:[...]}
  extracted_from  jsonb not null default '{}'::jsonb,   -- field -> source cell / lookup
  legacy_import   jsonb,                                -- {version, context, unmapped}
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists designs_contract_idx  on designs (contract_id, letting_date);
create index if not exists designs_amp_stage_idx on designs (amp_number, stage);
create index if not exists designs_author_idx    on designs (author_user_id);

create table if not exists design_events (
  id          bigserial primary key,
  design_id   uuid not null references designs(id) on delete cascade,
  at          timestamptz not null default now(),
  user_id     uuid not null,
  sm_id       text not null,
  kind        text not null check (kind in ('created', 'saved', 'stage', 'note')),
  from_stage  text,
  to_stage    text,
  note        text
);
create index if not exists design_events_design_idx on design_events (design_id, at);

-- RLS ON before any grant.
alter table designs       enable row level security;
alter table design_events enable row level security;
revoke all on designs, design_events from anon, authenticated;
grant select, insert, update, delete on designs to authenticated;
grant select on design_events to authenticated;   -- written only by the audit trigger

create policy "designs: read own or at an accessible plant"
  on designs for select to authenticated
  using (
    author_user_id = auth.uid()
    or exists (
      select 1 from technician_effective_plant_access e
      join technicians t on t.sm_id = e.sm_id
      where t.user_id = auth.uid() and e.amp_number = designs.amp_number
    )
  );

create policy "designs: insert as yourself at an accessible plant"
  on designs for insert to authenticated
  with check (
    author_user_id = auth.uid()
    and sm_id = (select sm_id from technicians where user_id = auth.uid())
    and exists (select 1 from technician_capabilities c where c.user_id = auth.uid() and c.can_access_designbook)
    and exists (
      select 1 from technician_effective_plant_access e
      join technicians t on t.sm_id = e.sm_id
      where t.user_id = auth.uid() and e.amp_number = designs.amp_number
    )
  );

create policy "designs: update by author or reviewer"
  on designs for update to authenticated
  using      (author_user_id = auth.uid() or (select can_review from technicians where user_id = auth.uid()))
  with check (author_user_id = auth.uid() or (select can_review from technicians where user_id = auth.uid()));

create policy "designs: author deletes own draft"
  on designs for delete to authenticated
  using (author_user_id = auth.uid() and stage = 'Draft');

create policy "design_events: read for visible designs"
  on design_events for select to authenticated
  using (exists (select 1 from designs d where d.id = design_events.design_id));

-- Stage rules, enforced server-side:
--   Draft -> Internal Review     : author or reviewer
--   Internal Review -> Released  : reviewer only, never the author
--   Released -> Approved         : reviewer only, never the author
--   any -> Draft (send back)     : reviewer only
--   Approved content is read-only until a reviewer sends it back.
create or replace function designs_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me technicians;
  order_of constant text[] := array['Draft', 'Internal Review', 'Released', 'Approved'];
  i_old int; i_new int;
begin
  select * into me from technicians where user_id = auth.uid();
  if me.sm_id is null then raise exception 'no technician row for this user'; end if;
  if tg_op = 'INSERT' then
    new.author_user_id := auth.uid();
    new.sm_id := me.sm_id;
    new.author_name := coalesce(nullif(new.author_name, ''), me.first_name || ' ' || me.last_name);
    new.stage := 'Draft';
    new.created_at := now(); new.updated_at := now();
    return new;
  end if;
  new.author_user_id := old.author_user_id;
  new.sm_id := old.sm_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  if new.stage is distinct from old.stage then
    i_old := array_position(order_of, old.stage);
    i_new := array_position(order_of, new.stage);
    if new.stage = 'Draft' then
      if not me.can_review then raise exception 'only a reviewer can send a design back to Draft'; end if;
    elsif i_new = i_old + 1 then
      if new.stage <> 'Internal Review' then
        if not me.can_review then raise exception 'only a reviewer can move a design to %', new.stage; end if;
        if old.author_user_id = auth.uid() then raise exception 'a reviewer cannot release or approve their own design'; end if;
      end if;
    else
      raise exception 'stage may only advance one step (% -> %)', old.stage, new.stage;
    end if;
  elsif old.stage = 'Approved' then
    raise exception 'an Approved design is read-only; a reviewer must send it back to Draft first';
  end if;
  return new;
end $$;

create or replace function designs_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare me technicians;
begin
  select * into me from technicians where user_id = auth.uid();
  if tg_op = 'INSERT' then
    insert into design_events (design_id, user_id, sm_id, kind, to_stage, note)
      values (new.id, auth.uid(), me.sm_id, 'created', new.stage, new.origin || ' design started');
  elsif new.stage is distinct from old.stage then
    insert into design_events (design_id, user_id, sm_id, kind, from_stage, to_stage)
      values (new.id, auth.uid(), me.sm_id, 'stage', old.stage, new.stage);
  else
    insert into design_events (design_id, user_id, sm_id, kind) values (new.id, auth.uid(), me.sm_id, 'saved');
  end if;
  return new;
end $$;

drop trigger if exists designs_guard_trg on designs;
create trigger designs_guard_trg before insert or update on designs for each row execute function designs_guard();
drop trigger if exists designs_audit_trg on designs;
create trigger designs_audit_trg after insert or update on designs for each row execute function designs_audit();

-- SECURITY DEFINER trigger functions must not be callable directly.
revoke all on function designs_guard() from public, anon, authenticated;
revoke all on function designs_audit() from public, anon, authenticated;
revoke all on function current_technician() from public, anon;
grant execute on function current_technician() to authenticated;

-- What the Portal lists. security_invoker: the caller's designs RLS applies.
create or replace view design_summaries
with (security_invoker = true) as
  select d.id, d.contract_id, d.letting_date, d.amp_number, p.name as plant_name,
         d.sm_id, d.author_name, d.author_user_id, d.mix_signature, d.mix_id,
         d.origin, d.stage, d.created_at, d.updated_at
  from designs d
  left join plants p on p.amp_number = d.amp_number;
grant select on design_summaries to authenticated;
