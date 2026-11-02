-- ============================================================================
-- Tests for public.complete_promotional_appointment (the promotion-only
-- appointment transaction).
--
-- Run against a LOCAL or preview database only, as the postgres role:
--   psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f promotional_appointment.test.sql
-- Everything happens inside one transaction that ends in ROLLBACK, so it
-- leaves no data behind. It builds its own synthetic fixtures and never reads
-- existing records. Success prints "ALL PROMOTIONAL APPOINTMENT TESTS PASSED";
-- any failure aborts with "TEST FAILED: …".
--
-- Two-session concurrency is covered separately by
-- promotional_appointment_concurrency.sh.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

\ir promotional_appointment_fixture.sql

-- Call the function the way PostgREST would: as `authenticated` with a JWT
-- subject, or as `service_role` with no subject. Local GUC changes made here
-- are undone if the call raises inside the caller's exception block.
CREATE FUNCTION pg_temp.call_as(p_role text, p_sub uuid, p_app uuid, p_actor uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_sub IS NULL THEN json_build_object('role', p_role)::text
         ELSE json_build_object('sub', p_sub, 'role', p_role)::text END, true);
  PERFORM set_config('role', p_role, true);
  -- Dynamic SQL so EXECUTE permission is checked as p_role on every call.
  -- A cached PL/pgSQL expression checks it only once per transaction.
  EXECUTE 'SELECT public.complete_promotional_appointment($1, $2)' INTO result USING p_app, p_actor;
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN result;
END $$;

-- Everything a rejected call must leave untouched.
CREATE FUNCTION pg_temp.snapshot(fx jsonb) RETURNS text
LANGUAGE sql AS $$
  SELECT md5(concat_ws('|',
    (SELECT row_to_json(e)::text FROM employees e WHERE e.id = (fx->>'employee')::uuid),
    (SELECT string_agg(row_to_json(a)::text, ',' ORDER BY a.id) FROM employee_portal_accounts a
      WHERE a.employee_id = fx->>'emp_number'),
    (SELECT string_agg(row_to_json(p)::text, ',' ORDER BY p.id) FROM applicants p
      WHERE p.id IN ((fx->>'app')::uuid, (fx->>'rival')::uuid, (fx->>'other_app')::uuid)),
    (SELECT string_agg(row_to_json(s)::text, ',' ORDER BY s.id) FROM plantilla_slots s
      WHERE s.job_posting_id = (fx->>'posting')::uuid),
    (SELECT string_agg(row_to_json(l)::text, ',' ORDER BY l.id) FROM application_plantilla_slots l
      WHERE l.applicant_id IN ((fx->>'app')::uuid, (fx->>'rival')::uuid, (fx->>'other_app')::uuid)),
    (SELECT count(*)::text FROM employee_history h WHERE h.employee_id = (fx->>'employee')::uuid),
    (SELECT count(*)::text FROM employees),
    (SELECT count(*)::text FROM employee_portal_accounts)))
$$;

-- Expect a rejection with the given SQLSTATE and machine-readable HINT, and
-- prove nothing in the fixture changed.
CREATE FUNCTION pg_temp.expect_reject(fx jsonb, p_label text, p_state text, p_hint text,
                                      p_role text, p_sub uuid, p_actor uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  before_snap text := pg_temp.snapshot(fx);
  got_state   text;
  got_hint    text;
  got_message text;
BEGIN
  BEGIN
    PERFORM pg_temp.call_as(p_role, p_sub, (fx->>'app')::uuid, p_actor);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS got_state = RETURNED_SQLSTATE, got_hint = PG_EXCEPTION_HINT, got_message = MESSAGE_TEXT;
  END;
  IF got_state IS NULL THEN
    RAISE EXCEPTION 'TEST FAILED: %: the call succeeded but should have been rejected', p_label;
  END IF;
  IF got_state <> p_state OR coalesce(got_hint, '') <> p_hint THEN
    RAISE EXCEPTION 'TEST FAILED: %: expected % / %, got % / % (%)', p_label, p_state, p_hint,
      got_state, got_hint, got_message;
  END IF;
  IF pg_temp.snapshot(fx) <> before_snap THEN
    RAISE EXCEPTION 'TEST FAILED: %: a rejected call changed data', p_label;
  END IF;
END $$;

-- ── 1. A reserved promotion completes in place ──────────────────────────────
DO $$
DECLARE
  fx        jsonb := pg_temp.fixture('ok1');
  before    employees%ROWTYPE;
  after     employees%ROWTYPE;
  acct_before text;
  result    jsonb;
  hist      employee_history%ROWTYPE;
  n         integer;
  employees_before integer := (SELECT count(*) FROM employees);
  accounts_before  integer := (SELECT count(*) FROM employee_portal_accounts);
BEGIN
  SELECT * INTO before FROM employees WHERE id = (fx->>'employee')::uuid;
  SELECT row_to_json(a)::text INTO acct_before FROM employee_portal_accounts a WHERE a.id = fx->>'account';

  result := pg_temp.call_as('authenticated', (fx->>'actor')::uuid, (fx->>'app')::uuid);

  IF (result->>'already_completed')::boolean IS DISTINCT FROM false
     OR result->>'applicant_id' <> fx->>'app'
     OR result->>'employee_uuid' <> fx->>'employee'
     OR result->>'employee_number' <> fx->>'emp_number'
     OR result->>'slot_id' <> fx->>'slot'
     OR result->>'completed_at' IS NULL THEN
    RAISE EXCEPTION 'TEST FAILED: unexpected result %', result;
  END IF;

  SELECT * INTO after FROM employees WHERE id = before.id;
  IF after.employee_number <> before.employee_number OR after.email IS DISTINCT FROM before.email
     OR after.date_hired IS DISTINCT FROM before.date_hired
     OR after.user_account_id IS DISTINCT FROM before.user_account_id
     OR after.employment_status <> before.employment_status OR after.status IS DISTINCT FROM before.status
     OR after.first_name <> before.first_name OR after.last_name <> before.last_name THEN
    RAISE EXCEPTION 'TEST FAILED: employee identity changed';
  END IF;
  IF after."position" <> 'Senior Records Analyst' OR after.department <> fx->>'new_office'
     OR after.division IS DISTINCT FROM 'Records Division' OR after.plantilla_num IS DISTINCT FROM '7' THEN
    RAISE EXCEPTION 'TEST FAILED: assignment not updated: % / % / % / %',
      after."position", after.department, after.division, after.plantilla_num;
  END IF;
  IF after.modified_by IS DISTINCT FROM (fx->>'actor')::uuid THEN
    RAISE EXCEPTION 'TEST FAILED: modified_by is not the verified actor';
  END IF;

  IF (SELECT row_to_json(a)::text FROM employee_portal_accounts a WHERE a.id = fx->>'account') <> acct_before THEN
    RAISE EXCEPTION 'TEST FAILED: portal account changed';
  END IF;
  IF (SELECT count(*) FROM employees) <> employees_before
     OR (SELECT count(*) FROM employee_portal_accounts) <> accounts_before THEN
    RAISE EXCEPTION 'TEST FAILED: an employee or account was inserted';
  END IF;

  SELECT count(*) INTO n FROM employee_history WHERE employee_id = before.id;
  SELECT * INTO hist FROM employee_history WHERE employee_id = before.id;
  IF n <> 1 OR hist.action <> 'promoted' OR hist.performed_by <> (fx->>'actor')::uuid
     OR hist.effective_date IS NULL THEN
    RAISE EXCEPTION 'TEST FAILED: expected one promoted history row by the actor, got % rows', n;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM plantilla_slots WHERE id = (fx->>'slot')::uuid AND status = 'filled'
                   AND filled_by_applicant_id = (fx->>'app')::uuid AND reserved_by_applicant_id IS NULL) THEN
    RAISE EXCEPTION 'TEST FAILED: target plantilla not filled by this application';
  END IF;
  IF (SELECT status FROM applicants WHERE id = (fx->>'app')::uuid) <> 'Hired' THEN
    RAISE EXCEPTION 'TEST FAILED: application is not Hired';
  END IF;
  IF (SELECT status FROM applicants WHERE id = (fx->>'rival')::uuid) <> 'Not Selected' THEN
    RAISE EXCEPTION 'TEST FAILED: competitor on the filled plantilla was not archived';
  END IF;
  IF (SELECT status FROM applicants WHERE id = (fx->>'other_app')::uuid) <> 'Withdrawn - Hired Elsewhere' THEN
    RAISE EXCEPTION 'TEST FAILED: the employee''s other open application was not withdrawn';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM plantilla_slots WHERE id = (fx->>'slot8')::uuid AND status = 'open') THEN
    RAISE EXCEPTION 'TEST FAILED: another plantilla changed';
  END IF;

  -- ── 2. Replay (lost response, double click) changes nothing ──
  DECLARE
    snap   text := pg_temp.snapshot(fx);
    replay jsonb;
  BEGIN
    replay := pg_temp.call_as('authenticated', (fx->>'actor')::uuid, (fx->>'app')::uuid);
    IF (replay->>'already_completed')::boolean IS DISTINCT FROM true
       OR replay->>'employee_uuid' <> fx->>'employee' OR replay->>'completed_at' <> result->>'completed_at' THEN
      RAISE EXCEPTION 'TEST FAILED: replay result %', replay;
    END IF;
    IF pg_temp.snapshot(fx) <> snap THEN
      RAISE EXCEPTION 'TEST FAILED: replay wrote data';
    END IF;
  END;

  -- ── 3. Replay after a later promotion does not rewind the employee ──
  UPDATE employees SET "position" = 'Records Officer III', plantilla_num = '12' WHERE id = before.id;
  DECLARE
    snap   text := pg_temp.snapshot(fx);
    replay jsonb;
  BEGIN
    replay := pg_temp.call_as('authenticated', (fx->>'actor')::uuid, (fx->>'app')::uuid);
    IF (replay->>'already_completed')::boolean IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'TEST FAILED: replay after a later promotion was not reported as completed';
    END IF;
    IF pg_temp.snapshot(fx) <> snap THEN
      RAISE EXCEPTION 'TEST FAILED: replay after a later promotion rewound data';
    END IF;
  END;
  RAISE NOTICE 'ok: completion, replay and replay after a later promotion';
END $$;

-- ── 4. A backend call with the service role and a verified actor ────────────
DO $$
DECLARE
  fx     jsonb := pg_temp.fixture('svc1');
  result jsonb;
BEGIN
  result := pg_temp.call_as('service_role', NULL, (fx->>'app')::uuid, (fx->>'actor')::uuid);
  IF (result->>'already_completed')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'TEST FAILED: service-role completion result %', result;
  END IF;
  IF (SELECT performed_by FROM employee_history WHERE employee_id = (fx->>'employee')::uuid) <> (fx->>'actor')::uuid THEN
    RAISE EXCEPTION 'TEST FAILED: service-role history actor';
  END IF;
  RAISE NOTICE 'ok: service-role completion records the supplied actor';
END $$;

-- ── 5. Callers that must be refused ────────────────────────────────────────
DO $$
DECLARE
  fx       jsonb := pg_temp.fixture('auth1');
  stranger uuid := gen_random_uuid();
  viewer   uuid := gen_random_uuid();
  retired  uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO user_roles (user_id, email, role, is_active) VALUES
    (viewer,   'interviewer.auth1@example.test', 'INTERVIEWER', true),
    (retired,  'retired.auth1@example.test',     'RSP',         false),
    (admin_id, 'admin.auth1@example.test',       'ADMIN',       true);

  -- anon has no execute grant at all.
  PERFORM pg_temp.expect_reject(fx, 'anon caller', '42501', '', 'anon', NULL);
  PERFORM pg_temp.expect_reject(fx, 'authenticated without a role row', '42501', 'not_authorized',
                                'authenticated', stranger);
  PERFORM pg_temp.expect_reject(fx, 'interviewer', '42501', 'not_authorized', 'authenticated', viewer);
  PERFORM pg_temp.expect_reject(fx, 'inactive RSP', '42501', 'not_authorized', 'authenticated', retired);
  PERFORM pg_temp.expect_reject(fx, 'actor parameter conflicts with the JWT', '42501', 'not_authorized',
                                'authenticated', (fx->>'actor')::uuid, admin_id);
  PERFORM pg_temp.expect_reject(fx, 'service role without an actor', '42501', 'not_authorized',
                                'service_role', NULL);
  PERFORM pg_temp.expect_reject(fx, 'service role with an unprivileged actor', '42501', 'not_authorized',
                                'service_role', NULL, viewer);

  -- An active ADMIN may complete it.
  IF (pg_temp.call_as('authenticated', admin_id, (fx->>'app')::uuid)->>'already_completed')::boolean
       IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'TEST FAILED: ADMIN completion';
  END IF;
  RAISE NOTICE 'ok: caller checks';
END $$;

-- ── 6. Data problems are rejected before any write ──────────────────────────
DO $$
DECLARE
  fx  jsonb;
  rsp uuid;
  dup_emp uuid;
BEGIN
  fx := pg_temp.fixture('rej1'); rsp := (fx->>'actor')::uuid;
  UPDATE applicants SET application_type = 'job' WHERE id = (fx->>'app')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'external application', 'P0001', 'not_promotion', 'authenticated', rsp);

  fx := pg_temp.fixture('rej2'); rsp := (fx->>'actor')::uuid;
  UPDATE applicants SET employee_id = 'TEST-nobody' WHERE id = (fx->>'app')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'missing employee', 'P0001', 'employee_not_found', 'authenticated', rsp);

  fx := pg_temp.fixture('rej3'); rsp := (fx->>'actor')::uuid;
  UPDATE employees SET deleted_at = now() WHERE id = (fx->>'employee')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'deleted employee', 'P0001', 'employee_not_found', 'authenticated', rsp);

  fx := pg_temp.fixture('rej4'); rsp := (fx->>'actor')::uuid;
  INSERT INTO employees (employee_number, first_name, last_name, department, "position", status)
  VALUES (lower(fx->>'emp_number'), 'Maricel', 'Dela Cruz', 'Old Office rej4', 'Clerk', 'Active')
  RETURNING id INTO dup_emp;
  PERFORM pg_temp.expect_reject(fx, 'employee number matches two employees', 'P0001', 'employee_ambiguous',
                                'authenticated', rsp);
  DELETE FROM employees WHERE id = dup_emp;

  fx := pg_temp.fixture('rej5'); rsp := (fx->>'actor')::uuid;
  UPDATE employee_portal_accounts SET deleted_at = now() WHERE id = fx->>'account';
  PERFORM pg_temp.expect_reject(fx, 'deleted account', 'P0001', 'account_missing', 'authenticated', rsp);

  fx := pg_temp.fixture('rej6'); rsp := (fx->>'actor')::uuid;
  INSERT INTO employee_portal_accounts (id, username, password, employee_id)
  VALUES ('acct-rej6-dup', 'dup_rej6', 'other', fx->>'emp_number');
  PERFORM pg_temp.expect_reject(fx, 'two accounts for one employee', 'P0001', 'account_ambiguous',
                                'authenticated', rsp);

  fx := pg_temp.fixture('rej7'); rsp := (fx->>'actor')::uuid;
  PERFORM revoke_plantilla_reservation((fx->>'app')::uuid);
  UPDATE applicants SET plantilla_slot_id = NULL WHERE id = (fx->>'app')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'application without a plantilla', 'P0001', 'slot_missing',
                                'authenticated', rsp);

  fx := pg_temp.fixture('rej8'); rsp := (fx->>'actor')::uuid;
  UPDATE plantilla_slots SET reserved_by_applicant_id = (fx->>'rival')::uuid WHERE id = (fx->>'slot')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'plantilla reserved for someone else', 'P0001', 'slot_reserved_elsewhere',
                                'authenticated', rsp);

  fx := pg_temp.fixture('rej9'); rsp := (fx->>'actor')::uuid;
  UPDATE plantilla_slots SET status = 'filled', filled_by_applicant_id = (fx->>'rival')::uuid
   WHERE id = (fx->>'slot')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'plantilla filled by someone else', 'P0001', 'slot_filled_elsewhere',
                                'authenticated', rsp);

  fx := pg_temp.fixture('rej10'); rsp := (fx->>'actor')::uuid;
  PERFORM revoke_plantilla_reservation((fx->>'app')::uuid);
  PERFORM pg_temp.expect_reject(fx, 'selection revoked', 'P0001', 'not_reserved', 'authenticated', rsp);

  fx := pg_temp.fixture('rej11'); rsp := (fx->>'actor')::uuid;
  UPDATE applicant_category_scores SET pcpt = '{"initialScore": 0, "finalScore": null, "remarks": ""}'
   WHERE applicant_id = (fx->>'app')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'PCPT not scored', 'P0001', 'assessment_incomplete', 'authenticated', rsp);

  fx := pg_temp.fixture('rej12'); rsp := (fx->>'actor')::uuid;
  UPDATE applicant_category_scores SET written_exam = '{"initialScore": 0, "finalScore": null, "remarks": ""}',
         written_exam_raw_score = NULL
   WHERE applicant_id = (fx->>'app')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'no written exam', 'P0001', 'assessment_incomplete', 'authenticated', rsp);

  fx := pg_temp.fixture('rej13'); rsp := (fx->>'actor')::uuid;
  UPDATE applicant_category_scores SET is_finalized = false WHERE applicant_id = (fx->>'app')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'scores not finalized', 'P0001', 'assessment_incomplete', 'authenticated', rsp);

  fx := pg_temp.fixture('rej14'); rsp := (fx->>'actor')::uuid;
  UPDATE applicant_category_scores SET appointment_type = 'original' WHERE applicant_id = (fx->>'app')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'scored on the original track', 'P0001', 'assessment_incomplete',
                                'authenticated', rsp);

  fx := pg_temp.fixture('rej15'); rsp := (fx->>'actor')::uuid;
  UPDATE departments SET is_active = false WHERE name = fx->>'new_office';
  PERFORM pg_temp.expect_reject(fx, 'target office inactive', 'P0001', 'office_inactive', 'authenticated', rsp);

  fx := pg_temp.fixture('rej16'); rsp := (fx->>'actor')::uuid;
  UPDATE plantilla_slots SET label = 'Plantilla 7-A' WHERE id = (fx->>'slot')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'plantilla number not resolvable', 'P0001', 'plantilla_ambiguous',
                                'authenticated', rsp);

  fx := pg_temp.fixture('rej17'); rsp := (fx->>'actor')::uuid;
  UPDATE job_postings SET deleted_at = now() WHERE id = (fx->>'posting')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'posting deleted', 'P0001', 'posting_missing', 'authenticated', rsp);

  fx := pg_temp.fixture('rej18'); rsp := (fx->>'actor')::uuid;
  UPDATE applicants SET deleted_at = now() WHERE id = (fx->>'app')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'deleted application', 'P0001', 'application_not_found', 'authenticated', rsp);

  RAISE NOTICE 'ok: data rejections';
END $$;

-- ── 7. Partial legacy completion is a conflict, not a success ───────────────
DO $$
DECLARE
  fx  jsonb;
  rsp uuid;
BEGIN
  -- Plantilla filled by this application, but it was never marked Hired and
  -- no promotion was recorded (an interrupted legacy hire).
  fx := pg_temp.fixture('part1'); rsp := (fx->>'actor')::uuid;
  UPDATE plantilla_slots SET status = 'filled', filled_by_applicant_id = (fx->>'app')::uuid
   WHERE id = (fx->>'slot')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'filled but not hired', 'P0001', 'partial_completion', 'authenticated', rsp);

  -- Marked Hired by a legacy path without the plantilla being filled.
  fx := pg_temp.fixture('part2'); rsp := (fx->>'actor')::uuid;
  UPDATE applicants SET status = 'Hired' WHERE id = (fx->>'app')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'hired but plantilla not filled', 'P0001', 'partial_completion',
                                'authenticated', rsp);
  RAISE NOTICE 'ok: partial completion conflicts';
END $$;

-- ── 8. A failure at the last write rolls back every earlier write ──────────
CREATE FUNCTION pg_temp.fail_history_insert() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$;

DO $$
DECLARE
  fx   jsonb := pg_temp.fixture('inj1');
  snap text;
  failed boolean := false;
BEGIN
  CREATE TRIGGER zz_test_fail_history BEFORE INSERT ON employee_history
    FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_history_insert();
  snap := pg_temp.snapshot(fx);
  BEGIN
    PERFORM pg_temp.call_as('authenticated', (fx->>'actor')::uuid, (fx->>'app')::uuid);
  EXCEPTION WHEN OTHERS THEN
    failed := true;
  END;
  DROP TRIGGER zz_test_fail_history ON employee_history;
  IF NOT failed THEN
    RAISE EXCEPTION 'TEST FAILED: the injected failure did not surface';
  END IF;
  IF pg_temp.snapshot(fx) <> snap THEN
    RAISE EXCEPTION 'TEST FAILED: an injected failure left a partial promotion';
  END IF;
  RAISE NOTICE 'ok: injected failure rolls back';
END $$;

-- ── 9. Grants: no PUBLIC or anon execute ────────────────────────────────────
DO $$
DECLARE
  fn regprocedure := 'public.complete_promotional_appointment(uuid, uuid)';
BEGIN
  IF has_function_privilege('anon', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST FAILED: anon can execute the function';
  END IF;
  IF NOT has_function_privilege('authenticated', fn, 'EXECUTE')
     OR NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST FAILED: authenticated/service_role cannot execute the function';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = fn) THEN
    RAISE EXCEPTION 'TEST FAILED: the function must be SECURITY INVOKER';
  END IF;
  RAISE NOTICE 'ok: grants';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL PROMOTIONAL APPOINTMENT TESTS PASSED'; END $$;

ROLLBACK;
