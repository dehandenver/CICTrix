-- ============================================================================
-- Complete an external appointment in one retry-safe transaction
-- ============================================================================
-- Plan: docs/plans/2026-11-17-persistence-integrity-repairs.md, Task 6.
--
-- Mirrors complete_promotional_appointment (migration 20261102041556) for
-- external hires. Everything happens in one transaction:
--
--   * verifies an active RSP/ADMIN caller (auth.uid() or verified backend actor);
--   * acquires a transaction-level advisory lock on normalized email, then locks
--     employees -> plantilla_slots -> applicants in deterministic order;
--   * replays completed hires (or unambiguously adopted completed legacy hires)
--     idempotently without inserting another employee or history row;
--   * refuses partial/ambiguous legacy hires, collision conflicts, missing/
--     unreserved plantillas, inactive/ambiguous offices, and promotion routes;
--   * atomically inserts employees (recording durable application_id provenance),
--     fills the reserved plantilla_slots row (firing archive triggers), marks
--     the applicant Hired (firing withdrawal triggers), and writes one
--     employee_history ('hired') record.
-- ============================================================================

BEGIN;

-- ── 1. Preflight check before adding uq_employees_application_id ──────────────
DO $$
DECLARE
  non_null_count integer;
  dup_groups     integer;
  orphan_count   integer;
BEGIN
  SELECT count(*) INTO non_null_count
    FROM public.employees
   WHERE application_id IS NOT NULL;

  SELECT count(*) INTO dup_groups
    FROM (
      SELECT application_id
        FROM public.employees
       WHERE application_id IS NOT NULL
       GROUP BY application_id
      HAVING count(*) > 1
    ) dups;

  SELECT count(*) INTO orphan_count
    FROM public.employees e
   WHERE e.application_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.applicants a WHERE a.id = e.application_id
     );

  RAISE NOTICE 'external_hire_transaction preflight: non_null_application_id=%, duplicate_groups=%, orphan_references=%',
    non_null_count, dup_groups, orphan_count;

  IF dup_groups > 0 THEN
    RAISE EXCEPTION
      'Cannot create uq_employees_application_id: % duplicate non-null employees.application_id group(s) exist. Resolve manually before running this migration.',
      dup_groups;
  END IF;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'Cannot create uq_employees_application_id: % orphaned employees.application_id reference(s) have no matching applicants row. Resolve manually before running this migration.',
      orphan_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_application_id
  ON public.employees (application_id)
  WHERE application_id IS NOT NULL;

-- ── 2. Transactional external hire RPC ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_external_hire(
  p_applicant_id  uuid,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor              uuid;
  jwt_user           uuid := auth.uid();
  slot_id            uuid;
  slot               public.plantilla_slots%ROWTYPE;
  app                public.applicants%ROWTYPE;
  emp                public.employees%ROWTYPE;
  legacy_emp_ids     uuid[];
  posting            public.job_postings%ROWTYPE;
  office_count       integer;
  office_name        text;
  plantilla_no       text;
  target_division    text;
  normalized_email   text;
  app_emp_id         text;
  candidate_emp_no   text;
  candidate_email    text;
  valid_sex          text;
  history_marker     text := 'Application ' || p_applicant_id::text;
  is_hired           boolean;
  slot_is_mine       boolean;
  history_exists     boolean;
  completed_at       timestamptz;
BEGIN
  -- ── Caller authorization ───────────────────────────────────────────────────
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
    RAISE EXCEPTION 'Only an active RSP or Admin user can complete an external hire.'
      USING ERRCODE = '42501', HINT = 'not_authorized';
  END IF;

  -- ── Unlocked read: determine email/app advisory locks ──────────────────────
  SELECT * INTO app FROM public.applicants a
   WHERE a.id = p_applicant_id AND a.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This application no longer exists.'
      USING ERRCODE = 'P0001', HINT = 'application_not_found';
  END IF;

  IF lower(btrim(coalesce(app.application_type, ''))) IN ('promotion', 'promotional') THEN
    RAISE EXCEPTION 'This is a promotional application. Use the promotion completion path instead.'
      USING ERRCODE = 'P0001', HINT = 'is_promotion';
  END IF;

  normalized_email := public.normalize_applicant_email(app.email);

  -- ── Advisory locks before reading mutable lock keys ────────────────────────
  -- Acquire the email lock first (and the application lock) so any concurrent
  -- external hire for this application or email finishes and commits before we
  -- compute candidate employee_number / slot targets.
  IF normalized_email IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('external_hire_email:' || normalized_email, 0));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('external_hire_app:' || p_applicant_id::text, 0));

  SELECT * INTO app FROM public.applicants a
   WHERE a.id = p_applicant_id AND a.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This application no longer exists.'
      USING ERRCODE = 'P0001', HINT = 'application_not_found';
  END IF;

  IF lower(btrim(coalesce(app.application_type, ''))) IN ('promotion', 'promotional') THEN
    RAISE EXCEPTION 'This is a promotional application. Use the promotion completion path instead.'
      USING ERRCODE = 'P0001', HINT = 'is_promotion';
  END IF;

  IF public.normalize_applicant_email(app.email) IS DISTINCT FROM normalized_email THEN
    RAISE EXCEPTION 'This application changed while it was being completed. Refresh and try again.'
      USING ERRCODE = 'P0001', HINT = 'concurrent_change';
  END IF;

  slot_id          := app.plantilla_slot_id;
  app_emp_id       := nullif(btrim(coalesce(app.employee_id, '')), '');
  candidate_emp_no := coalesce(app_emp_id, 'EMP-' || upper(substr(replace(p_applicant_id::text, '-', ''), 1, 8)));

  IF normalized_email IS NOT NULL THEN
    candidate_email := normalized_email;
  ELSE
    candidate_email := lower(regexp_replace(coalesce(app.first_name, ''), '\s+', '', 'g'))
      || '.' || lower(regexp_replace(coalesce(app.last_name, ''), '\s+', '', 'g'))
      || '.' || lower(candidate_emp_no) || '@employee.local';
  END IF;

  -- ── Lock order: employees -> plantilla_slots -> applicants ─────────────────
  PERFORM 1
     FROM public.employees e
    WHERE e.application_id = p_applicant_id
       OR lower(btrim(e.employee_number)) = lower(btrim(candidate_emp_no))
       OR lower(btrim(e.email)) = lower(btrim(candidate_email))
    ORDER BY e.id
    FOR UPDATE;

  IF slot_id IS NOT NULL THEN
    SELECT * INTO slot FROM public.plantilla_slots s WHERE s.id = slot_id FOR UPDATE;
  END IF;

  SELECT * INTO app FROM public.applicants a WHERE a.id = p_applicant_id FOR UPDATE;
  IF NOT FOUND OR app.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'This application no longer exists.'
      USING ERRCODE = 'P0001', HINT = 'application_not_found';
  END IF;

  IF app.plantilla_slot_id IS DISTINCT FROM slot_id
     OR public.normalize_applicant_email(app.email) IS DISTINCT FROM normalized_email
     OR nullif(btrim(coalesce(app.employee_id, '')), '') IS DISTINCT FROM app_emp_id
     OR lower(btrim(coalesce(app.application_type, ''))) IN ('promotion', 'promotional') THEN
    RAISE EXCEPTION 'This application changed while it was being completed. Refresh and try again.'
      USING ERRCODE = 'P0001', HINT = 'concurrent_change';
  END IF;

  -- ── Replay / legacy adoption / partial completion checks ───────────────────
  SELECT * INTO emp FROM public.employees e WHERE e.application_id = app.id;
  IF FOUND AND emp.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'This external hire was partly completed by an earlier process. It needs to be checked before it can be completed.'
      USING ERRCODE = 'P0001', HINT = 'partial_completion';
  END IF;

  is_hired       := public.is_hired_application_status(app.status);
  slot_is_mine   := slot.id IS NOT NULL AND slot.status = 'filled' AND slot.filled_by_applicant_id = app.id;
  history_exists := emp.id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.employee_history h
     WHERE h.employee_id = emp.id AND h.action = 'hired' AND h.remarks = history_marker
  );

  IF emp.id IS NOT NULL AND is_hired AND slot_is_mine AND history_exists THEN
    RETURN jsonb_build_object(
      'applicant_id', app.id,
      'employee_uuid', emp.id,
      'employee_number', emp.employee_number,
      'slot_id', slot.id,
      'completed_at', slot.filled_at,
      'already_completed', true
    );
  END IF;

  -- Adopt an unambiguous completed legacy hire when applicants.employee_id links
  -- uniquely to a single active employee row with application_id IS NULL.
  IF emp.id IS NULL AND is_hired AND slot_is_mine AND app_emp_id IS NOT NULL THEN
    SELECT array_agg(e.id) INTO legacy_emp_ids
      FROM public.employees e
     WHERE e.deleted_at IS NULL
       AND lower(btrim(e.employee_number)) = lower(btrim(app_emp_id));

    IF cardinality(legacy_emp_ids) = 1 THEN
      SELECT * INTO emp FROM public.employees e WHERE e.id = legacy_emp_ids[1] FOR UPDATE;

      IF emp.application_id IS NULL
         AND (normalized_email IS NULL
              OR public.normalize_applicant_email(emp.email) IS NULL
              OR public.normalize_applicant_email(emp.email) = normalized_email)
         AND NOT EXISTS (
           SELECT 1 FROM public.applicants a2
            WHERE a2.id <> app.id
              AND a2.deleted_at IS NULL
              AND lower(btrim(coalesce(a2.employee_id, ''))) = lower(btrim(emp.employee_number))
         ) THEN
        UPDATE public.employees
           SET application_id = app.id,
               modified_by    = actor
         WHERE id = emp.id
           AND application_id IS NULL;

        IF NOT EXISTS (
          SELECT 1 FROM public.employee_history h
           WHERE h.employee_id = emp.id AND h.action = 'hired' AND h.remarks = history_marker
        ) THEN
          INSERT INTO public.employee_history
            (employee_id, action, field_changed, old_value, new_value, effective_date, reason, remarks, performed_by)
          VALUES (
            emp.id,
            'hired',
            'assignment',
            NULL,
            jsonb_build_object(
              'position', emp."position",
              'department', emp.department,
              'division', emp.division,
              'plantilla_num', emp.plantilla_num
            )::text,
            coalesce(emp.date_hired, slot.filled_at::date, public.manila_today()),
            'Adopted legacy external hire',
            history_marker,
            actor
          );
        END IF;

        RETURN jsonb_build_object(
          'applicant_id', app.id,
          'employee_uuid', emp.id,
          'employee_number', emp.employee_number,
          'slot_id', slot.id,
          'completed_at', slot.filled_at,
          'already_completed', true
        );
      END IF;
    END IF;
  END IF;

  IF emp.id IS NOT NULL OR is_hired OR slot_is_mine OR history_exists THEN
    RAISE EXCEPTION 'This external hire was partly completed by an earlier process. It needs to be checked before it can be completed.'
      USING ERRCODE = 'P0001', HINT = 'partial_completion';
  END IF;

  -- ── Strict reserve-then-hire plantilla and status checks (F1) ──────────────
  IF slot.id IS NULL THEN
    RAISE EXCEPTION 'This application is not linked to a plantilla.'
      USING ERRCODE = 'P0001', HINT = 'slot_missing';
  END IF;
  IF slot.status = 'filled' THEN
    RAISE EXCEPTION 'This plantilla has already been filled by another applicant.'
      USING ERRCODE = 'P0001', HINT = 'slot_filled_elsewhere';
  END IF;
  IF slot.reserved_by_applicant_id IS NOT NULL AND slot.reserved_by_applicant_id <> app.id THEN
    RAISE EXCEPTION 'This plantilla is reserved for another applicant.'
      USING ERRCODE = 'P0001', HINT = 'slot_reserved_elsewhere';
  END IF;
  IF slot.status <> 'open'
     OR slot.reserved_by_applicant_id IS NULL
     OR app.status IS DISTINCT FROM 'For Contract Signing' THEN
    RAISE EXCEPTION 'This applicant is not currently selected for this plantilla. Select them again before completing.'
      USING ERRCODE = 'P0001', HINT = 'not_reserved';
  END IF;

  -- ── Target assignment from the reserved plantilla and its posting ──────────
  SELECT * INTO posting FROM public.job_postings jp
   WHERE jp.id = slot.job_posting_id AND jp.deleted_at IS NULL;
  IF NOT FOUND OR btrim(coalesce(posting.title, '')) = '' THEN
    RAISE EXCEPTION 'The job posting for this plantilla no longer exists.'
      USING ERRCODE = 'P0001', HINT = 'posting_missing';
  END IF;

  SELECT count(*), min(d.name) INTO office_count, office_name
    FROM public.departments d
   WHERE d.is_active
     AND lower(btrim(d.name)) = lower(btrim(posting.department));
  IF office_count > 1 THEN
    RAISE EXCEPTION 'The posting''s office "%" matches more than one active office. Resolve the duplicate first.', posting.department
      USING ERRCODE = 'P0001', HINT = 'office_ambiguous';
  END IF;
  IF office_count = 0 THEN
    RAISE EXCEPTION 'The posting''s office "%" is not an active office.', coalesce(posting.department, '')
      USING ERRCODE = 'P0001', HINT = 'office_inactive';
  END IF;

  plantilla_no := substring(slot.label FROM '^\s*[Pp]lantilla\s+([0-9]+)\s*$');
  IF plantilla_no IS NULL THEN
    RAISE EXCEPTION 'Cannot read a plantilla number from "%".', slot.label
      USING ERRCODE = 'P0001', HINT = 'plantilla_ambiguous';
  END IF;

  target_division := coalesce(nullif(btrim(slot.division), ''), nullif(btrim(posting.division), ''));

  -- ── Deterministic identity collision checks (never randomize) ──────────────
  IF EXISTS (
    SELECT 1 FROM public.employees e
     WHERE lower(btrim(e.employee_number)) = lower(btrim(candidate_emp_no))
  ) THEN
    RAISE EXCEPTION 'Employee number "%" is already assigned to another employee record. Resolve the conflict before completing this hire.', candidate_emp_no
      USING ERRCODE = 'P0001', HINT = 'employee_number_conflict';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.employees e
     WHERE lower(btrim(e.email)) = lower(btrim(candidate_email))
  ) THEN
    RAISE EXCEPTION 'Email "%" is already assigned to another employee record. Resolve the conflict before completing this hire.', candidate_email
      USING ERRCODE = 'P0001', HINT = 'email_conflict';
  END IF;

  -- ── Atomic writes ──────────────────────────────────────────────────────────
  valid_sex := CASE
    WHEN btrim(coalesce(app.gender, '')) IN ('Male', 'Female', 'Other')
      THEN btrim(app.gender)
    ELSE NULL
  END;

  INSERT INTO public.employees (
    employee_number,
    application_id,
    first_name,
    middle_name,
    last_name,
    email,
    phone,
    current_address_street,
    permanent_address_street,
    sex,
    "position",
    department,
    division,
    plantilla_num,
    employment_status,
    date_hired,
    status,
    user_account_id,
    created_by,
    modified_by
  ) VALUES (
    candidate_emp_no,
    app.id,
    coalesce(nullif(btrim(app.first_name), ''), ''),
    nullif(btrim(coalesce(app.middle_name, '')), ''),
    coalesce(nullif(btrim(app.last_name), ''), ''),
    candidate_email,
    nullif(btrim(coalesce(app.contact_number, '')), ''),
    nullif(btrim(coalesce(app.address, '')), ''),
    nullif(btrim(coalesce(app.address, '')), ''),
    valid_sex,
    btrim(posting.title),
    office_name,
    target_division,
    plantilla_no,
    'Regular',
    public.manila_today(),
    'Active',
    NULL,
    actor,
    actor
  )
  RETURNING * INTO emp;

  UPDATE public.plantilla_slots
     SET status                 = 'filled',
         filled_by_applicant_id = app.id
   WHERE id = slot.id
  RETURNING filled_at INTO completed_at;

  UPDATE public.applicants
     SET status                  = 'Hired',
         employee_id             = emp.employee_number,
         needs_slot_reassignment = false,
         updated_at              = now()
   WHERE id = app.id;

  INSERT INTO public.employee_history
    (employee_id, action, field_changed, old_value, new_value, effective_date, reason, remarks, performed_by)
  VALUES (
    emp.id,
    'hired',
    'assignment',
    NULL,
    jsonb_build_object(
      'position', btrim(posting.title),
      'department', office_name,
      'division', target_division,
      'plantilla_num', plantilla_no
    )::text,
    public.manila_today(),
    'External appointment',
    history_marker,
    actor
  );

  RETURN jsonb_build_object(
    'applicant_id', app.id,
    'employee_uuid', emp.id,
    'employee_number', emp.employee_number,
    'slot_id', slot.id,
    'completed_at', completed_at,
    'already_completed', false
  );
END $$;

REVOKE ALL ON FUNCTION public.complete_external_hire(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_external_hire(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.complete_external_hire(uuid, uuid) IS
  'Completes a reserved external appointment atomically and idempotently. See migration 20261120160156.';

NOTIFY pgrst, 'reload schema';

COMMIT;
