#!/usr/bin/env bash
# ============================================================================
# Two-session concurrency checks for public.complete_external_hire.
#
# LOCAL / DISPOSABLE DATABASE ONLY.
#   DB_CONTAINER=cictrix-integrity-e1aa71a5 DB_NAME=external_hire_test bash external_hire_concurrency.sh
#
# A. Same application, two concurrent sessions: one completes (already_completed: false),
#    the other waits and returns already_completed: true. One employee & one history row.
# B. Two candidates on the same reserved slot: reserved candidate completes,
#    rival waits on slot lock and is refused cleanly (slot_filled_elsewhere / slot_reserved_elsewhere).
# C. Same applicant email across two external applications on different slots:
#    first completes and withdraws the second; second waits on advisory email lock
#    without deadlock and refuses cleanly (not_reserved).
# D. Promotion vs external contention on the same person email / same slot:
#    one consistent winner, zero deadlocks, zero partial appointments.
# ============================================================================
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:?Set DB_CONTAINER to the local Postgres container}"
DB_NAME="${DB_NAME:-external_hire_test}"
HOLD_SECONDS=3
ARRIVE_AFTER_SECONDS=1
HERE="$(cd "$(dirname "$0")" && pwd)"
TAG="extconc$(date +%s)"

psql_run() {
  MSYS_NO_PATHCONV=1 docker exec -i "$DB_CONTAINER" psql -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 -qAt "$@"
}

docker cp "$HERE/external_hire_fixture.sql" "$DB_CONTAINER:/tmp/external_hire_fixture.sql" >/dev/null

FIXTURES="$(psql_run <<SQL
\i /tmp/external_hire_fixture.sql
WITH a AS (SELECT pg_temp.ext_fixture('${TAG}a') AS fx),
     b AS (SELECT pg_temp.ext_fixture('${TAG}b') AS fx),
     c AS (SELECT pg_temp.ext_fixture('${TAG}c') AS fx),
     d AS (SELECT pg_temp.ext_fixture('${TAG}d') AS fx)
SELECT json_build_object('a', a.fx, 'b', b.fx, 'c', c.fx, 'd', d.fx) FROM a, b, c, d;
SQL
)"
FIXTURES="$(printf '%s\n' "$FIXTURES" | tail -n 1)"
field() { node -e 'const f=JSON.parse(process.argv[1]); console.log(f[process.argv[2]][process.argv[3]])' "$FIXTURES" "$1" "$2"; }

A_APP=$(field a app); A_ACTOR=$(field a actor); A_EMAIL=$(field a email_main)
B_APP=$(field b app); B_RIVAL=$(field b rival); B_ACTOR=$(field b actor); B_EMAIL=$(field b email_main); B_RIVAL_EMAIL=$(field b email_rival)
C_APP=$(field c app); C_OTHER=$(field c other_app); C_SLOT8=$(field c slot8); C_ACTOR=$(field c actor); C_EMAIL=$(field c email_main)
D_APP=$(field d app); D_SLOT8=$(field d slot8); D_ACTOR=$(field d actor); D_DEPT=$(field d dept_a); D_EMAIL=$(field d email_main)

# Reserve slot8 for C_OTHER (same email as C_APP on a different slot).
psql_run -c "SELECT public.reserve_plantilla_slot('$C_SLOT8', '$C_OTHER', current_date + 7, 'Report to HR');" >/dev/null

# For D: create an existing employee + portal account + promotional application
# sharing slot D_SLOT (rival promotion vs external? Let's test same slot AND same email!).
# Specifically: D_PROMO is a promotion on D_SLOT8 for an employee whose email matches D_EMAIL?
# Wait: test D1 = promotion + external on same slot (D_PROMO reserved on D_SLOT8, external D_APP_SAME on D_SLOT8)
# AND D2 = external + promotion sharing same person email on D_SLOT8 vs D_APP.
D_EMP_NUM="TEST-EXTD-${TAG}"
D_EMP_UUID="$(psql_run <<SQL
INSERT INTO public.employees (employee_number, first_name, last_name, email, department, "position",
                              division, plantilla_num, date_hired, employment_status, status, user_account_id)
VALUES ('$D_EMP_NUM', 'Ana', 'Reyes', 'promo.${TAG}@example.test', '$D_DEPT', 'Clerk I',
        'Old Div', '1', DATE '2020-01-01', 'Regular', 'Active', gen_random_uuid())
RETURNING id;
SQL
)"
D_PROMO_APP="$(psql_run <<SQL
INSERT INTO public.employee_portal_accounts (id, username, password, employee_id, full_name, email)
VALUES ('acct-${TAG}', 'areyes_${TAG}', 'pw-${TAG}', '$D_EMP_NUM', 'Ana Reyes', 'promo.${TAG}@example.test');
INSERT INTO public.applicants (first_name, last_name, email, address, contact_number, "position", item_number,
                               office, application_type, employee_id, plantilla_slot_id, status)
VALUES ('Ana', 'Reyes', 'promo.${TAG}@example.test', 'Iloilo', '09171119999', 'Administrative Officer I',
        'Plantilla 8', '$D_DEPT', 'promotion', '$D_EMP_NUM', '$D_SLOT8', 'Qualified')
RETURNING id;
SQL
)"
D_EXT_RIVAL_ON_8="$(psql_run <<SQL
INSERT INTO public.applicants (first_name, last_name, gender, email, address, contact_number,
                               "position", item_number, office, application_type, plantilla_slot_id, status)
VALUES ('Marco', 'Lim', 'Male', 'marco.lim.${TAG}@example.test', 'Iloilo', '09171118888',
        'Administrative Officer I', 'Plantilla 8', '$D_DEPT', 'job', '$D_SLOT8', 'Qualified')
RETURNING id;
SQL
)"
psql_run <<SQL >/dev/null
INSERT INTO public.applicant_category_scores (applicant_id, appointment_type, education, experience, performance,
                                              potential, pcpt, written_exam, written_exam_raw_score, is_finalized)
VALUES ('$D_PROMO_APP', 'promotional',
        '{"initialScore": 4, "finalScore": 4, "remarks": ""}', '{"initialScore": 3, "finalScore": 3, "remarks": ""}',
        '{"initialScore": 4, "finalScore": 4, "remarks": ""}', '{"initialScore": 3, "finalScore": 3, "remarks": ""}',
        '{"initialScore": 0, "finalScore": 0, "remarks": ""}', '{"initialScore": 80, "finalScore": 80, "remarks": ""}',
        80, true);
SELECT public.reserve_plantilla_slot('$D_SLOT8', '$D_PROMO_APP', current_date + 7, 'Report to HR');
SQL

call_ext() { # app actor hold_seconds delay_seconds
  psql_run <<SQL 2>&1 | grep -vE '^(SET|BEGIN|COMMIT|ROLLBACK|)$|^\s*$' || true
SELECT pg_sleep($4) \g /dev/null
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', '$2', 'role', 'authenticated')::text, true) \g /dev/null
\set VERBOSITY verbose
SELECT public.complete_external_hire('$1');
SELECT pg_sleep($3) \g /dev/null
COMMIT;
SQL
}

call_promo() { # app actor hold_seconds delay_seconds
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
check() {
  if [ "$2" = "true" ]; then echo "ok: $1"; else echo "FAILED: $1"; failures=$((failures + 1)); fi
}

# ── A. Same application, two sessions ─────────────────────────────────────────
call_ext "$A_APP" "$A_ACTOR" "$HOLD_SECONDS" 0 > /tmp/ext_a1.out &
call_ext "$A_APP" "$A_ACTOR" 0 "$ARRIVE_AFTER_SECONDS" > /tmp/ext_a2.out &
wait
A1="$(cat /tmp/ext_a1.out)"; A2="$(cat /tmp/ext_a2.out)"
echo "A session 1: $A1"
echo "A session 2: $A2"
A_EMP_CNT=$(psql_run -c "SELECT count(*) FROM public.employees WHERE application_id = '$A_APP'")
A_HIST_CNT=$(psql_run -c "SELECT count(*) FROM public.employee_history h JOIN public.employees e ON e.id = h.employee_id WHERE e.application_id = '$A_APP'")
check "A: first session completed" "$(grep -Eq '"already_completed": *false' <<<"$A1" && echo true || echo false)"
check "A: second session reported already_completed" "$(grep -Eq '"already_completed": *true' <<<"$A2" && echo true || echo false)"
check "A: exactly one employee (got $A_EMP_CNT)" "$([ "$A_EMP_CNT" = 1 ] && echo true || echo false)"
check "A: exactly one history row (got $A_HIST_CNT)" "$([ "$A_HIST_CNT" = 1 ] && echo true || echo false)"

# ── B. Two candidates for one slot ────────────────────────────────────────────
call_ext "$B_APP" "$B_ACTOR" "$HOLD_SECONDS" 0 > /tmp/ext_b1.out &
call_ext "$B_RIVAL" "$B_ACTOR" 0 "$ARRIVE_AFTER_SECONDS" > /tmp/ext_b2.out &
wait
B1="$(cat /tmp/ext_b1.out)"; B2="$(cat /tmp/ext_b2.out)"
echo "B session 1: $B1"
echo "B session 2: $B2"
B_RIVAL_EMP=$(psql_run -c "SELECT count(*) FROM public.employees WHERE application_id = '$B_RIVAL'")
check "B: reserved candidate completed" "$(grep -Eq '"already_completed": *false' <<<"$B1" && echo true || echo false)"
check "B: rival refused without deadlock" "$(grep -Eq 'slot_filled_elsewhere|slot_reserved_elsewhere' <<<"$B2" && ! grep -qi deadlock <<<"$B2" && echo true || echo false)"
check "B: rival created 0 employees (got $B_RIVAL_EMP)" "$([ "$B_RIVAL_EMP" = 0 ] && echo true || echo false)"

# ── C. Same person email across two different slots ───────────────────────────
call_ext "$C_APP" "$C_ACTOR" "$HOLD_SECONDS" 0 > /tmp/ext_c1.out &
call_ext "$C_OTHER" "$C_ACTOR" 0 "$ARRIVE_AFTER_SECONDS" > /tmp/ext_c2.out &
wait
C1="$(cat /tmp/ext_c1.out)"; C2="$(cat /tmp/ext_c2.out)"
echo "C session 1: $C1"
echo "C session 2: $C2"
C_EMP_CNT=$(psql_run -c "SELECT count(*) FROM public.employees WHERE lower(email) = lower('$C_EMAIL')")
check "C: first application completed" "$(grep -Eq '"already_completed": *false' <<<"$C1" && echo true || echo false)"
check "C: second application refused without deadlock" "$(grep -q 'not_reserved' <<<"$C2" && ! grep -qi deadlock <<<"$C2" && echo true || echo false)"
check "C: exactly one employee for email (got $C_EMP_CNT)" "$([ "$C_EMP_CNT" = 1 ] && echo true || echo false)"

# ── D. Promotion vs external contention on the same slot ──────────────────────
call_promo "$D_PROMO_APP" "$D_ACTOR" "$HOLD_SECONDS" 0 > /tmp/ext_d1.out &
call_ext "$D_EXT_RIVAL_ON_8" "$D_ACTOR" 0 "$ARRIVE_AFTER_SECONDS" > /tmp/ext_d2.out &
wait
D1="$(cat /tmp/ext_d1.out)"; D2="$(cat /tmp/ext_d2.out)"
echo "D session 1 (promo): $D1"
echo "D session 2 (ext):   $D2"
D_EXT_EMP=$(psql_run -c "SELECT count(*) FROM public.employees WHERE application_id = '$D_EXT_RIVAL_ON_8'")
check "D: promotion completed" "$(grep -Eq '"already_completed": *false' <<<"$D1" && echo true || echo false)"
check "D: external rival refused without deadlock" "$(grep -Eq 'slot_filled_elsewhere|slot_reserved_elsewhere' <<<"$D2" && ! grep -qi deadlock <<<"$D2" && echo true || echo false)"
check "D: external rival created 0 employees (got $D_EXT_EMP)" "$([ "$D_EXT_EMP" = 0 ] && echo true || echo false)"

# ── Clean up committed fixtures ───────────────────────────────────────────────
psql_run <<SQL >/dev/null
DELETE FROM public.employee_history WHERE employee_id IN (
  SELECT id FROM public.employees WHERE email ILIKE '%.${TAG}_@example.test' OR employee_number = '$D_EMP_NUM'
);
UPDATE public.plantilla_slots SET status = 'open', filled_by_applicant_id = NULL, filled_at = NULL, reserved_by_applicant_id = NULL
 WHERE job_posting_id IN (SELECT id FROM public.job_postings WHERE department ILIKE 'Ext Office A ${TAG}_');
DELETE FROM public.applicants WHERE email ILIKE '%.${TAG}_@example.test' OR email IN ('promo.${TAG}@example.test', 'marco.lim.${TAG}@example.test');
DELETE FROM public.job_postings WHERE department ILIKE 'Ext Office A ${TAG}_';
DELETE FROM public.employee_portal_accounts WHERE id = 'acct-${TAG}';
DELETE FROM public.employees WHERE email ILIKE '%.${TAG}_@example.test' OR employee_number = '$D_EMP_NUM';
DELETE FROM public.user_roles WHERE email ILIKE 'rsp.${TAG}_@example.test';
DELETE FROM public.departments WHERE name ILIKE 'Ext Office % ${TAG}_';
SQL

if [ "$failures" -gt 0 ]; then
  echo "CONCURRENCY TESTS FAILED: $failures check(s)"
  exit 1
fi
echo "ALL EXTERNAL HIRE CONCURRENCY TESTS PASSED"
