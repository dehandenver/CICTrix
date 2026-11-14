#!/usr/bin/env bash
# ============================================================================
# Two-session concurrency checks for public.complete_promotional_appointment.
#
# LOCAL DATABASE ONLY. Unlike promotional_appointment.test.sql this must
# commit (a second session cannot see uncommitted rows), so it writes
# synthetic fixtures and deletes them again at the end.
#
#   DB_CONTAINER=supabase_db_<project_id> bash promotional_appointment_concurrency.sh
#
# A. Two sessions complete the same application at once: one completes it,
#    the other waits and gets already_completed = true. One history row.
# B. Two sessions complete two different promotions of the same employee at
#    once: the first completes, the second waits on the employee (no deadlock)
#    and is refused, because completing the first withdrew the second.
# ============================================================================
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:?Set DB_CONTAINER to the local Supabase database container}"
# How long session 1 holds its transaction open, and how long session 2 waits
# before calling, so session 2 is guaranteed to arrive while session 1 holds
# its locks.
HOLD_SECONDS=3
ARRIVE_AFTER_SECONDS=1
HERE="$(cd "$(dirname "$0")" && pwd)"
TAG="conc$(date +%s)"

psql_run() {
  MSYS_NO_PATHCONV=1 docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt "$@"
}

docker cp "$HERE/promotional_appointment_fixture.sql" "$DB_CONTAINER:/tmp/promotional_appointment_fixture.sql" >/dev/null

# Build and commit two fixtures. For B, reserve Plantilla 8 for the employee's
# second application and give it a complete assessment.
FIXTURES="$(psql_run <<SQL
\i /tmp/promotional_appointment_fixture.sql
WITH a AS (SELECT pg_temp.fixture('${TAG}a') AS fx), b AS (SELECT pg_temp.fixture('${TAG}b') AS fx)
SELECT json_build_object('a', a.fx, 'b', b.fx) FROM a, b;
SQL
)"
FIXTURES="$(printf '%s\n' "$FIXTURES" | tail -n 1)"
field() { node -e 'const f=JSON.parse(process.argv[1]); console.log(f[process.argv[2]][process.argv[3]])' "$FIXTURES" "$1" "$2"; }

A_APP=$(field a app);   A_ACTOR=$(field a actor);   A_EMP=$(field a employee)
B_APP=$(field b app);   B_OTHER=$(field b other_app); B_ACTOR=$(field b actor); B_EMP=$(field b employee)
B_SLOT8=$(field b slot8)

psql_run <<SQL >/dev/null
SELECT public.reserve_plantilla_slot('$B_SLOT8', '$B_OTHER', current_date + 7, 'Report to HR');
INSERT INTO public.applicant_category_scores (applicant_id, appointment_type, education, experience, performance,
                                              potential, pcpt, written_exam, written_exam_raw_score, is_finalized)
SELECT '$B_OTHER', appointment_type, education, experience, performance, potential, pcpt, written_exam,
       written_exam_raw_score, is_finalized
  FROM public.applicant_category_scores WHERE applicant_id = '$B_APP';
SQL

# One session: complete an application as an authenticated RSP user. With a
# hold, it keeps the transaction open after the call; with a delay, it waits
# before calling. Prints the result JSON, or ERROR:<hint>.
complete_as() { # app actor hold_seconds delay_seconds
  psql_run <<SQL 2>&1 | grep -vE '^(SET|BEGIN|COMMIT|ROLLBACK|)$|^\s*$' || true
SELECT pg_sleep($4) \g /dev/null
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', '$2', 'role', 'authenticated')::text, true) \g /dev/null
\set VERBOSITY verbose
SELECT public.complete_promotional_appointment('$1');
SELECT pg_sleep($3) \g /dev/null
COMMIT;
SQL
}

failures=0
check() { # label condition_ok
  if [ "$2" = "true" ]; then echo "ok: $1"; else echo "FAILED: $1"; failures=$((failures + 1)); fi
}

# ── A. Same application, two sessions ──────────────────────────────────────
complete_as "$A_APP" "$A_ACTOR" "$HOLD_SECONDS" 0 > /tmp/promo_a1.out &
complete_as "$A_APP" "$A_ACTOR" 0 "$ARRIVE_AFTER_SECONDS" > /tmp/promo_a2.out &
wait
A1="$(cat /tmp/promo_a1.out)"; A2="$(cat /tmp/promo_a2.out)"
echo "A session 1: $A1"
echo "A session 2: $A2"
A_HISTORY=$(psql_run -c "SELECT count(*) FROM public.employee_history WHERE employee_id = '$A_EMP' AND action = 'promoted'")
check "A: first session completed" "$(grep -Eq '"already_completed": *false' <<<"$A1" && echo true || echo false)"
check "A: second session reported already completed" "$(grep -Eq '"already_completed": *true' <<<"$A2" && echo true || echo false)"
check "A: exactly one history row (got $A_HISTORY)" "$([ "$A_HISTORY" = 1 ] && echo true || echo false)"

# ── B. Same employee, two promotions, two sessions ─────────────────────────
complete_as "$B_APP" "$B_ACTOR" "$HOLD_SECONDS" 0 > /tmp/promo_b1.out &
complete_as "$B_OTHER" "$B_ACTOR" 0 "$ARRIVE_AFTER_SECONDS" > /tmp/promo_b2.out &
wait
B1="$(cat /tmp/promo_b1.out)"; B2="$(cat /tmp/promo_b2.out)"
echo "B session 1: $B1"
echo "B session 2: $B2"
B_HISTORY=$(psql_run -c "SELECT count(*) FROM public.employee_history WHERE employee_id = '$B_EMP' AND action = 'promoted'")
B_PLANTILLA=$(psql_run -c "SELECT plantilla_num FROM public.employees WHERE id = '$B_EMP'")
check "B: first promotion completed" "$(grep -Eq '"already_completed": *false' <<<"$B1" && echo true || echo false)"
check "B: second promotion refused without a deadlock" "$(grep -q 'not_reserved' <<<"$B2" && ! grep -qi deadlock <<<"$B2" && echo true || echo false)"
check "B: one history row (got $B_HISTORY)" "$([ "$B_HISTORY" = 1 ] && echo true || echo false)"
check "B: employee holds Plantilla 7 (got $B_PLANTILLA)" "$([ "$B_PLANTILLA" = 7 ] && echo true || echo false)"

# ── Clean up the committed fixtures ────────────────────────────────────────
psql_run <<SQL >/dev/null
DELETE FROM public.employee_history WHERE employee_id IN ('$A_EMP', '$B_EMP');
UPDATE public.plantilla_slots SET status = 'open', reserved_by_applicant_id = NULL
 WHERE job_posting_id IN (SELECT job_posting_id FROM public.plantilla_slots
                           WHERE filled_by_applicant_id IN ('$A_APP', '$B_APP')
                              OR reserved_by_applicant_id = '$B_OTHER');
DELETE FROM public.applicants WHERE email ILIKE '%.${TAG}_@example.test';
DELETE FROM public.job_postings WHERE department ILIKE 'New Office ${TAG}_';
DELETE FROM public.employee_portal_accounts WHERE employee_id ILIKE 'TEST-${TAG}_';
DELETE FROM public.employees WHERE employee_number ILIKE 'TEST-${TAG}_';
DELETE FROM public.user_roles WHERE email ILIKE 'rsp.${TAG}_@example.test';
DELETE FROM public.departments WHERE name ILIKE '% Office ${TAG}_';
SQL

if [ "$failures" -gt 0 ]; then
  echo "CONCURRENCY TESTS FAILED: $failures check(s)"
  exit 1
fi
echo "ALL PROMOTIONAL APPOINTMENT CONCURRENCY TESTS PASSED"
