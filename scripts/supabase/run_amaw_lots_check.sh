#!/bin/bash
# Rebuild a scratch Postgres database from the two SQL files and run the
# impersonation tests. NOT against the live project - this inserts, seals and
# purges. See check_amaw_lots.py's docstring.
#
#   PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres ./scripts/supabase/run_amaw_lots_check.sh
#
# PERTURB="<sql>" runs one extra statement after the schema, which is how you
# watch the checks fail:
#   PERTURB="drop trigger amaw_lots_guard_trg on amaw_lots;" ./run_amaw_lots_check.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
DB="${AMAW_TEST_DB:-mixtest}"
PSQL="${PSQL:-psql} -q -v ON_ERROR_STOP=1"

$PSQL -d postgres -c "drop database if exists $DB" >/dev/null 2>&1
$PSQL -d postgres -c "create database $DB"         >/dev/null 2>&1
$PSQL -d "$DB" -f "$HERE/amaw_lots_fixture.sql"    2>&1 | grep -iv notice
$PSQL -d "$DB" -f "$ROOT/supabase/amaw_lots.sql"   2>&1 | grep -iv notice
[ -n "${PERTURB:-}" ] && ${PSQL% -v*} -d "$DB" -c "$PERTURB" 2>&1 | grep -iv notice
AMAW_TEST_DSN="${AMAW_TEST_DSN:-dbname=$DB}" python3 "$HERE/check_amaw_lots.py"
