-- ============================================================================
-- Employee portal account integrity constraints, first-password state, and
-- atomic HR password reset RPC
-- ============================================================================
-- Plans:
--   docs/plans/2026-11-17-persistence-integrity-repairs.md (Task 7A)
--   docs/plans/2026-11-19-employee-credential-consistency.md (F2/F3/F6)
--
-- Changes:
--   1. Preflight checks for blank or duplicate active account identities.
--   2. Durable `must_change_password` flag (default false for existing rows).
--   3. Active partial unique indexes on `btrim(employee_id)` and
--      `lower(btrim(username))` (`deleted_at IS NULL`), retaining existing
--      stricter constraints.
--   4. `employee_password_resets.request_id` with unique partial index
--      `employee_password_resets_request_id_uidx` for dropped-response recovery.
--   5. `SECURITY INVOKER` `public.reset_employee_portal_password` RPC with
--      verified RSP/ADMIN actor checks, strict monotonic timestamp advancement,
--      and atomic secret-free audit insertion.
-- ============================================================================

BEGIN;

-- ── 1. Preflight identity integrity audit (active rows) ───────────────────────
DO $$
DECLARE
  active_count       integer;
  missing_emp_count  integer;
  missing_user_count integer;
  dup_emp_groups     integer;
  dup_user_groups    integer;
BEGIN
  SELECT count(*) INTO active_count
    FROM public.employee_portal_accounts
   WHERE deleted_at IS NULL;

  SELECT count(*) INTO missing_emp_count
    FROM public.employee_portal_accounts
   WHERE deleted_at IS NULL
     AND (employee_id IS NULL OR btrim(employee_id) = '');

  SELECT count(*) INTO missing_user_count
    FROM public.employee_portal_accounts
   WHERE deleted_at IS NULL
     AND (username IS NULL OR btrim(username) = '');

  SELECT count(*) INTO dup_emp_groups
    FROM (
      SELECT btrim(employee_id)
        FROM public.employee_portal_accounts
       WHERE deleted_at IS NULL
         AND employee_id IS NOT NULL
         AND btrim(employee_id) <> ''
       GROUP BY btrim(employee_id)
      HAVING count(*) > 1
    ) emp_dups;

  SELECT count(*) INTO dup_user_groups
    FROM (
      SELECT lower(btrim(username))
        FROM public.employee_portal_accounts
       WHERE deleted_at IS NULL
         AND username IS NOT NULL
         AND btrim(username) <> ''
       GROUP BY lower(btrim(username))
      HAVING count(*) > 1
    ) user_dups;

  RAISE NOTICE 'employee_portal_account_integrity preflight: active_accounts=%, missing_employee_id=%, missing_username=%, duplicate_employee_id_groups=%, duplicate_username_groups=%',
    active_count, missing_emp_count, missing_user_count, dup_emp_groups, dup_user_groups;

  IF missing_emp_count > 0 THEN
    RAISE EXCEPTION
      'Cannot apply employee_portal_account_integrity: % active employee_portal_accounts row(s) have missing or blank employee_id. Resolve manually before migrating.',
      missing_emp_count;
  END IF;

  IF missing_user_count > 0 THEN
    RAISE EXCEPTION
      'Cannot apply employee_portal_account_integrity: % active employee_portal_accounts row(s) have missing or blank username. Resolve manually before migrating.',
      missing_user_count;
  END IF;

  IF dup_emp_groups > 0 THEN
    RAISE EXCEPTION
      'Cannot create employee_portal_accounts_active_employee_number_uidx: % duplicate active btrim(employee_id) group(s) exist. Resolve manually before migrating.',
      dup_emp_groups;
  END IF;

  IF dup_user_groups > 0 THEN
    RAISE EXCEPTION
      'Cannot create employee_portal_accounts_active_username_uidx: % duplicate active lower(btrim(username)) group(s) exist. Resolve manually before migrating.',
      dup_user_groups;
  END IF;
END $$;

-- ── 2. Durable first-password state, request_id, and active unique indexes ────
ALTER TABLE public.employee_portal_accounts
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS employee_portal_accounts_active_employee_number_uidx
  ON public.employee_portal_accounts (btrim(employee_id))
  WHERE deleted_at IS NULL AND employee_id IS NOT NULL AND btrim(employee_id) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS employee_portal_accounts_active_username_uidx
  ON public.employee_portal_accounts (lower(btrim(username)))
  WHERE deleted_at IS NULL;

ALTER TABLE public.employee_password_resets
  ADD COLUMN IF NOT EXISTS request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS employee_password_resets_request_id_uidx
  ON public.employee_password_resets (request_id)
  WHERE request_id IS NOT NULL;

GRANT SELECT, UPDATE ON public.employee_portal_accounts TO authenticated, service_role;
GRANT SELECT, INSERT ON public.employee_password_resets TO authenticated, service_role;

-- ── 3. Atomic HR password reset RPC ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reset_employee_portal_password(
  p_account_id          text,
  p_employee_number     text,
  p_expected_updated_at timestamptz,
  p_new_password        text,
  p_actor_user_id       uuid DEFAULT NULL,
  p_request_id          uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor           uuid;
  jwt_user        uuid := auth.uid();
  existing        public.employee_portal_accounts%ROWTYPE;
  next_updated_at timestamptz;
  dup_constraint  text;
BEGIN
  -- ── Verified RSP/ADMIN actor check ─────────────────────────────────────────
  IF current_user = 'service_role' THEN
    actor := p_actor_user_id;
  ELSIF jwt_user IS NOT NULL AND (p_actor_user_id IS NULL OR p_actor_user_id = jwt_user) THEN
    actor := jwt_user;
  END IF;

  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles r
     WHERE r.user_id = actor
       AND r.is_active IS TRUE
       AND upper(btrim(r.role)) IN ('RSP', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'Only an active RSP or Admin user can reset an employee portal password.'
      USING ERRCODE = '42501', HINT = 'not_authorized';
  END IF;

  -- ── Input validation before locking or writing ─────────────────────────────
  IF p_account_id IS NULL OR btrim(p_account_id) = ''
     OR p_employee_number IS NULL OR btrim(p_employee_number) = ''
     OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'A valid account target, employee number, and expected revision are required.'
      USING ERRCODE = '22023', HINT = 'invalid_target';
  END IF;

  IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
    RAISE EXCEPTION 'Temporary password must be at least 6 characters.'
      USING ERRCODE = '22023', HINT = 'invalid_password';
  END IF;

  -- ── Lock target row and verify identity & optimistic revision ──────────────
  SELECT * INTO existing
    FROM public.employee_portal_accounts a
   WHERE a.id = btrim(p_account_id)
   FOR UPDATE;

  IF NOT FOUND OR existing.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Employee portal account "%" was not found.', btrim(p_account_id)
      USING ERRCODE = 'P0002', HINT = 'account_not_found';
  END IF;

  IF coalesce(btrim(existing.employee_id), '') <> btrim(p_employee_number) THEN
    RAISE EXCEPTION 'Portal account "%" does not belong to employee "%".', existing.id, btrim(p_employee_number)
      USING ERRCODE = '22023', HINT = 'identity_mismatch';
  END IF;

  IF existing.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'This portal account changed since it was loaded. Refresh and try again.'
      USING ERRCODE = '40001', HINT = 'revision_conflict';
  END IF;

  -- ── Strictly monotonic server revision + atomic update & secret-free audit ─
  next_updated_at := GREATEST(clock_timestamp(), existing.updated_at + interval '1 millisecond');

  UPDATE public.employee_portal_accounts
     SET password             = p_new_password,
         must_change_password = true,
         updated_at           = next_updated_at
   WHERE id = existing.id;

  BEGIN
    INSERT INTO public.employee_password_resets (
      account_id,
      employee_username,
      employee_number,
      reset_by,
      action,
      note,
      reset_at,
      request_id
    ) VALUES (
      existing.id,
      existing.username,
      btrim(existing.employee_id),
      actor::text,
      'temporary',
      'Password reset to a temporary value.',
      next_updated_at,
      p_request_id
    );
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS dup_constraint = CONSTRAINT_NAME;
    IF dup_constraint = 'employee_password_resets_request_id_uidx' THEN
      RAISE EXCEPTION 'Reset request "%" has already been recorded.', p_request_id
        USING ERRCODE = '23505', HINT = 'duplicate_request_id';
    END IF;
    RAISE;
  END;

  RETURN jsonb_build_object(
    'account_id', existing.id,
    'employee_number', btrim(existing.employee_id),
    'username', existing.username,
    'updated_at', next_updated_at,
    'must_change_password', true
  );
END $$;

REVOKE ALL ON FUNCTION public.reset_employee_portal_password(text, text, timestamptz, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_employee_portal_password(text, text, timestamptz, text, uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.reset_employee_portal_password(text, text, timestamptz, text, uuid, uuid) IS
  'Atomically resets an active employee portal account password to a temporary value, sets must_change_password = true, advances updated_at monotonically, and records a secret-free audit entry. See migration 20261120195500.';

NOTIFY pgrst, 'reload schema';

COMMIT;
