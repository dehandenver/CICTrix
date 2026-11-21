#!/usr/bin/env bash
# ============================================================================
# Two-session concurrency checks for public.save_pds_section.
#
# LOCAL DATABASE ONLY. Unlike pds_section_transactions.test.sql this commits
# synthetic fixtures and deletes them again at the end.
#
#   DB_CONTAINER=cictrix-integrity-<id> \
#   DB_NAME=integrity_repairs \
#   bash pds_section_concurrency.sh
#
# DB_NAME defaults to the plan's isolated database, integrity_repairs.
#
# Scenario: two anonymous-portal sessions load the same children revision.
# Session 1 saves a child edit plus a family scalar, records an advisory
# marker, and holds its transaction open. Session 2 starts only after that
# marker is visible, so it is guaranteed to contend with the live save. It
# waits on the employee row lock, then must receive pds_revision_conflict
# (SQLSTATE 40001). Exactly one save succeeds, the loser changes nothing, and
# the final child ID and revision must match session 1's canonical snapshot.
# ============================================================================
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:?Set DB_CONTAINER to the local Supabase database container}"
DB_NAME="${DB_NAME:-integrity_repairs}"

if [[ ! "$DB_NAME" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "FAILED: DB_NAME must be a simple PostgreSQL identifier" >&2
  exit 1
fi

HOLD_SECONDS=8
TAG="pdsconc$(date +%s)-$$"
TMP_BASE="${TMPDIR:-/tmp}"
OUT1="$(mktemp "$TMP_BASE/pds-conc-${TAG}-1.XXXXXX")"
OUT2="$(mktemp "$TMP_BASE/pds-conc-${TAG}-2.XXXXXX")"
EMP=""

psql_run() {
  MSYS_NO_PATHCONV=1 docker exec -i "$DB_CONTAINER" \
    psql -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 -qAt "$@"
}

cleanup() {
  rm -f "$OUT1" "$OUT2"
  if [ -n "$EMP" ]; then
    psql_run <<SQL >/dev/null 2>&1 || true
delete from public.employees where id = '$EMP';
SQL
  fi
}
trap cleanup EXIT

# ---- Fixture ---------------------------------------------------------------
# Build one synthetic employee and one child without assuming whether this
# database uses employee_id/full_name or employee_number/first_name/last_name.
EMP="$(psql_run <<SQL
CREATE FUNCTION pg_temp.make_employee(p_tag text) RETURNS uuid
LANGUAGE plpgsql AS \$\$
DECLARE
  v_id uuid;
  v_cols text[] := array['email'];
  v_vals text[] := array[format('%L', 'pds-fixture-' || p_tag)];
  v_has_employee_number boolean;
  v_has_employee_id boolean;
  v_has_first_name boolean;
  v_has_last_name boolean;
  v_has_full_name boolean;
  v_full_name_not_null boolean;
  v_has_department boolean;
  v_has_position boolean;
  v_sql text;
BEGIN
  SELECT
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='employees' AND column_name='employee_number'),
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='employees' AND column_name='employee_id'),
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='employees' AND column_name='first_name'),
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='employees' AND column_name='last_name'),
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='employees' AND column_name='full_name'),
    COALESCE((SELECT is_nullable = 'NO' FROM information_schema.columns
               WHERE table_schema='public' AND table_name='employees' AND column_name='full_name'), false),
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='employees' AND column_name='department'),
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='employees' AND column_name='position')
  INTO v_has_employee_number, v_has_employee_id, v_has_first_name,
       v_has_last_name, v_has_full_name, v_full_name_not_null,
       v_has_department, v_has_position;

  IF v_has_employee_number THEN
    v_cols := array_append(v_cols, 'employee_number');
    v_vals := array_append(v_vals, format('%L', 'PDS-' || p_tag));
  END IF;
  IF v_has_employee_id THEN
    v_cols := array_append(v_cols, 'employee_id');
    v_vals := array_append(v_vals, format('%L', 'PDS-ID-' || p_tag));
  END IF;
  IF v_has_first_name THEN
    v_cols := array_append(v_cols, 'first_name');
    v_vals := array_append(v_vals, quote_literal('PDS First ' || p_tag));
  END IF;
  IF v_has_last_name THEN
    v_cols := array_append(v_cols, 'last_name');
    v_vals := array_append(v_vals, quote_literal('PDS Last ' || p_tag));
  END IF;
  IF v_has_full_name AND v_full_name_not_null THEN
    v_cols := array_append(v_cols, 'full_name');
    v_vals := array_append(v_vals, quote_literal('PDS Fixture ' || p_tag));
  END IF;
  -- Live-shaped employees require these without defaults; older local dumps
  -- may not have them at all. Synthetic labels only.
  IF v_has_department THEN
    v_cols := array_append(v_cols, 'department');
    v_vals := array_append(v_vals, quote_literal('PDS Department ' || p_tag));
  END IF;
  IF v_has_position THEN
    v_cols := array_append(v_cols, '"position"');
    v_vals := array_append(v_vals, quote_literal('PDS Position ' || p_tag));
  END IF;

  v_sql := format('insert into public.employees (%s) values (%s) returning id',
                  array_to_string(v_cols, ', '), array_to_string(v_vals, ', '));
  EXECUTE v_sql INTO v_id;
  RETURN v_id;
END \$\$;

DO \$\$
DECLARE
  v_employee uuid;
BEGIN
  v_employee := pg_temp.make_employee('$TAG');
  UPDATE public.employees
     SET spouse_surname = 'Original Spouse'
   WHERE id = v_employee;
  INSERT INTO public.employee_children (employee_id, full_name, sort_order)
  VALUES (v_employee, 'Original Child', 0);
END \$\$;

SELECT id FROM public.employees WHERE email = 'pds-fixture-$TAG';
SQL
)"

if [ -z "$EMP" ]; then
  echo "FAILED: fixture employee was not created" >&2
  exit 1
fi

READ="$(psql_run <<SQL
SELECT public.read_pds_section('$EMP', 'children');
SQL
)"
REV="$(node -e 'console.log(JSON.parse(process.argv[1]).revision)' "$READ")"
CHILD_ID="$(node -e 'console.log(JSON.parse(process.argv[1]).rows[0].id)' "$READ")"

# ---- Two anonymous sessions -------------------------------------------------
# Session 1 saves, then records an advisory marker inside the same transaction
# and holds it open. No commit happens until after the marker and hold.
save_winner() {
  psql_run <<SQL 2>&1 | grep -vE '^(SET|BEGIN|COMMIT|ROLLBACK|)$|^\s*$' > "$OUT1" || true
SET application_name = 'pds_conc_winner';
BEGIN;
SET LOCAL ROLE anon;
SELECT public.save_pds_section(
  '$EMP',
  'children',
  jsonb_build_array(jsonb_build_object(
    'id', '$CHILD_ID',
    'full_name', 'Session One Child'
  )),
  '$REV',
  jsonb_build_object('spouse_surname', 'Spouse Session One Child')
);
SELECT pg_advisory_xact_lock(hashtext('pds-conc-$TAG'));
SELECT pg_sleep($HOLD_SECONDS) \g /dev/null
COMMIT;
SQL
}

save_loser() {
  psql_run <<SQL 2>&1 | grep -vE '^(SET|BEGIN|COMMIT|ROLLBACK|)$|^\s*$' > "$OUT2" || true
SET application_name = 'pds_conc_loser';
BEGIN;
SET LOCAL ROLE anon;
SELECT public.save_pds_section(
  '$EMP',
  'children',
  jsonb_build_array(jsonb_build_object(
    'id', '$CHILD_ID',
    'full_name', 'Session Two Child'
  )),
  '$REV',
  jsonb_build_object('spouse_surname', 'Spouse Session Two Child')
);
COMMIT;
SQL
}

save_winner &
PID1=$!

# Wait until session 1 has completed the save and is holding the transaction
# open. The advisory lock is our marker; it is released only by COMMIT/ROLLBACK.
MARKED=0
for _ in {1..100}; do
  MARKED="$(psql_run <<SQL
select count(*)
  from pg_locks l
  join pg_stat_activity a on a.pid = l.pid
 where a.application_name = 'pds_conc_winner'
   and l.locktype = 'advisory'
   and l.granted;
SQL
)"
  if [ "$MARKED" != "0" ]; then break; fi
  sleep 0.1
done

if [ "$MARKED" = "0" ]; then
  wait "$PID1" || true
  echo "FAILED: winner never reached the held-transaction marker" >&2
  exit 1
fi

save_loser &
PID2=$!

# Prove contention: the loser must be visibly waiting on a lock while the
# winner still holds its transaction. This is not inferred from a sleep.
BLOCKED=0
for _ in {1..100}; do
  BLOCKED="$(psql_run <<SQL
select count(*)
  from pg_stat_activity
 where application_name = 'pds_conc_loser'
   and wait_event_type = 'Lock'
   and query ilike '%save_pds_section%';
SQL
)"
  if [ "$BLOCKED" != "0" ]; then break; fi
  sleep 0.1
done

wait "$PID1" || true
wait "$PID2" || true

OUT1_TEXT="$(cat "$OUT1")"
OUT2_TEXT="$(cat "$OUT2")"
FAILURES=0

check() { # label condition
  if [ "$2" = "true" ]; then
    echo "ok: $1"
  else
    echo "FAILED: $1"
    FAILURES=$((FAILURES + 1))
  fi
}

check "loser was observed blocked on a lock during the live save" \
  "$([ "$BLOCKED" != "0" ] && echo true || echo false)"

check "winner returned a canonical snapshot" \
  "$(printf '%s' "$OUT1_TEXT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(String(Boolean(j.revision && Array.isArray(j.rows) && j.rows[0] && j.rows[0].id))) }catch{process.stdout.write("false")}})')"

check "winner kept the loaded child id" \
  "$(printf '%s' "$OUT1_TEXT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(String(j.rows[0].id === process.argv[1]))}catch{process.stdout.write("false")}})' "$CHILD_ID")"

check "loser returned a revision conflict" \
  "$(printf '%s' "$OUT2_TEXT" | grep -q 'pds_revision_conflict' && echo true || echo false)"

check "loser did not return a snapshot" \
  "$(printf '%s' "$OUT2_TEXT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{JSON.parse(s);process.stdout.write("false")}catch{process.stdout.write("true")}})')"

WINNER_ID="$(printf '%s' "$OUT1_TEXT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.rows[0].id)})')"
WINNER_REV="$(printf '%s' "$OUT1_TEXT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.revision)})')"

FINAL="$(psql_run <<SQL
SELECT jsonb_build_object(
  'child_count', (SELECT count(*) FROM public.employee_children WHERE employee_id = '$EMP'),
  'child_id', (SELECT id FROM public.employee_children WHERE employee_id = '$EMP'),
  'child_name', (SELECT full_name FROM public.employee_children WHERE employee_id = '$EMP'),
  'spouse', (SELECT spouse_surname FROM public.employees WHERE id = '$EMP'),
  'revision', (public.read_pds_section('$EMP', 'children') ->> 'revision')
);
SQL
)"

check "exactly one child row remains" \
  "$(node -e 'const f=JSON.parse(process.argv[1]); console.log(f.child_count===1)' "$FINAL")"
check "winner child id is the final and loaded id" \
  "$(node -e 'const f=JSON.parse(process.argv[1]); console.log(f.child_id===process.argv[2] && f.child_id===process.argv[3])' "$FINAL" "$CHILD_ID" "$WINNER_ID")"
check "winner child edit won" \
  "$(node -e 'const f=JSON.parse(process.argv[1]); console.log(f.child_name==="Session One Child")' "$FINAL")"
check "winner family scalar won" \
  "$(node -e 'const f=JSON.parse(process.argv[1]); console.log(f.spouse==="Spouse Session One Child")' "$FINAL")"
check "winner revision is the final canonical revision" \
  "$(node -e 'const f=JSON.parse(process.argv[1]); console.log(f.revision===process.argv[2])' "$FINAL" "$WINNER_REV")"

if [ "$FAILURES" -ne 0 ]; then
  echo "FAILED: $FAILURES concurrency check(s)" >&2
  exit 1
fi

echo "ALL PDS SECTION CONCURRENCY TESTS PASSED"
