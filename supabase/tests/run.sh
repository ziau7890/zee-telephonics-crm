#!/usr/bin/env bash
# Applies all migrations to a throwaway PostgreSQL database and runs the SQL tests.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="zt_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f supabase/tests/auth_stub.sql >/dev/null
for f in supabase/migrations/*.sql; do
  psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
done
for t in supabase/tests/*_test.sql; do
  psql -d "$DB" -v ON_ERROR_STOP=1 -q -t -f "$t"
done
