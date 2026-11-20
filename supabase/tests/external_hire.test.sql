-- ============================================================================
-- Tests for public.complete_external_hire and uq_employees_application_id.
--
-- Run against a LOCAL or disposable database only:
--   psql -X -U postgres -d external_hire_test -v ON_ERROR_STOP=1 -f external_hire.test.sql
-- Everything runs inside one transaction ending in ROLLBACK.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

\ir external_hire_fixture.sql

CREATE FUNCTION pg_temp.call_as(p_role text, p_sub uuid, p_app uuid, p_actor uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_sub IS NULL THEN json_build_object('role', p_role)::text
         ELSE json_build_object('sub', p_sub, 'role', p_role)::text END, true);
  PERFORM set_config('role', p_role, true);
  EXECUTE 'SELECT public.complete_external_hire($1, $2)' INTO result USING p_app, p_actor;
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN result;
END $$;

CREATE FUNCTION pg_temp.ext_snapshot(fx jsonb) RETURNS text
LANGUAGE sql AS $$
  SELECT md5(concat_ws('|',
    (SELECT count(*)::text FROM employees),
    (SELECT string_agg(row_to_json(e)::text, ',' ORDER BY e.id) FROM employees e
      WHERE e.application_id IN ((fx->>'app')::uuid, (fx->>'rival')::uuid, (fx->>'other_app')::uuid)
         OR lower(btrim(e.email)) IN (lower(fx->>'email_main'), lower(fx->>'email_rival'))),
    (SELECT string_agg(row_to_json(p)::text, ',' ORDER BY p.id) FROM applicants p
      WHERE p.id IN ((fx->>'app')::uuid, (fx->>'rival')::uuid, (fx->>'other_app')::uuid)),
    (SELECT string_agg(row_to_json(s)::text, ',' ORDER BY s.id) FROM plantilla_slots s
      WHERE s.job_posting_id = (fx->>'posting')::uuid),
    (SELECT string_agg(row_to_json(l)::text, ',' ORDER BY l.id) FROM application_plantilla_slots l
      WHERE l.applicant_id IN ((fx->>'app')::uuid, (fx->>'rival')::uuid, (fx->>'other_app')::uuid)),
    (SELECT count(*)::text FROM employee_history)))
$$;

CREATE FUNCTION pg_temp.expect_reject(fx jsonb, p_label text, p_state text, p_hint text,
                                      p_role text, p_sub uuid, p_actor uuid DEFAULT NULL,
                                      p_app_override uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  before_snap text := pg_temp.ext_snapshot(fx);
  target_app  uuid := coalesce(p_app_override, (fx->>'app')::uuid);
  got_state   text;
  got_hint    text;
  got_message text;
BEGIN
  BEGIN
    PERFORM pg_temp.call_as(p_role, p_sub, target_app, p_actor);
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
  IF pg_temp.ext_snapshot(fx) <> before_snap THEN
    RAISE EXCEPTION 'TEST FAILED: %: a rejected call changed data', p_label;
  END IF;
END $$;

-- ── 1. Completion, replay, triggers, and provenance ──────────────────────────
DO $$
DECLARE
  fx             jsonb := pg_temp.ext_fixture('ok1');
  result         jsonb;
  replay         jsonb;
  emp            employees%ROWTYPE;
  slot           plantilla_slots%ROWTYPE;
  app            applicants%ROWTYPE;
  rival          applicants%ROWTYPE;
  other          applicants%ROWTYPE;
  hist           employee_history%ROWTYPE;
  employees_before integer := (SELECT count(*) FROM employees);
  hist_before      integer := (SELECT count(*) FROM employee_history);
  expected_emp_no  text := 'EMP-' || upper(substr(replace((fx->>'app'), '-', ''), 1, 8));
BEGIN
  result := pg_temp.call_as('authenticated', (fx->>'actor')::uuid, (fx->>'app')::uuid);

  IF (result->>'applicant_id')::uuid IS DISTINCT FROM (fx->>'app')::uuid
     OR (result->>'slot_id')::uuid IS DISTINCT FROM (fx->>'slot')::uuid
     OR result->>'employee_number' IS DISTINCT FROM expected_emp_no
     OR (result->>'already_completed')::boolean IS DISTINCT FROM false
     OR (result->>'employee_uuid') IS NULL THEN
    RAISE EXCEPTION 'TEST FAILED: unexpected completion result %', result;
  END IF;

  IF (SELECT count(*) FROM employees) <> employees_before + 1 THEN
    RAISE EXCEPTION 'TEST FAILED: expected exactly 1 new employee';
  END IF;

  SELECT * INTO emp FROM employees WHERE id = (result->>'employee_uuid')::uuid;
  IF emp.application_id IS DISTINCT FROM (fx->>'app')::uuid
     OR emp.employee_number IS DISTINCT FROM expected_emp_no
     OR emp.first_name IS DISTINCT FROM 'Ana'
     OR emp.middle_name IS DISTINCT FROM 'Cruz'
     OR emp.last_name IS DISTINCT FROM 'Reyes'
     OR lower(emp.email) IS DISTINCT FROM lower(fx->>'email_main')
     OR emp."position" IS DISTINCT FROM 'Administrative Officer I'
     OR emp.department IS DISTINCT FROM (fx->>'dept_a')
     OR emp.division IS DISTINCT FROM 'Records Division'
     OR emp.plantilla_num IS DISTINCT FROM '7'
     OR emp.employment_status IS DISTINCT FROM 'Regular'
     OR emp.status IS DISTINCT FROM 'Active'
     OR emp.user_account_id IS NOT NULL
     OR emp.created_by IS DISTINCT FROM (fx->>'actor')::uuid
     OR emp.modified_by IS DISTINCT FROM (fx->>'actor')::uuid THEN
    RAISE EXCEPTION 'TEST FAILED: employee row mismatch %', row_to_json(emp);
  END IF;

  SELECT * INTO slot FROM plantilla_slots WHERE id = (fx->>'slot')::uuid;
  IF slot.status <> 'filled' OR slot.filled_by_applicant_id <> (fx->>'app')::uuid
     OR slot.reserved_by_applicant_id IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FAILED: slot state %', row_to_json(slot);
  END IF;

  SELECT * INTO app FROM applicants WHERE id = (fx->>'app')::uuid;
  SELECT * INTO rival FROM applicants WHERE id = (fx->>'rival')::uuid;
  SELECT * INTO other FROM applicants WHERE id = (fx->>'other_app')::uuid;
  IF app.status <> 'Hired' OR app.employee_id IS DISTINCT FROM expected_emp_no
     OR rival.status <> 'Not Selected'
     OR other.status <> 'Withdrawn - Hired Elsewhere' THEN
    RAISE EXCEPTION 'TEST FAILED: applicant trigger outcomes app=% rival=% other=%',
      app.status, rival.status, other.status;
  END IF;

  IF (SELECT count(*) FROM employee_history) <> hist_before + 1 THEN
    RAISE EXCEPTION 'TEST FAILED: expected exactly 1 employee_history row';
  END IF;
  SELECT * INTO hist FROM employee_history WHERE employee_id = emp.id;
  IF hist.action <> 'hired' OR hist.performed_by <> (fx->>'actor')::uuid
     OR hist.remarks <> ('Application ' || (fx->>'app')) THEN
    RAISE EXCEPTION 'TEST FAILED: history row mismatch %', row_to_json(hist);
  END IF;

  -- Replay returns prior result without writing a second employee or history row.
  replay := pg_temp.call_as('authenticated', (fx->>'actor')::uuid, (fx->>'app')::uuid);
  IF (replay->>'already_completed')::boolean IS DISTINCT FROM true
     OR (replay->>'employee_uuid')::uuid IS DISTINCT FROM emp.id
     OR replay->>'employee_number' IS DISTINCT FROM emp.employee_number
     OR (replay->>'slot_id')::uuid IS DISTINCT FROM (fx->>'slot')::uuid THEN
    RAISE EXCEPTION 'TEST FAILED: replay result mismatch %', replay;
  END IF;
  IF (SELECT count(*) FROM employees) <> employees_before + 1
     OR (SELECT count(*) FROM employee_history) <> hist_before + 1 THEN
    RAISE EXCEPTION 'TEST FAILED: replay wrote extra rows';
  END IF;

  RAISE NOTICE 'ok: completion, replay, triggers, and provenance';
END $$;

-- ── 2. Service-role completion records verified actor ───────────────────────
DO $$
DECLARE
  fx     jsonb := pg_temp.ext_fixture('svc1');
  result jsonb;
BEGIN
  result := pg_temp.call_as('service_role', NULL, (fx->>'app')::uuid, (fx->>'actor')::uuid);
  IF (result->>'already_completed')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'TEST FAILED: service-role result %', result;
  END IF;
  IF (SELECT performed_by FROM employee_history WHERE employee_id = (result->>'employee_uuid')::uuid)
       IS DISTINCT FROM (fx->>'actor')::uuid THEN
    RAISE EXCEPTION 'TEST FAILED: service-role actor not recorded';
  END IF;
  RAISE NOTICE 'ok: service-role completion records verified actor';
END $$;

-- ── 3. Caller authorization checks ───────────────────────────────────────────
DO $$
DECLARE
  fx       jsonb := pg_temp.ext_fixture('auth1');
  stranger uuid := gen_random_uuid();
  viewer   uuid := gen_random_uuid();
  retired  uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO user_roles (user_id, email, role, is_active) VALUES
    (viewer,   'interviewer.auth1@example.test', 'INTERVIEWER', true),
    (retired,  'retired.auth1@example.test',     'RSP',         false),
    (admin_id, 'admin.auth1@example.test',       'ADMIN',       true);

  PERFORM pg_temp.expect_reject(fx, 'anon caller', '42501', '', 'anon', NULL);
  PERFORM pg_temp.expect_reject(fx, 'authenticated without role', '42501', 'not_authorized', 'authenticated', stranger);
  PERFORM pg_temp.expect_reject(fx, 'interviewer role', '42501', 'not_authorized', 'authenticated', viewer);
  PERFORM pg_temp.expect_reject(fx, 'inactive RSP', '42501', 'not_authorized', 'authenticated', retired);
  PERFORM pg_temp.expect_reject(fx, 'forged actor parameter', '42501', 'not_authorized',
                                'authenticated', (fx->>'actor')::uuid, admin_id);
  PERFORM pg_temp.expect_reject(fx, 'service role without actor', '42501', 'not_authorized', 'service_role', NULL);
  PERFORM pg_temp.expect_reject(fx, 'service role with unprivileged actor', '42501', 'not_authorized',
                                'service_role', NULL, viewer);

  IF (pg_temp.call_as('authenticated', admin_id, (fx->>'app')::uuid)->>'already_completed')::boolean
       IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'TEST FAILED: ADMIN completion failed';
  END IF;
  RAISE NOTICE 'ok: caller checks';
END $$;

-- ── 4. Data rejections and strict reserve-then-hire checks ──────────────────
DO $$
DECLARE
  fx  jsonb;
  rsp uuid;
BEGIN
  fx := pg_temp.ext_fixture('rej_missing'); rsp := (fx->>'actor')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'missing applicant', 'P0001', 'application_not_found',
                                'authenticated', rsp, NULL, gen_random_uuid());

  fx := pg_temp.ext_fixture('rej_deleted'); rsp := (fx->>'actor')::uuid;
  UPDATE applicants SET deleted_at = now() WHERE id = (fx->>'app')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'soft-deleted applicant', 'P0001', 'application_not_found', 'authenticated', rsp);

  fx := pg_temp.ext_fixture('rej_promo1'); rsp := (fx->>'actor')::uuid;
  UPDATE applicants SET application_type = 'promotion' WHERE id = (fx->>'app')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'promotion misroute (promotion)', 'P0001', 'is_promotion', 'authenticated', rsp);

  fx := pg_temp.ext_fixture('rej_promo2'); rsp := (fx->>'actor')::uuid;
  UPDATE applicants SET application_type = 'Promotional' WHERE id = (fx->>'app')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'promotion misroute (Promotional)', 'P0001', 'is_promotion', 'authenticated', rsp);

  fx := pg_temp.ext_fixture('rej_slotless'); rsp := (fx->>'actor')::uuid;
  UPDATE plantilla_slots SET reserved_by_applicant_id = NULL WHERE id = (fx->>'slot')::uuid;
  UPDATE applicants SET plantilla_slot_id = NULL WHERE id = (fx->>'app')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'legacy slotless application', 'P0001', 'slot_missing', 'authenticated', rsp);

  fx := pg_temp.ext_fixture('rej_unreserved'); rsp := (fx->>'actor')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'rival on reserved slot', 'P0001', 'slot_reserved_elsewhere',
                                'authenticated', rsp, NULL, (fx->>'rival')::uuid);

  fx := pg_temp.ext_fixture('rej_not_res'); rsp := (fx->>'actor')::uuid;
  PERFORM public.revoke_plantilla_reservation((fx->>'app')::uuid);
  PERFORM pg_temp.expect_reject(fx, 'unreserved application', 'P0001', 'not_reserved', 'authenticated', rsp);

  fx := pg_temp.ext_fixture('rej_filled'); rsp := (fx->>'actor')::uuid;
  UPDATE plantilla_slots SET status = 'filled', filled_by_applicant_id = (fx->>'rival')::uuid
   WHERE id = (fx->>'slot')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'slot filled elsewhere', 'P0001', 'slot_filled_elsewhere', 'authenticated', rsp);

  fx := pg_temp.ext_fixture('rej_posting'); rsp := (fx->>'actor')::uuid;
  UPDATE job_postings SET deleted_at = now() WHERE id = (fx->>'posting')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'deleted posting', 'P0001', 'posting_missing', 'authenticated', rsp);

  fx := pg_temp.ext_fixture('rej_office_off'); rsp := (fx->>'actor')::uuid;
  UPDATE departments SET is_active = false WHERE name = (fx->>'dept_a');
  PERFORM pg_temp.expect_reject(fx, 'inactive office', 'P0001', 'office_inactive', 'authenticated', rsp);

  fx := pg_temp.ext_fixture('rej_label'); rsp := (fx->>'actor')::uuid;
  UPDATE plantilla_slots SET label = 'Item 7-A' WHERE id = (fx->>'slot')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'unreadable plantilla label', 'P0001', 'plantilla_ambiguous', 'authenticated', rsp);

  RAISE NOTICE 'ok: data rejections';
END $$;

-- ── 5. Collision refusal (never randomizes identity) ────────────────────────
DO $$
DECLARE
  fx              jsonb;
  rsp             uuid;
  expected_emp_no text;
BEGIN
  fx := pg_temp.ext_fixture('col_empno'); rsp := (fx->>'actor')::uuid;
  expected_emp_no := 'EMP-' || upper(substr(replace((fx->>'app'), '-', ''), 1, 8));
  INSERT INTO employees (employee_number, first_name, last_name, email, department, "position", status)
  VALUES (expected_emp_no, 'Existing', 'Person', 'other.col1@example.test', (fx->>'dept_b'), 'Clerk I', 'Active');
  PERFORM pg_temp.expect_reject(fx, 'employee number conflict', 'P0001', 'employee_number_conflict',
                                'authenticated', rsp);

  fx := pg_temp.ext_fixture('col_email'); rsp := (fx->>'actor')::uuid;
  INSERT INTO employees (employee_number, first_name, last_name, email, department, "position", status)
  VALUES ('EMP-EXISTING-' || left(md5(fx->>'app'), 6), 'Existing', 'Person', (fx->>'email_main'),
          (fx->>'dept_b'), 'Clerk I', 'Active');
  PERFORM pg_temp.expect_reject(fx, 'email conflict', 'P0001', 'email_conflict',
                                'authenticated', rsp);

  RAISE NOTICE 'ok: deterministic collision refusal';
END $$;

-- ── 6. Legacy adoption vs partial completion conflicts ──────────────────────
DO $$
DECLARE
  fx         jsonb;
  rsp        uuid;
  legacy_id  uuid;
  res        jsonb;
  res2       jsonb;
  emp_count  integer;
BEGIN
  -- 6a. Unambiguous completed legacy hire (app.employee_id -> emp.employee_number,
  --     app Hired, slot filled by app, emp.application_id NULL) is adopted safely.
  fx := pg_temp.ext_fixture('leg_adopt'); rsp := (fx->>'actor')::uuid;
  INSERT INTO employees (employee_number, application_id, first_name, last_name, email, department, "position", status)
  VALUES ('EMP-LEGACY-' || left(md5(fx->>'app'), 6), NULL, 'Ana', 'Reyes', (fx->>'email_main'),
          (fx->>'dept_a'), 'Administrative Officer I', 'Active')
  RETURNING id INTO legacy_id;
  UPDATE plantilla_slots SET status = 'filled', filled_by_applicant_id = (fx->>'app')::uuid
   WHERE id = (fx->>'slot')::uuid;
  UPDATE applicants SET status = 'Hired', employee_id = 'EMP-LEGACY-' || left(md5(fx->>'app'), 6)
   WHERE id = (fx->>'app')::uuid;

  emp_count := (SELECT count(*) FROM employees);
  res := pg_temp.call_as('authenticated', rsp, (fx->>'app')::uuid);
  IF (res->>'already_completed')::boolean IS DISTINCT FROM true
     OR (res->>'employee_uuid')::uuid IS DISTINCT FROM legacy_id
     OR (SELECT application_id FROM employees WHERE id = legacy_id) IS DISTINCT FROM (fx->>'app')::uuid
     OR (SELECT count(*) FROM employees) <> emp_count THEN
    RAISE EXCEPTION 'TEST FAILED: legacy adoption mismatch %', res;
  END IF;
  -- Second replay hits fast path cleanly
  res2 := pg_temp.call_as('authenticated', rsp, (fx->>'app')::uuid);
  IF (res2->>'already_completed')::boolean IS DISTINCT FROM true
     OR (res2->>'employee_uuid')::uuid IS DISTINCT FROM legacy_id THEN
    RAISE EXCEPTION 'TEST FAILED: adopted replay mismatch %', res2;
  END IF;

  -- 6b. Ambiguous legacy hire (two applicants share employee_id) -> partial_completion
  fx := pg_temp.ext_fixture('leg_ambig'); rsp := (fx->>'actor')::uuid;
  INSERT INTO employees (employee_number, application_id, first_name, last_name, email, department, "position", status)
  VALUES ('EMP-AMB-' || left(md5(fx->>'app'), 6), NULL, 'Ana', 'Reyes', (fx->>'email_main'),
          (fx->>'dept_a'), 'Administrative Officer I', 'Active');
  UPDATE plantilla_slots SET status = 'filled', filled_by_applicant_id = (fx->>'app')::uuid
   WHERE id = (fx->>'slot')::uuid;
  UPDATE applicants SET status = 'Hired', employee_id = 'EMP-AMB-' || left(md5(fx->>'app'), 6)
   WHERE id IN ((fx->>'app')::uuid, (fx->>'other_app')::uuid);
  PERFORM pg_temp.expect_reject(fx, 'ambiguous legacy employee link', 'P0001', 'partial_completion',
                                'authenticated', rsp);

  -- 6c. Partial states: slot filled without Hired, Hired without slot filled, Hired without link
  fx := pg_temp.ext_fixture('part_slot'); rsp := (fx->>'actor')::uuid;
  UPDATE plantilla_slots SET status = 'filled', filled_by_applicant_id = (fx->>'app')::uuid
   WHERE id = (fx->>'slot')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'slot filled but not hired', 'P0001', 'partial_completion', 'authenticated', rsp);

  fx := pg_temp.ext_fixture('part_hired'); rsp := (fx->>'actor')::uuid;
  UPDATE applicants SET status = 'Hired' WHERE id = (fx->>'app')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'hired without slot filled', 'P0001', 'partial_completion', 'authenticated', rsp);

  fx := pg_temp.ext_fixture('part_nolink'); rsp := (fx->>'actor')::uuid;
  UPDATE plantilla_slots SET status = 'filled', filled_by_applicant_id = (fx->>'app')::uuid
   WHERE id = (fx->>'slot')::uuid;
  UPDATE applicants SET status = 'Hired', employee_id = NULL WHERE id = (fx->>'app')::uuid;
  PERFORM pg_temp.expect_reject(fx, 'hired and filled without employee link', 'P0001', 'partial_completion',
                                'authenticated', rsp);

  RAISE NOTICE 'ok: legacy adoption and partial completion conflicts';
END $$;

-- ── 7. Trigger-induced failure rolls back all writes ────────────────────────
CREATE FUNCTION pg_temp.fail_history_insert() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected trigger failure'; END $$;

DO $$
DECLARE
  fx     jsonb := pg_temp.ext_fixture('inj1');
  snap   text;
  failed boolean := false;
BEGIN
  CREATE TRIGGER zz_test_fail_ext_history BEFORE INSERT ON employee_history
    FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_history_insert();
  snap := pg_temp.ext_snapshot(fx);
  BEGIN
    PERFORM pg_temp.call_as('authenticated', (fx->>'actor')::uuid, (fx->>'app')::uuid);
  EXCEPTION WHEN OTHERS THEN
    failed := true;
  END;
  DROP TRIGGER zz_test_fail_ext_history ON employee_history;
  IF NOT failed THEN
    RAISE EXCEPTION 'TEST FAILED: injected failure did not surface';
  END IF;
  IF pg_temp.ext_snapshot(fx) <> snap THEN
    RAISE EXCEPTION 'TEST FAILED: injected failure left partial external hire';
  END IF;
  RAISE NOTICE 'ok: trigger-induced failure rolls back cleanly';
END $$;

-- ── 8. Partial unique index & function grants ───────────────────────────────
DO $$
DECLARE
  fn           regprocedure := 'public.complete_external_hire(uuid, uuid)';
  dup_app_id   uuid := gen_random_uuid();
  dup_rejected boolean := false;
BEGIN
  IF has_function_privilege('anon', fn, 'EXECUTE')
     OR has_function_privilege('public', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST FAILED: anon/PUBLIC must not have EXECUTE';
  END IF;
  IF NOT has_function_privilege('authenticated', fn, 'EXECUTE')
     OR NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST FAILED: authenticated/service_role missing EXECUTE';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = fn) THEN
    RAISE EXCEPTION 'TEST FAILED: complete_external_hire must be SECURITY INVOKER';
  END IF;

  INSERT INTO departments (code, name, is_active) VALUES ('UQ1', 'Unique Test Office', true);
  INSERT INTO employees (employee_number, application_id, first_name, last_name, email, department, "position", status)
  VALUES ('EMP-UQ-1', NULL, 'A', 'B', 'uq1@example.test', 'Unique Test Office', 'Clerk', 'Active'),
         ('EMP-UQ-2', NULL, 'C', 'D', 'uq2@example.test', 'Unique Test Office', 'Clerk', 'Active'),
         ('EMP-UQ-3', dup_app_id, 'E', 'F', 'uq3@example.test', 'Unique Test Office', 'Clerk', 'Active');
  BEGIN
    INSERT INTO employees (employee_number, application_id, first_name, last_name, email, department, "position", status)
    VALUES ('EMP-UQ-4', dup_app_id, 'G', 'H', 'uq4@example.test', 'Unique Test Office', 'Clerk', 'Active');
  EXCEPTION WHEN unique_violation THEN
    dup_rejected := true;
  END;
  IF NOT dup_rejected THEN
    RAISE EXCEPTION 'TEST FAILED: uq_employees_application_id did not reject duplicate non-null application_id';
  END IF;
  RAISE NOTICE 'ok: grants and uq_employees_application_id';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL EXTERNAL HIRE TESTS PASSED'; END $$;

ROLLBACK;
