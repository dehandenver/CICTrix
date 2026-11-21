#!/usr/bin/env bash
# ============================================================================
# Two-session concurrency checks for Task 7A portal account constraints and
# public.reset_employee_portal_password.
#
# LOCAL / DISPOSABLE DATABASE ONLY.
#   DB_CONTAINER=cictrix-integrity-e1aa71a5 DB_NAME=external_hire_test bash supabase/tests/portal_account_lifecycle_concurrency.sh
#
# 1. Two concurrent account-create contenders for the same employee_id ->
#    one winner, one 23505, one active row.
# 2. Two concurrent account-create contenders for the same case-folded username
#    by different employees -> one winner, one 23505, winner's employee_id kept.
# 3. Two concurrent reset_employee_portal_password calls on the same revision ->
#    one winner (OK), one 40001 (revision_conflict), one audit row.
# 4. Two concurrent/replayed reset_employee_portal_password calls sharing
#    p_request_id -> one winner, one 23505 (duplicate_request_id), no second reset.
# ============================================================================
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:?Set DB_CONTAINER to the local Postgres container}"
DB_NAME="${DB_NAME:-external_hire_test}"
HOLD_SECONDS=2
ARRIVE_AFTER_SECONDS=1
TAG="palconc$(date +%s)"

psql_run() {
  MSYS_NO_PATHCONV=1 docker exec -i "$DB_CONTAINER" psql -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 -qAt "$@"
}

ACTOR_ID="$(psql_run -c "SELECT gen_random_uuid();")"
REV_RESET="$(psql_run <<SQL
INSERT INTO public.user_roles (user_id, email, role, name, is_active)
VALUES ('$ACTOR_ID', 'rsp.${TAG}@example.test', 'RSP', 'Concurrency RSP', true);
INSERT INTO public.employee_portal_accounts (id, username, password, employee_id, full_name)
VALUES ('acct-${TAG}-r1', 'user.r1.${TAG}', 'InitialPass1!', 'EMP-${TAG}-R1', 'Reset One')
RETURNING updated_at;
SQL
)"
REV_REQ2="$(psql_run <<SQL
INSERT INTO public.employee_portal_accounts (id, username, password, employee_id, full_name)
VALUES ('acct-${TAG}-r2', 'user.r2.${TAG}', 'InitialPass2!', 'EMP-${TAG}-R2', 'Reset Two')
RETURNING updated_at;
SQL
)"
REQ_SHARED="$(psql_run -c "SELECT gen_random_uuid();")"
REQ_R1A="$(psql_run -c "SELECT gen_random_uuid();")"
REQ_R1B="$(psql_run -c "SELECT gen_random_uuid();")"

insert_acct() { # id username emp_id hold_seconds delay_seconds
  psql_run <<SQL 2>&1 | grep -vE '^(SET|BEGIN|COMMIT|ROLLBACK|)$|^\s*$' || true
SELECT pg_sleep($5) \g /dev/null
BEGIN;
\set VERBOSITY verbose
INSERT INTO public.employee_portal_accounts (id, username, password, employee_id, full_name, must_change_password)
VALUES ('$1', '$2', 'TempPass1!', '$3', 'Contender', true)
RETURNING id, employee_id;
SELECT pg_sleep($4) \g /dev/null
COMMIT;
SQL
}

call_reset() { # acct_id emp_no expected_ts new_pw req_id hold_seconds delay_seconds
  psql_run <<SQL 2>&1 | grep -vE '^(SET|BEGIN|COMMIT|ROLLBACK|)$|^\s*$' || true
SELECT pg_sleep($7) \g /dev/null
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', '$ACTOR_ID', 'role', 'authenticated')::text, true) \g /dev/null
\set VERBOSITY verbose
SELECT public.reset_employee_portal_password('$1', '$2', '$3'::timestamptz, '$4', NULL, '$5'::uuid);
SELECT pg_sleep($6) \g /dev/null
COMMIT;
SQL
}

failures=0
check() {
  if [ "$2" = "true" ]; then echo "ok: $1"; else echo "FAILED: $1"; failures=$((failures + 1)); fi
}

# ── 1. Concurrent account-create for same employee_id ─────────────────────────
insert_acct "acct-${TAG}-e1" "empdup1.${TAG}" "EMP-${TAG}-E" "$HOLD_SECONDS" 0 > /tmp/pal_1a.out &
insert_acct "acct-${TAG}-e2" "empdup2.${TAG}" " EMP-${TAG}-E " 0 "$ARRIVE_AFTER_SECONDS" > /tmp/pal_1b.out &
wait
O1A="$(cat /tmp/pal_1a.out)"; O1B="$(cat /tmp/pal_1b.out)"
echo "1a: $O1A"
echo "1b: $O1B"
CNT1=$(psql_run -c "SELECT count(*) FROM public.employee_portal_accounts WHERE deleted_at IS NULL AND btrim(employee_id) = 'EMP-${TAG}-E'")
check "1: first insert won" "$(grep -q "acct-${TAG}-e1" <<<"$O1A" && echo true || echo false)"
check "1: second insert failed with 23505" "$(grep -q '23505' <<<"$O1B" && echo true || echo false)"
check "1: exactly one active row (got $CNT1)" "$([ "$CNT1" = 1 ] && echo true || echo false)"

# ── 2. Concurrent account-create for same case-folded username ────────────────
insert_acct "acct-${TAG}-u1" "SameName.${TAG}" "EMP-${TAG}-U1" "$HOLD_SECONDS" 0 > /tmp/pal_2a.out &
insert_acct "acct-${TAG}-u2" " samename.${TAG} " "EMP-${TAG}-U2" 0 "$ARRIVE_AFTER_SECONDS" > /tmp/pal_2b.out &
wait
O2A="$(cat /tmp/pal_2a.out)"; O2B="$(cat /tmp/pal_2b.out)"
echo "2a: $O2A"
echo "2b: $O2B"
WINNER_EMP=$(psql_run -c "SELECT employee_id FROM public.employee_portal_accounts WHERE deleted_at IS NULL AND lower(btrim(username)) = lower('SameName.${TAG}')")
check "2: first username insert won" "$(grep -q "acct-${TAG}-u1" <<<"$O2A" && echo true || echo false)"
check "2: second username insert failed with 23505" "$(grep -q '23505' <<<"$O2B" && echo true || echo false)"
check "2: winner employee_id preserved (got $WINNER_EMP)" "$([ "$WINNER_EMP" = "EMP-${TAG}-U1" ] && echo true || echo false)"

# ── 3. Concurrent reset_employee_portal_password on same revision ─────────────
call_reset "acct-${TAG}-r1" "EMP-${TAG}-R1" "$REV_RESET" "WinnerPass1!" "$REQ_R1A" "$HOLD_SECONDS" 0 > /tmp/pal_3a.out &
call_reset "acct-${TAG}-r1" "EMP-${TAG}-R1" "$REV_RESET" "LoserPass2!" "$REQ_R1B" 0 "$ARRIVE_AFTER_SECONDS" > /tmp/pal_3b.out &
wait
O3A="$(cat /tmp/pal_3a.out)"; O3B="$(cat /tmp/pal_3b.out)"
echo "3a: $O3A"
echo "3b: $O3B"
AUDIT3=$(psql_run -c "SELECT count(*) FROM public.employee_password_resets WHERE account_id = 'acct-${TAG}-r1'")
PW3=$(psql_run -c "SELECT password FROM public.employee_portal_accounts WHERE id = 'acct-${TAG}-r1'")
check "3: first reset succeeded" "$(grep -q '"must_change_password": true' <<<"$O3A" && echo true || echo false)"
check "3: second reset rejected 40001 revision_conflict" "$(grep -q '40001' <<<"$O3B" && grep -q 'revision_conflict' <<<"$O3B" && echo true || echo false)"
check "3: exactly one audit row (got $AUDIT3)" "$([ "$AUDIT3" = 1 ] && echo true || echo false)"
check "3: winning password kept" "$([ "$PW3" = "WinnerPass1!" ] && echo true || echo false)"

# ── 4. Concurrent & replayed reset_employee_portal_password with same p_request_id
REV_R1_AFTER="$(psql_run -c "SELECT updated_at FROM public.employee_portal_accounts WHERE id = 'acct-${TAG}-r1'")"
call_reset "acct-${TAG}-r1" "EMP-${TAG}-R1" "$REV_R1_AFTER" "SharedFirst1!" "$REQ_SHARED" "$HOLD_SECONDS" 0 > /tmp/pal_4a.out &
call_reset "acct-${TAG}-r2" "EMP-${TAG}-R2" "$REV_REQ2" "SharedSecond2!" "$REQ_SHARED" 0 "$ARRIVE_AFTER_SECONDS" > /tmp/pal_4b.out &
wait
O4A="$(cat /tmp/pal_4a.out)"; O4B="$(cat /tmp/pal_4b.out)"
echo "4a (concurrent req_id 1): $O4A"
echo "4b (concurrent req_id 2): $O4B"
PW_R2=$(psql_run -c "SELECT password FROM public.employee_portal_accounts WHERE id = 'acct-${TAG}-r2'")
REV_R1_AFTER2="$(psql_run -c "SELECT updated_at FROM public.employee_portal_accounts WHERE id = 'acct-${TAG}-r1'")"
O4C="$(call_reset "acct-${TAG}-r1" "EMP-${TAG}-R1" "$REV_R1_AFTER2" "ReplayThird3!" "$REQ_SHARED" 0 0)"
echo "4c (sequential replay same req_id): $O4C"
PW_R1=$(psql_run -c "SELECT password FROM public.employee_portal_accounts WHERE id = 'acct-${TAG}-r1'")
AUDIT_SHARED=$(psql_run -c "SELECT count(*) FROM public.employee_password_resets WHERE request_id = '$REQ_SHARED'::uuid")
check "4: first request_id reset succeeded" "$(grep -q '"must_change_password": true' <<<"$O4A" && echo true || echo false)"
check "4: concurrent duplicate request_id failed 23505" "$(grep -q '23505' <<<"$O4B" && echo true || echo false)"
check "4: second account password rolled back untouched" "$([ "$PW_R2" = "InitialPass2!" ] && echo true || echo false)"
check "4: sequential replay same request_id failed 23505" "$(grep -q '23505' <<<"$O4C" && echo true || echo false)"
check "4: first account password unchanged on replay" "$([ "$PW_R1" = "SharedFirst1!" ] && echo true || echo false)"
check "4: exactly one audit row for shared request_id (got $AUDIT_SHARED)" "$([ "$AUDIT_SHARED" = 1 ] && echo true || echo false)"

# ── Cleanup ───────────────────────────────────────────────────────────────────
psql_run <<SQL >/dev/null
DELETE FROM public.employee_password_resets WHERE account_id LIKE 'acct-${TAG}%' OR request_id IN ('$REQ_SHARED'::uuid, '$REQ_R1A'::uuid, '$REQ_R1B'::uuid);
DELETE FROM public.employee_portal_accounts WHERE id LIKE 'acct-${TAG}%';
DELETE FROM public.user_roles WHERE user_id = '$ACTOR_ID'::uuid;
SQL

if [ "$failures" -gt 0 ]; then
  echo "CONCURRENCY TESTS FAILED: $failures check(s)"
  exit 1
fi
echo "ALL PORTAL ACCOUNT LIFECYCLE CONCURRENCY TESTS PASSED"
