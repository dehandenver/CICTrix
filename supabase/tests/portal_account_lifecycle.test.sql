-- ============================================================================
-- Tests for Task 7A: employee_portal_accounts constraints, must_change_password,
-- employee_password_resets.request_id, and public.reset_employee_portal_password.
--
-- Run against a LOCAL or disposable database only:
--   psql -X -U postgres -d external_hire_test -v ON_ERROR_STOP=1 -f portal_account_lifecycle.test.sql
-- Everything runs inside one transaction ending in ROLLBACK.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

CREATE FUNCTION pg_temp.call_reset_as(
  p_role text,
  p_sub uuid,
  p_account_id text,
  p_emp_no text,
  p_expected timestamptz,
  p_new_pw text,
  p_actor uuid DEFAULT NULL,
  p_req_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_sub IS NULL THEN json_build_object('role', p_role)::text
         ELSE json_build_object('sub', p_sub, 'role', p_role)::text END, true);
  PERFORM set_config('role', p_role, true);
  EXECUTE 'SELECT public.reset_employee_portal_password($1, $2, $3, $4, $5, $6)'
     INTO result
    USING p_account_id, p_emp_no, p_expected, p_new_pw, p_actor, p_req_id;
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN result;
END $$;

CREATE FUNCTION pg_temp.acct_snapshot(p_account_id text) RETURNS text
LANGUAGE sql AS $$
  SELECT md5(concat_ws('|',
    (SELECT row_to_json(a)::text FROM public.employee_portal_accounts a WHERE a.id = p_account_id),
    (SELECT count(*)::text FROM public.employee_password_resets r WHERE r.account_id = p_account_id)))
$$;

CREATE FUNCTION pg_temp.expect_reset_reject(
  p_label text,
  p_state text,
  p_hint text,
  p_role text,
  p_sub uuid,
  p_account_id text,
  p_emp_no text,
  p_expected timestamptz,
  p_new_pw text,
  p_actor uuid DEFAULT NULL,
  p_req_id uuid DEFAULT NULL,
  p_snap_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  snap_id     text := coalesce(p_snap_id, p_account_id);
  before_snap text := pg_temp.acct_snapshot(snap_id);
  got_state   text;
  got_hint    text;
  got_message text;
BEGIN
  BEGIN
    PERFORM pg_temp.call_reset_as(p_role, p_sub, p_account_id, p_emp_no, p_expected, p_new_pw, p_actor, p_req_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS got_state = RETURNED_SQLSTATE, got_hint = PG_EXCEPTION_HINT, got_message = MESSAGE_TEXT;
  END;
  IF got_state IS NULL THEN
    RAISE EXCEPTION 'TEST FAILED: %: call succeeded when % / % was expected', p_label, p_state, p_hint;
  END IF;
  IF got_state <> p_state OR (p_hint <> '' AND coalesce(got_hint, '') <> p_hint) THEN
    RAISE EXCEPTION 'TEST FAILED: %: expected % / %, got % / % (%)', p_label, p_state, p_hint,
      got_state, got_hint, got_message;
  END IF;
  IF pg_temp.acct_snapshot(snap_id) <> before_snap THEN
    RAISE EXCEPTION 'TEST FAILED: %: rejected call modified account or reset audit rows', p_label;
  END IF;
END $$;

-- ── 1. must_change_password defaults, durable flags, and self-change clear ──
DO $$
DECLARE
  acct_default public.employee_portal_accounts%ROWTYPE;
  acct_new     public.employee_portal_accounts%ROWTYPE;
BEGIN
  INSERT INTO public.employee_portal_accounts (id, username, password, employee_id, full_name, email)
  VALUES ('acct-7a-def', 'legacy.user.7a', 'InitPass1!', 'EMP-7A-001', 'Legacy User', 'legacy7a@example.test')
  RETURNING * INTO acct_default;

  IF acct_default.must_change_password IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'TEST FAILED: default must_change_password was %, expected false', acct_default.must_change_password;
  END IF;

  INSERT INTO public.employee_portal_accounts (id, username, password, employee_id, full_name, email, must_change_password)
  VALUES ('acct-7a-new', 'new.user.7a', 'TempPass1!', 'EMP-7A-002', 'New User', 'new7a@example.test', true)
  RETURNING * INTO acct_new;

  IF acct_new.must_change_password IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'TEST FAILED: explicit must_change_password=true did not persist';
  END IF;

  -- Renaming username preserves must_change_password = true.
  UPDATE public.employee_portal_accounts
     SET username = 'renamed.user.7a',
         updated_at = GREATEST(clock_timestamp(), updated_at + interval '1 millisecond')
   WHERE id = 'acct-7a-new'
  RETURNING * INTO acct_new;
  IF acct_new.must_change_password IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'TEST FAILED: username rename cleared must_change_password';
  END IF;

  -- Self-change of password clears must_change_password atomically.
  UPDATE public.employee_portal_accounts
     SET password = 'EmployeeChosen9!',
         must_change_password = false,
         updated_at = GREATEST(clock_timestamp(), updated_at + interval '1 millisecond')
   WHERE id = 'acct-7a-new'
  RETURNING * INTO acct_new;
  IF acct_new.must_change_password IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'TEST FAILED: password self-change did not clear must_change_password';
  END IF;

  RAISE NOTICE 'ok: must_change_password lifecycle';
END $$;

-- ── 2. Active unique partial indexes allow soft-deleted duplicates only ──────
DO $$
DECLARE
  dup_emp_caught boolean := false;
  dup_usr_caught boolean := false;
BEGIN
  -- Soft-deleted historical account shares employee_id and case-folded username.
  INSERT INTO public.employee_portal_accounts (id, username, password, employee_id, full_name, deleted_at)
  VALUES ('acct-7a-soft', 'SoftDel.7a', 'OldPass1!', 'EMP-7A-DUP', 'Deleted User', now());

  -- Active row with same employee_id and case-folded username succeeds because previous row is soft-deleted.
  INSERT INTO public.employee_portal_accounts (id, username, password, employee_id, full_name)
  VALUES ('acct-7a-act1', 'softdel.7a', 'ActivePass1!', 'EMP-7A-DUP', 'Active User');

  -- Second active row with trimmed employee_id duplicate fails 23505.
  BEGIN
    INSERT INTO public.employee_portal_accounts (id, username, password, employee_id, full_name)
    VALUES ('acct-7a-act2', 'other.7a', 'ActivePass2!', ' EMP-7A-DUP ', 'Duplicate EmpNo');
  EXCEPTION WHEN unique_violation THEN
    dup_emp_caught := true;
  END;
  IF NOT dup_emp_caught THEN
    RAISE EXCEPTION 'TEST FAILED: active duplicate btrim(employee_id) was not rejected';
  END IF;

  -- Second active row with trimmed/case-folded username duplicate fails 23505.
  BEGIN
    INSERT INTO public.employee_portal_accounts (id, username, password, employee_id, full_name)
    VALUES ('acct-7a-act3', ' SOFTDEL.7A ', 'ActivePass3!', 'EMP-7A-UNIQ', 'Duplicate Username');
  EXCEPTION WHEN unique_violation THEN
    dup_usr_caught := true;
  END;
  IF NOT dup_usr_caught THEN
    RAISE EXCEPTION 'TEST FAILED: active duplicate lower(btrim(username)) was not rejected';
  END IF;

  RAISE NOTICE 'ok: active identity unique partial indexes';
END $$;

-- ── 3. Caller grants, SECURITY INVOKER, and actor authorization ─────────────
DO $$
DECLARE
  fn        regprocedure := 'public.reset_employee_portal_password(text, text, timestamptz, text, uuid, uuid)';
  rsp_id    uuid := gen_random_uuid();
  admin_id  uuid := gen_random_uuid();
  viewer_id uuid := gen_random_uuid();
  ret_id    uuid := gen_random_uuid();
  stranger  uuid := gen_random_uuid();
  rev       timestamptz;
  res       jsonb;
BEGIN
  IF has_function_privilege('anon', fn, 'EXECUTE')
     OR has_function_privilege('public', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST FAILED: anon/public must not execute reset_employee_portal_password';
  END IF;
  IF NOT has_function_privilege('authenticated', fn, 'EXECUTE')
     OR NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST FAILED: authenticated/service_role missing EXECUTE';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = fn) THEN
    RAISE EXCEPTION 'TEST FAILED: reset_employee_portal_password must be SECURITY INVOKER';
  END IF;

  INSERT INTO public.user_roles (user_id, email, role, name, is_active) VALUES
    (rsp_id,    'rsp.7a@example.test',         'RSP',         'RSP Actor',    true),
    (admin_id,  'admin.7a@example.test',       'ADMIN',       'Admin Actor',  true),
    (viewer_id, 'interviewer.7a@example.test', 'INTERVIEWER', 'Viewer Actor', true),
    (ret_id,    'retired.7a@example.test',     'RSP',         'Retired RSP',  false);

  INSERT INTO public.employee_portal_accounts (id, username, password, employee_id, full_name)
  VALUES ('acct-7a-auth', 'auth.user.7a', 'OldPass1!', 'EMP-7A-AUTH', 'Auth User')
  RETURNING updated_at INTO rev;

  PERFORM pg_temp.expect_reset_reject('anon caller', '42501', '', 'anon', NULL,
    'acct-7a-auth', 'EMP-7A-AUTH', rev, 'NewTemp1!', NULL, gen_random_uuid());
  PERFORM pg_temp.expect_reset_reject('authenticated without role', '42501', 'not_authorized', 'authenticated', stranger,
    'acct-7a-auth', 'EMP-7A-AUTH', rev, 'NewTemp1!', NULL, gen_random_uuid());
  PERFORM pg_temp.expect_reset_reject('interviewer caller', '42501', 'not_authorized', 'authenticated', viewer_id,
    'acct-7a-auth', 'EMP-7A-AUTH', rev, 'NewTemp1!', NULL, gen_random_uuid());
  PERFORM pg_temp.expect_reset_reject('inactive RSP caller', '42501', 'not_authorized', 'authenticated', ret_id,
    'acct-7a-auth', 'EMP-7A-AUTH', rev, 'NewTemp1!', NULL, gen_random_uuid());
  PERFORM pg_temp.expect_reset_reject('forged p_actor_user_id', '42501', 'not_authorized', 'authenticated', rsp_id,
    'acct-7a-auth', 'EMP-7A-AUTH', rev, 'NewTemp1!', admin_id, gen_random_uuid());
  PERFORM pg_temp.expect_reset_reject('service_role without actor', '42501', 'not_authorized', 'service_role', NULL,
    'acct-7a-auth', 'EMP-7A-AUTH', rev, 'NewTemp1!', NULL, gen_random_uuid());
  PERFORM pg_temp.expect_reset_reject('service_role with unprivileged actor', '42501', 'not_authorized', 'service_role', NULL,
    'acct-7a-auth', 'EMP-7A-AUTH', rev, 'NewTemp1!', viewer_id, gen_random_uuid());

  -- Active RSP succeeds
  res := pg_temp.call_reset_as('authenticated', rsp_id, 'acct-7a-auth', 'EMP-7A-AUTH', rev, 'NewTemp1!', NULL, gen_random_uuid());
  rev := (res->>'updated_at')::timestamptz;
  -- Active ADMIN succeeds
  res := pg_temp.call_reset_as('authenticated', admin_id, 'acct-7a-auth', 'EMP-7A-AUTH', rev, 'NewTemp2!', NULL, gen_random_uuid());
  rev := (res->>'updated_at')::timestamptz;
  -- Verified service_role actor succeeds
  res := pg_temp.call_reset_as('service_role', NULL, 'acct-7a-auth', 'EMP-7A-AUTH', rev, 'NewTemp3!', rsp_id, gen_random_uuid());
  IF (res->>'must_change_password')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'TEST FAILED: service_role reset did not return must_change_password=true';
  END IF;

  RAISE NOTICE 'ok: grants and actor authorization checks';
END $$;

-- ── 4. Target/input rejections, clock skew, audit content, and rollback ─────
DO $$
DECLARE
  rsp_id   uuid := gen_random_uuid();
  rev      timestamptz;
  future   timestamptz := clock_timestamp() + interval '10 minutes';
  req1     uuid := gen_random_uuid();
  req_dup  uuid := gen_random_uuid();
  res      jsonb;
  acct_row public.employee_portal_accounts%ROWTYPE;
  audit    public.employee_password_resets%ROWTYPE;
BEGIN
  INSERT INTO public.user_roles (user_id, email, role, name, is_active)
  VALUES (rsp_id, 'rsp.7a.4@example.test', 'RSP', 'RSP Four', true);

  INSERT INTO public.employee_portal_accounts (id, username, password, employee_id, full_name, updated_at)
  VALUES ('acct-7a-4', 'target.user.7a', 'OldSecret9!', 'EMP-7A-004', 'Target User', now())
  RETURNING updated_at INTO rev;

  INSERT INTO public.employee_portal_accounts (id, username, password, employee_id, full_name, deleted_at)
  VALUES ('acct-7a-4-del', 'deleted.user.7a', 'OldSecret8!', 'EMP-7A-004D', 'Deleted User', now());

  -- Invalid target / password rejections
  PERFORM pg_temp.expect_reset_reject('blank account id', '22023', 'invalid_target', 'authenticated', rsp_id,
    '   ', 'EMP-7A-004', rev, 'ValidPass1!', NULL, gen_random_uuid(), 'acct-7a-4');
  PERFORM pg_temp.expect_reset_reject('blank employee number', '22023', 'invalid_target', 'authenticated', rsp_id,
    'acct-7a-4', ' ', rev, 'ValidPass1!', NULL, gen_random_uuid());
  PERFORM pg_temp.expect_reset_reject('null expected revision', '22023', 'invalid_target', 'authenticated', rsp_id,
    'acct-7a-4', 'EMP-7A-004', NULL, 'ValidPass1!', NULL, gen_random_uuid());
  PERFORM pg_temp.expect_reset_reject('null password', '22023', 'invalid_password', 'authenticated', rsp_id,
    'acct-7a-4', 'EMP-7A-004', rev, NULL, NULL, gen_random_uuid());
  PERFORM pg_temp.expect_reset_reject('short password (5 chars)', '22023', 'invalid_password', 'authenticated', rsp_id,
    'acct-7a-4', 'EMP-7A-004', rev, 'ab123', NULL, gen_random_uuid());

  -- Missing / deleted / mismatched / stale revision
  PERFORM pg_temp.expect_reset_reject('missing account', 'P0002', 'account_not_found', 'authenticated', rsp_id,
    'acct-7a-missing', 'EMP-7A-004', rev, 'ValidPass1!', NULL, gen_random_uuid(), 'acct-7a-4');
  PERFORM pg_temp.expect_reset_reject('soft-deleted account', 'P0002', 'account_not_found', 'authenticated', rsp_id,
    'acct-7a-4-del', 'EMP-7A-004D', rev, 'ValidPass1!', NULL, gen_random_uuid());
  PERFORM pg_temp.expect_reset_reject('mismatched employee number', '22023', 'identity_mismatch', 'authenticated', rsp_id,
    'acct-7a-4', 'EMP-7A-WRONG', rev, 'ValidPass1!', NULL, gen_random_uuid());
  PERFORM pg_temp.expect_reset_reject('stale expected revision', '40001', 'revision_conflict', 'authenticated', rsp_id,
    'acct-7a-4', 'EMP-7A-004', rev - interval '5 seconds', 'ValidPass1!', NULL, gen_random_uuid());

  -- Untrimmed 6-char password with leading spaces is preserved verbatim, identity unchanged, no secret in JSON/audit
  res := pg_temp.call_reset_as('authenticated', rsp_id, 'acct-7a-4', ' EMP-7A-004 ', rev, '  pw12', NULL, req1);
  IF res ? 'password' OR res->>'account_id' <> 'acct-7a-4' OR res->>'employee_number' <> 'EMP-7A-004'
     OR res->>'username' <> 'target.user.7a' OR (res->>'must_change_password')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'TEST FAILED: unexpected reset JSON result %', res;
  END IF;

  SELECT * INTO acct_row FROM public.employee_portal_accounts WHERE id = 'acct-7a-4';
  IF acct_row.password IS DISTINCT FROM '  pw12'
     OR acct_row.must_change_password IS DISTINCT FROM true
     OR acct_row.username <> 'target.user.7a'
     OR acct_row.employee_id <> 'EMP-7A-004'
     OR acct_row.updated_at <= rev THEN
    RAISE EXCEPTION 'TEST FAILED: account row after reset mismatch %', row_to_json(acct_row);
  END IF;

  SELECT * INTO audit FROM public.employee_password_resets WHERE request_id = req1;
  IF NOT FOUND OR audit.account_id <> 'acct-7a-4' OR audit.reset_by <> rsp_id::text
     OR audit.employee_username <> 'target.user.7a' OR audit.employee_number <> 'EMP-7A-004'
     OR audit.action <> 'temporary' OR audit.reset_at <> acct_row.updated_at
     OR position('  pw12' in coalesce(audit.note, '')) > 0
     OR position('OldSecret9!' in coalesce(audit.note, '')) > 0 THEN
    RAISE EXCEPTION 'TEST FAILED: audit row mismatch %', row_to_json(audit);
  END IF;

  -- Clock-skew regression: future updated_at still strictly advances by +1 millisecond
  UPDATE public.employee_portal_accounts SET updated_at = future WHERE id = 'acct-7a-4';
  res := pg_temp.call_reset_as('authenticated', rsp_id, 'acct-7a-4', 'EMP-7A-004', future, 'SkewPass9!', NULL, req_dup);
  SELECT * INTO acct_row FROM public.employee_portal_accounts WHERE id = 'acct-7a-4';
  IF acct_row.updated_at < future + interval '1 millisecond' THEN
    RAISE EXCEPTION 'TEST FAILED: clock-skew regression did not advance past future timestamp (% < %)',
      acct_row.updated_at, future + interval '1 millisecond';
  END IF;

  -- Duplicate request_id fails 23505 and rolls back password update
  PERFORM pg_temp.expect_reset_reject('duplicate p_request_id', '23505', 'duplicate_request_id', 'authenticated', rsp_id,
    'acct-7a-4', 'EMP-7A-004', acct_row.updated_at, 'NeverApplied1!', NULL, req_dup);

  RAISE NOTICE 'ok: rejections, untrimmed password, clock skew, audit, and duplicate request_id rollback';
END $$;

-- ── 5. Audit insert failure rolls back the account password/flag update ─────
CREATE FUNCTION pg_temp.fail_reset_audit() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected audit failure'; END $$;

DO $$
DECLARE
  rsp_id uuid := gen_random_uuid();
  rev    timestamptz;
  snap   text;
  failed boolean := false;
BEGIN
  INSERT INTO public.user_roles (user_id, email, role, name, is_active)
  VALUES (rsp_id, 'rsp.7a.5@example.test', 'RSP', 'RSP Five', true);

  INSERT INTO public.employee_portal_accounts (id, username, password, employee_id, full_name)
  VALUES ('acct-7a-5', 'audit.fail.7a', 'BeforePass1!', 'EMP-7A-005', 'Audit Fail User')
  RETURNING updated_at INTO rev;

  CREATE TRIGGER zz_test_fail_reset_audit BEFORE INSERT ON public.employee_password_resets
    FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_reset_audit();

  snap := pg_temp.acct_snapshot('acct-7a-5');
  BEGIN
    PERFORM pg_temp.call_reset_as('authenticated', rsp_id, 'acct-7a-5', 'EMP-7A-005', rev, 'AfterPass1!', NULL, gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    failed := true;
  END;
  DROP TRIGGER zz_test_fail_reset_audit ON public.employee_password_resets;

  IF NOT failed THEN
    RAISE EXCEPTION 'TEST FAILED: injected audit failure did not surface';
  END IF;
  IF pg_temp.acct_snapshot('acct-7a-5') <> snap THEN
    RAISE EXCEPTION 'TEST FAILED: injected audit failure left partial account update';
  END IF;
  RAISE NOTICE 'ok: audit failure rolls back account reset cleanly';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL PORTAL ACCOUNT LIFECYCLE TESTS PASSED'; END $$;

ROLLBACK;
