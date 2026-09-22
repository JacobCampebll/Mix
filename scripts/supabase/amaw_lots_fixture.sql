-- A stand-in for the live project: just enough of schema.sql /
-- effective_plant_access.sql / designs.sql for amaw_lots.sql to apply and for
-- its policies to be tested under real RLS. Copied from those files, not
-- invented.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public to anon, authenticated;

-- Supabase's auth.uid() reads the JWT claim. Here it reads a GUC the test
-- sets, which is what "impersonate" means in a rolled-back transaction.
create schema auth;
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create table plants (amp_number text primary key, name text not null);
create table technicians (
  sm_id text primary key, first_name text not null, last_name text not null,
  company text not null, user_id uuid unique, onboarded boolean not null default false,
  all_plants boolean not null default false, can_review boolean not null default false
);
create table technician_plant_access (
  sm_id text not null references technicians(sm_id), amp_number text not null,
  primary key (sm_id, amp_number)
);
create table technician_certifications (
  sm_id text not null references technicians(sm_id),
  cert_type text not null check (cert_type in ('plant_tech','mix_design_tech')),
  expires_on date not null, primary key (sm_id, cert_type)
);

alter table plants enable row level security;
alter table technicians enable row level security;
alter table technician_plant_access enable row level security;
alter table technician_certifications enable row level security;
revoke all on plants, technicians, technician_plant_access, technician_certifications from anon, authenticated;
grant select on plants, technicians, technician_plant_access, technician_certifications to authenticated;

create policy "plants: read all" on plants for select to authenticated using (true);
create policy "technicians: read own row" on technicians for select to authenticated
  using (user_id = auth.uid());
create policy "technician_plant_access: read own access" on technician_plant_access for select to authenticated
  using (sm_id in (select sm_id from technicians where user_id = auth.uid()));
create policy "technician_certifications: read own certs" on technician_certifications for select to authenticated
  using (sm_id in (select sm_id from technicians where user_id = auth.uid()));

create or replace view technician_capabilities with (security_invoker = true) as
select t.sm_id, t.user_id,
  exists (select 1 from technician_certifications c where c.sm_id = t.sm_id and c.cert_type='plant_tech' and c.expires_on >= current_date) as has_plant_tech,
  exists (select 1 from technician_certifications c where c.sm_id = t.sm_id and c.cert_type='mix_design_tech' and c.expires_on >= current_date) as has_mix_design_tech,
  (exists (select 1 from technician_certifications c where c.sm_id = t.sm_id and c.cert_type='plant_tech' and c.expires_on >= current_date)
   or exists (select 1 from technician_certifications c where c.sm_id = t.sm_id and c.cert_type='mix_design_tech' and c.expires_on >= current_date)) as can_access_plantbook,
  exists (select 1 from technician_certifications c where c.sm_id = t.sm_id and c.cert_type='mix_design_tech' and c.expires_on >= current_date) as can_access_designbook
from technicians t;
grant select on technician_capabilities to authenticated;

create or replace view technician_effective_plant_access with (security_invoker = true) as
  select a.sm_id, a.amp_number from technician_plant_access a
  union
  select t.sm_id, p.amp_number from technicians t cross join plants p where t.all_plants;
grant select on technician_effective_plant_access to authenticated;

-- ---- the cast ----
insert into plants values
  ('AMP070301','The Allen Company @ Berea'),
  ('AMP070302','The Allen Company @ Boonesboro'),
  ('AMP010201','Central Paving Co. @ Paducah');
insert into technicians (sm_id, first_name, last_name, company, user_id, all_plants, can_review) values
  ('jcavanah','Jo','Cavanah','The Allen Company','11111111-1111-1111-1111-111111111111', false, false),
  ('nightsh', 'Nat','Shifter','The Allen Company','22222222-2222-2222-2222-222222222222', false, false),
  ('otherco', 'Otto','Elsewhere','Central Paving Co.','33333333-3333-3333-3333-333333333333', false, false),
  ('adenmark','Andrew','Denmark','Central Office Materials','44444444-4444-4444-4444-444444444444', true,  true),
  ('lapsed',  'Lee','Lapsed','The Allen Company','55555555-5555-5555-5555-555555555555', false, false);
insert into technician_plant_access values
  ('jcavanah','AMP070302'), ('nightsh','AMP070302'),
  ('otherco','AMP010201'),  ('lapsed','AMP070302');
insert into technician_certifications values
  ('jcavanah','plant_tech', current_date + 365),
  ('nightsh', 'plant_tech', current_date + 365),
  ('otherco', 'plant_tech', current_date + 365),
  ('adenmark','plant_tech', current_date + 365),
  ('adenmark','mix_design_tech', current_date + 365),
  ('lapsed',  'plant_tech', current_date - 1);     -- expired: holds no book
