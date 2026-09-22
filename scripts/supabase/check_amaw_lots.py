#!/usr/bin/env python3
"""Impersonation tests for supabase/amaw_lots.sql, against a real Postgres.

    pip install psycopg2-binary
    createdb mixtest
    psql -d mixtest -f scripts/supabase/amaw_lots_fixture.sql
    psql -d mixtest -f supabase/amaw_lots.sql
    AMAW_TEST_DSN="dbname=mixtest" python3 scripts/supabase/check_amaw_lots.py

NOT against the live project, ever - it inserts, seals and purges. A scratch
cluster is the point. The fixture beside this file stands in for the identity
tables (plants, technicians, the two views) and for Supabase's auth.uid(),
which it reads from a GUC so a test can say who it is.

Every case runs in its own transaction and is ROLLED BACK, which is the
discipline CLAUDE.md records for the designs.sql policies - nothing is left
behind and a failing case cannot poison the next one. `set role authenticated`
plus `set local test.uid` is what "sign in as" means here, so the real policies
run against a real caller rather than against a superuser who bypasses them
all.

Watched failing, which is the only thing that makes it worth having: dropping
amaw_lots_guard_trg lets a contractor mark their own lot Accepted with a hash
of their choosing, and widening the SELECT policy to `using (true)` hands one
contractor another contractor's in-progress lot. Both go red here.
"""
import os, psycopg2, sys

DSN = os.environ.get("AMAW_TEST_DSN", "host=127.0.0.1 port=54329 user=postgres dbname=mixtest")
JO   = '11111111-1111-1111-1111-111111111111'   # contractor, AMP070302
NIGHT= '22222222-2222-2222-2222-222222222222'   # night shift, same plant
OTHER= '33333333-3333-3333-3333-333333333333'   # another company, AMP010201
ANDY = '44444444-4444-4444-4444-444444444444'   # KYTC reviewer, all_plants
LAPSE= '55555555-5555-5555-5555-555555555555'   # certification expired

passed = failed = 0
def check(name, ok, detail=''):
    global passed, failed
    if ok: passed += 1; print(f"  ok   {name}")
    else:  failed += 1; print(f"  FAIL {name}" + (f"  -- {detail}" if detail else ''))

class As:
    """One rolled-back transaction, acting as one signed-in technician."""
    def __init__(self, uid, role='authenticated'):
        self.uid, self.role = uid, role
    def __enter__(self):
        self.cn = psycopg2.connect(DSN); self.cn.autocommit = False
        self.cur = self.cn.cursor()
        self.cur.execute("set role %s" % self.role)
        if self.uid: self.cur.execute("select set_config('test.uid', %s, true)", (self.uid,))
        return self.cur
    def __exit__(self, *a):
        self.cn.rollback(); self.cn.close(); return False

def admin():
    cn = psycopg2.connect(DSN); cn.autocommit = False
    return cn

def sql_fails(cur, stmt, args=(), want=None):
    """Run a statement expecting it to raise. Returns (raised, message)."""
    try:
        cur.execute("savepoint s"); cur.execute(stmt, args); cur.execute("release savepoint s")
        return (False, 'no error')
    except Exception as e:
        cur.execute("rollback to savepoint s")
        msg = str(e).strip().splitlines()[0]
        if want and want.lower() not in msg.lower(): return (True, f'wrong error: {msg}')
        return (True, msg)

LOT = "11111111-0000-4000-8000-00000000000%d"

# Some cases have to COMMIT (a purge sweep cannot see an uncommitted lot), so
# the run starts by clearing out its own fixtures. Only ever the nine uuids
# above - it never truncates a table it did not fill.
def clean():
    cn = psycopg2.connect(DSN); cn.autocommit = True
    cn.cursor().execute("delete from amaw_lots where id = any(%s::uuid[])",
                        ([LOT % n for n in range(1, 10)],))
    cn.close()
clean()

def new_lot(cur, uid_lot, sm='jcavanah', uid=JO, amp='AMP070302', lot_no=1,
            line='0160', option='A', contract='252112', mix='00260467'):
    cur.execute("""insert into amaw_lots
        (id, contract_id, line_item, amp_number, mix_id, mix_signature, lot_number,
         density_option, sm_id, author_user_id, author_name)
        values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id""",
        (uid_lot, contract, line, amp, mix, 'CL3 ASPH SURF 0.38A PG64-22',
         lot_no, option, sm, uid, 'Jo Cavanah'))
    return cur.fetchone()[0]

print("\n=== 1. who may start a lot ===")
with As(JO) as cur:
    lid = new_lot(cur, LOT % 1)
    check("a plant technician starts a lot at their own plant", lid is not None)
with As(JO) as cur:
    raised, msg = sql_fails(cur, """insert into amaw_lots
        (id, contract_id, amp_number, mix_id, lot_number, sm_id, author_user_id, author_name)
        values (%s,'252112','AMP010201','00260467',1,'jcavanah',%s,'Jo')""", (LOT % 2, JO),
        want='policy')
    check("...and not at a plant they have no access to", raised, msg)
with As(LAPSE) as cur:
    raised, msg = sql_fails(cur, """insert into amaw_lots
        (id, contract_id, amp_number, mix_id, lot_number, sm_id, author_user_id, author_name)
        values (%s,'252112','AMP070302','00260467',1,'lapsed',%s,'Lee')""", (LOT % 3, LAPSE),
        want='policy')
    check("an expired certification starts nothing", raised, msg)
with As(JO) as cur:
    raised, msg = sql_fails(cur, """insert into amaw_lots
        (id, contract_id, amp_number, mix_id, lot_number, sm_id, author_user_id, author_name)
        values (%s,'252112','AMP070302','00260467',1,'nightsh',%s,'Jo')""", (LOT % 4, JO),
        want='policy')
    check("a lot cannot be started in somebody else's name", raised, msg)
with As(JO) as cur:
    raised, msg = sql_fails(cur, """insert into amaw_lots
        (id, contract_id, amp_number, mix_id, lot_number, sm_id, author_user_id, author_name, status)
        values (%s,'252112','AMP070302','00260467',1,'jcavanah',%s,'Jo','Accepted')""", (LOT % 5, JO),
        want='policy')
    check("a lot cannot be BORN accepted", raised, msg)
with As(None, role='anon') as cur:
    raised, msg = sql_fails(cur, "select count(*) from amaw_lots", want='permission denied')
    check("anon reaches none of it", raised, msg)

print("\n=== 2. who may read and edit an open lot ===")
cn = admin(); c = cn.cursor()
c.execute("set role authenticated"); c.execute("select set_config('test.uid',%s,true)", (JO,))
lid = new_lot(c, LOT % 1)
c.execute("insert into amaw_lot_data (lot_id, values) values (%s, '{\"lot_tons\": 4000}')", (lid,))
cn.commit()

with As(NIGHT) as cur:
    cur.execute("select count(*) from amaw_lots where id=%s", (lid,))
    check("the night shift reads the day shift's lot", cur.fetchone()[0] == 1)
    cur.execute("update amaw_lot_data set values = '{\"lot_tons\": 3800}' where lot_id=%s returning revision", (lid,))
    r = cur.fetchall()
    check("...and may save into it", len(r) == 1 and r[0][0] == 1, r)
with As(OTHER) as cur:
    cur.execute("select count(*) from amaw_lots where id=%s", (lid,))
    check("another company sees nothing", cur.fetchone()[0] == 0)
    cur.execute("select count(*) from amaw_lot_data where lot_id=%s", (lid,))
    check("...not the data either", cur.fetchone()[0] == 0)
with As(ANDY) as cur:
    cur.execute("select count(*) from amaw_lots where id=%s", (lid,))
    check("KYTC (all_plants) sees it", cur.fetchone()[0] == 1)

print("\n=== 3. the chain is not the client's to write ===")
with As(JO) as cur:
    cur.execute("update amaw_lots set status='Accepted', submittal_sha256=%s, purge_after=now() where id=%s",
                ('a'*64, lid))
    cur.execute("select status, submittal_sha256, purge_after from amaw_lots where id=%s", (lid,))
    row = cur.fetchone()
    check("a client UPDATE of status/hash/purge_after is pinned, not obeyed",
          row == ('Open', None, None), row)
with As(JO) as cur:
    cur.execute("update amaw_lots set contract_id='999999', amp_number='AMP070301', lot_number=9 where id=%s", (lid,))
    cur.execute("select contract_id, amp_number, lot_number from amaw_lots where id=%s", (lid,))
    check("the identity is immutable", cur.fetchone() == ('252112','AMP070302',1))
with As(JO) as cur:
    cur.execute("update amaw_lots set line_item='0165', density_option='B' where id=%s", (lid,))
    cur.execute("select line_item, density_option from amaw_lots where id=%s", (lid,))
    check("...except the line item and the option, which a lookup fills later",
          cur.fetchone() == ('0165','B'))

print("\n=== 4. sealing ===")
with As(OTHER) as cur:
    raised, msg = sql_fails(cur, "select amaw_seal_lot(%s,'Submitted',%s)", (lid, 'b'*64),
                            want='not at a plant')
    check("a stranger cannot submit your lot", raised, msg)
with As(JO) as cur:
    raised, msg = sql_fails(cur, "select amaw_seal_lot(%s,'Submitted')", (lid,), want='needs the submittal hash')
    check("a submitted lot needs its hash", raised, msg)
with As(JO) as cur:
    raised, msg = sql_fails(cur, "select amaw_seal_lot(%s,'Accepted',%s)", (lid, 'b'*64), want='only KYTC')
    check("a contractor cannot accept their own lot", raised, msg)

with As(JO) as cur:
    cur.execute("select amaw_seal_lot(%s,'Submitted',%s,%s)", (lid, 'b'*64, 'c'*64))
    cur.execute("select status, submittal_sha256, prev_sha256, submitted_name, purge_after > now() from amaw_lots where id=%s", (lid,))
    row = cur.fetchone()
    check("the plant submits: status, hash, chain and purge clock all land",
          row == ('Submitted','b'*64,'c'*64,'Jo Cavanah',True), row)
    raised, msg = sql_fails(cur, "select amaw_seal_lot(%s,'Submitted',%s)", (lid, 'd'*64),
                            want='never reopened')
    check("...and a lot is never submitted twice", raised, msg)
    # once submitted, the data is frozen
    raised, msg = sql_fails(cur, "update amaw_lot_data set values='{}' where lot_id=%s", (lid,))
    cur.execute("select count(*) from amaw_lot_data where lot_id=%s and values::text <> '{}'", (lid,))
    check("...and the data can no longer be edited", cur.fetchone()[0] == 1)

# Seal for real so the purge cases have something to work on.
c.execute("set role authenticated"); c.execute("select set_config('test.uid',%s,true)", (JO,))
c.execute("select amaw_seal_lot(%s,'Submitted',%s,%s)", (lid, 'b'*64, 'c'*64)); cn.commit()

with As(ANDY) as cur:
    cur.execute("select amaw_seal_lot(%s,'Accepted')", (lid,))
    cur.execute("select status, accepted_name from amaw_lots where id=%s", (lid,))
    check("KYTC accepts it", cur.fetchone() == ('Accepted','Andrew Denmark'))

print("\n=== 5. retention ===")
c.execute("reset role")
c.execute("select amaw_purge_expired()")
check("nothing is purged before its time", c.fetchone()[0] == 0)
c.execute("select count(*) from amaw_lot_data where lot_id=%s", (lid,))
check("...the data is still there", c.fetchone()[0] == 1)

# Backdate. The guard pins purge_after even for a superuser, so this also
# proves the GUC is what lifts it rather than the role.
c.execute("update amaw_lots set purge_after = now() - interval '1 day' where id=%s", (lid,))
c.execute("select purge_after > now() from amaw_lots where id=%s", (lid,))
check("even a superuser cannot move purge_after without the sealing flag", c.fetchone()[0] is True)
c.execute("select set_config('amaw.sealing','on',true)")
c.execute("update amaw_lots set purge_after = now() - interval '1 day' where id=%s", (lid,))
cn.commit()

c.execute("select amaw_purge_expired()")
check("the sweep purges an expired lot", c.fetchone()[0] == 1)
c.execute("select count(*) from amaw_lot_data where lot_id=%s", (lid,))
check("...the test data is gone", c.fetchone()[0] == 0)
c.execute("select status, submittal_sha256, submitted_name, purged_at is not null from amaw_lots where id=%s", (lid,))
check("...and the LEDGER ROW SURVIVES, hash and all",
      c.fetchone() == ('Submitted','b'*64,'Jo Cavanah',True))
c.execute("select kind, note from amaw_lot_events where lot_id=%s and kind='purged'", (lid,))
ev = c.fetchall()
check("...with an event saying why", len(ev) == 1 and 'retention' in ev[0][1], ev)
c.execute("select amaw_purge_expired()")
check("the sweep is idempotent", c.fetchone()[0] == 0)
cn.commit()

print("\n=== 6. the summaries view ===")
with As(JO) as cur:
    cur.execute("select lot_number, status, has_data, plant_name from amaw_lot_summaries where id=%s", (lid,))
    check("a purged lot is still listed, and says its data is gone",
          cur.fetchone() == (1,'Submitted',False,'The Allen Company @ Boonesboro'))
with As(OTHER) as cur:
    cur.execute("select count(*) from amaw_lot_summaries where id=%s", (lid,))
    check("the view is security_invoker, so a stranger sees nothing through it",
          cur.fetchone()[0] == 0)

print("\n=== 7. closing a contract out ===")
c.execute("set role authenticated"); c.execute("select set_config('test.uid',%s,true)", (JO,))
lid2 = new_lot(c, LOT % 6, lot_no=2)
c.execute("insert into amaw_lot_data (lot_id, values) values (%s,'{\"a\":1}')", (lid2,))
c.execute("select amaw_seal_lot(%s,'Submitted',%s)", (lid2, 'e'*64))
lid3 = new_lot(c, LOT % 7, lot_no=3)       # still Open
c.execute("insert into amaw_lot_data (lot_id, values) values (%s,'{\"a\":1}')", (lid3,))
cn.commit()
with As(JO) as cur:
    raised, msg = sql_fails(cur, "select amaw_purge_contract('252112')", want='only KYTC')
    check("a contractor cannot close out a contract", raised, msg)
with As(ANDY) as cur:
    cur.execute("select amaw_purge_contract('252112','job finished')")
    n = cur.fetchone()[0]
    check("KYTC closes it out, and only the submitted lot is purged", n == 1, n)
    cur.execute("select count(*) from amaw_lot_data where lot_id=%s", (lid3,))
    check("...an OPEN lot is never purged, however old the contract", cur.fetchone()[0] == 1)

print("\n=== 8. the identity index ===")
with As(JO) as cur:
    raised, msg = sql_fails(cur, "select 1 from amaw_lots", )  # warm
    cur.execute("savepoint s")
    try:
        new_lot(cur, LOT % 8, lot_no=3)     # same six parts as lid3
        cur.execute("release savepoint s"); dup = False
    except Exception as e:
        cur.execute("rollback to savepoint s"); dup = True
    check("a second row for the same lot is refused", dup)
    lid9 = new_lot(cur, LOT % 9, lot_no=3, option='B')
    check("...but the same lot number under the other compaction Option is a different lot", lid9 is not None)

print("\n=== 9. two tabs ===")
c.execute("set role authenticated"); c.execute("select set_config('test.uid',%s,true)", (JO,))
c.execute("select revision from amaw_lot_data where lot_id=%s", (lid3,))
rev = c.fetchone()[0]; cn.commit()
with As(NIGHT) as cur:
    cur.execute("update amaw_lot_data set values='{\"b\":2}', revision=%s where lot_id=%s returning revision", (rev, lid3))
    check("a save carrying the revision it read goes through", cur.fetchone()[0] == rev + 1)
    raised, msg = sql_fails(cur, "update amaw_lot_data set values='{\"c\":3}', revision=%s where lot_id=%s",
                            (rev, lid3), want='stale revision')
    check("...and a second save on the same revision is refused", raised, msg)

cn.close()
print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
