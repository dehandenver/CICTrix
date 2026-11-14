-- ============================================================================
-- Complete a promotional appointment in one retry-safe transaction
-- ============================================================================
-- Plan: docs/plans/2026-10-30-promotional-hiring-fixes.md, Task 4.
--
-- A promotion moves an EXISTING employee into the plantilla reserved for their
-- application. Doing that as separate browser writes could leave it half done
-- (plantilla filled but employee unchanged, or a second employee inserted), so
-- every write happens here, together:
--
--   * the employee's assignment fields (position, office, division, plantilla
--     number) are updated in place. Their UUID, employee number, email, hire
--     date, employment status and portal account are never touched, and no
--     employee or portal account is inserted;
--   * the reserved plantilla is filled by this application, which fires the
--     existing triggers that clear the reservation and archive the other
--     applicants for that plantilla;
--   * the application becomes 'Hired', which fires the existing trigger that
--     withdraws the person's other open applications;
--   * one employee_history row ('promoted') records the change, by the verified
--     actor at database time.
--
-- Retry safety: a repeated call for an application that is fully completed
-- returns already_completed = true and writes nothing, even if the employee
-- has been promoted again since. A partly completed legacy record is reported
-- as a conflict, never repaired here.
--
-- Callers: an authenticated RSP or ADMIN (actor = auth.uid(); a different
-- p_actor_user_id is refused), or the service-role backend passing the user it
-- has already verified. Either way the actor needs an active RSP/ADMIN
-- user_roles row. anon and PUBLIC cannot execute this function.
--
-- Lock order: employees -> plantilla_slots -> applicants ->
-- employee_portal_accounts. The employee comes first so two promotions of the
-- same person queue up before either holds a plantilla or application lock:
-- completing one fires the trigger that withdraws the person's other
-- applications, and that trigger must not wait on a row the second call has
-- already locked. Plantilla before application matches reserve_plantilla_slot.
--
-- Errors carry a machine-readable HINT for the client: not_authorized
-- (SQLSTATE 42501), and with SQLSTATE P0001: application_not_found,
-- not_promotion, employee_not_found, employee_ambiguous, account_missing,
-- account_ambiguous, slot_missing, slot_filled_elsewhere,
-- slot_reserved_elsewhere, not_reserved, assessment_incomplete,
-- posting_missing, office_inactive, plantilla_ambiguous, partial_completion,
-- concurrent_change.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.complete_promotional_appointment(
  p_applicant_id  uuid,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
-- public stays on the path because the existing slot and office triggers this
-- function fires reference their tables unqualified. pg_temp goes last so a
-- temporary object can never shadow a real one.
SET search_path = public, pg_temp
AS $$
DECLARE
  actor          uuid;
  jwt_user       uuid := auth.uid();
  slot_id        uuid;
  slot           public.plantilla_slots%ROWTYPE;
  app            public.applicants%ROWTYPE;
  emp            public.employees%ROWTYPE;
  employee_ids   uuid[];
  account_count  integer;
  office_count   integer;
  posting        public.job_postings%ROWTYPE;
  office_name    text;
  plantilla_no   text;
  target_division text;
  history_marker text := 'Application ' || p_applicant_id::text;
  is_hired       boolean;
  slot_is_mine   boolean;
  history_exists boolean;
  completed_at   timestamptz;
BEGIN
  -- ── Caller ────────────────────────────────────────────────────────────────
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
    RAISE EXCEPTION 'Only an active RSP or Admin user can complete a promotion.'
      USING ERRCODE = '42501', HINT = 'not_authorized';
  END IF;

  -- ── Unlocked read: which employee and plantilla to lock ───────────────────
  SELECT * INTO app FROM public.applicants a
   WHERE a.id = p_applicant_id AND a.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This application no longer exists.'
      USING ERRCODE = 'P0001', HINT = 'application_not_found';
  END IF;
  IF lower(btrim(coalesce(app.application_type, ''))) NOT IN ('promotion', 'promotional') THEN
    RAISE EXCEPTION 'This is not a promotional application.'
      USING ERRCODE = 'P0001', HINT = 'not_promotion';
  END IF;
  slot_id := app.plantilla_slot_id;

  -- ── Locks, in the documented order ────────────────────────────────────────
  SELECT array_agg(e.id) INTO employee_ids
    FROM public.employees e
   WHERE e.deleted_at IS NULL
     AND lower(btrim(e.employee_number)) = lower(btrim(app.employee_id));
  IF employee_ids IS NULL THEN
    RAISE EXCEPTION 'No current employee has employee number "%".', coalesce(app.employee_id, '')
      USING ERRCODE = 'P0001', HINT = 'employee_not_found';
  END IF;
  IF cardinality(employee_ids) > 1 THEN
    RAISE EXCEPTION 'Employee number "%" matches more than one employee. Resolve the duplicate first.', app.employee_id
      USING ERRCODE = 'P0001', HINT = 'employee_ambiguous';
  END IF;
  SELECT * INTO emp FROM public.employees e
   WHERE e.id = employee_ids[1] AND e.deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No current employee has employee number "%".', coalesce(app.employee_id, '')
      USING ERRCODE = 'P0001', HINT = 'employee_not_found';
  END IF;

  IF slot_id IS NOT NULL THEN
    SELECT * INTO slot FROM public.plantilla_slots s WHERE s.id = slot_id FOR UPDATE;
  END IF;

  SELECT * INTO app FROM public.applicants a WHERE a.id = p_applicant_id FOR UPDATE;
  IF app.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'This application no longer exists.'
      USING ERRCODE = 'P0001', HINT = 'application_not_found';
  END IF;
  -- Anything used to pick the locks must still hold now that they are held.
  IF app.plantilla_slot_id IS DISTINCT FROM slot_id
     OR lower(btrim(coalesce(app.employee_id, ''))) <> lower(btrim(emp.employee_number))
     OR lower(btrim(coalesce(app.application_type, ''))) NOT IN ('promotion', 'promotional') THEN
    RAISE EXCEPTION 'This application changed while it was being completed. Refresh and try again.'
      USING ERRCODE = 'P0001', HINT = 'concurrent_change';
  END IF;

  -- ── Already completed? ────────────────────────────────────────────────────
  -- Checked before the account: a replay writes nothing, so a later change to
  -- the account must not turn a safe retry into a rejection.
  is_hired       := public.is_hired_application_status(app.status);
  slot_is_mine   := slot.id IS NOT NULL AND slot.status = 'filled' AND slot.filled_by_applicant_id = app.id;
  history_exists := EXISTS (
    SELECT 1 FROM public.employee_history h
     WHERE h.employee_id = emp.id AND h.action = 'promoted' AND h.remarks = history_marker);

  IF is_hired AND slot_is_mine AND history_exists THEN
    RETURN jsonb_build_object(
      'applicant_id', app.id, 'employee_uuid', emp.id, 'employee_number', emp.employee_number,
      'slot_id', slot.id, 'completed_at', slot.filled_at, 'already_completed', true);
  END IF;
  IF is_hired OR slot_is_mine OR history_exists THEN
    RAISE EXCEPTION 'This promotion was partly completed by an earlier process. It needs to be checked before it can be completed.'
      USING ERRCODE = 'P0001', HINT = 'partial_completion';
  END IF;

  -- The account is only read, never changed; a share lock keeps it from being
  -- deleted or relinked mid-promotion.
  SELECT count(*) INTO account_count
    FROM (SELECT 1 FROM public.employee_portal_accounts pa
           WHERE pa.deleted_at IS NULL
             AND lower(btrim(pa.employee_id)) = lower(btrim(emp.employee_number))
             FOR SHARE) linked;
  IF account_count = 0 THEN
    RAISE EXCEPTION 'Employee % has no portal account. Set up their account before completing the promotion.', emp.employee_number
      USING ERRCODE = 'P0001', HINT = 'account_missing';
  END IF;
  IF account_count > 1 THEN
    RAISE EXCEPTION 'Employee % has more than one portal account. Resolve the duplicate first.', emp.employee_number
      USING ERRCODE = 'P0001', HINT = 'account_ambiguous';
  END IF;

  -- ── Plantilla and reservation ─────────────────────────────────────────────
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
  IF slot.status <> 'open' OR slot.reserved_by_applicant_id IS NULL OR app.status IS DISTINCT FROM 'For Contract Signing' THEN
    RAISE EXCEPTION 'This applicant is not currently selected for this plantilla. Select them again before completing.'
      USING ERRCODE = 'P0001', HINT = 'not_reserved';
  END IF;

  -- ── Saved promotional assessment ──────────────────────────────────────────
  -- Same rule as For Hiring: a finalized promotional score row with all five
  -- categories scored (zero counts) and a written exam score.
  IF NOT EXISTS (
    SELECT 1 FROM public.applicant_category_scores sc
     WHERE sc.applicant_id = app.id
       AND sc.appointment_type = 'promotional'
       AND sc.is_finalized
       AND jsonb_typeof(sc.education   -> 'finalScore') = 'number'
       AND jsonb_typeof(sc.experience  -> 'finalScore') = 'number'
       AND jsonb_typeof(sc.performance -> 'finalScore') = 'number'
       AND jsonb_typeof(sc.potential   -> 'finalScore') = 'number'
       AND jsonb_typeof(sc.pcpt        -> 'finalScore') = 'number'
       AND (sc.written_exam_raw_score IS NOT NULL
            OR jsonb_typeof(sc.written_exam -> 'finalScore') = 'number')
  ) THEN
    RAISE EXCEPTION 'The promotional assessment is not complete. Save all five categories and the written exam score first.'
      USING ERRCODE = 'P0001', HINT = 'assessment_incomplete';
  END IF;

  -- ── Target assignment, from the plantilla and its posting only ────────────
  SELECT * INTO posting FROM public.job_postings jp
   WHERE jp.id = slot.job_posting_id AND jp.deleted_at IS NULL;
  IF NOT FOUND OR btrim(coalesce(posting.title, '')) = '' THEN
    RAISE EXCEPTION 'The job posting for this plantilla no longer exists.'
      USING ERRCODE = 'P0001', HINT = 'posting_missing';
  END IF;

  SELECT count(*), min(d.name) INTO office_count, office_name FROM public.departments d
   WHERE d.is_active AND lower(btrim(d.name)) = lower(btrim(posting.department));
  IF office_count > 1 THEN
    RAISE EXCEPTION 'The posting''s office "%" matches more than one active office. Resolve the duplicate first.', posting.department
      USING ERRCODE = 'P0001', HINT = 'office_ambiguous';
  END IF;
  IF office_count = 0 THEN
    RAISE EXCEPTION 'The posting''s office "%" is not an active office.', coalesce(posting.department, '')
      USING ERRCODE = 'P0001', HINT = 'office_inactive';
  END IF;

  -- The employee-facing plantilla number comes from the "Plantilla <n>" label;
  -- item_number is an internal key.
  plantilla_no := substring(slot.label FROM '^\s*[Pp]lantilla\s+([0-9]+)\s*$');
  IF plantilla_no IS NULL THEN
    RAISE EXCEPTION 'Cannot read a plantilla number from "%".', slot.label
      USING ERRCODE = 'P0001', HINT = 'plantilla_ambiguous';
  END IF;

  target_division := coalesce(nullif(btrim(slot.division), ''), nullif(btrim(posting.division), ''));

  -- ── Writes ────────────────────────────────────────────────────────────────
  UPDATE public.employees
     SET "position"    = btrim(posting.title),
         department    = office_name,
         division      = target_division,
         plantilla_num = plantilla_no,
         modified_by   = actor
   WHERE id = emp.id;

  UPDATE public.plantilla_slots
     SET status = 'filled',
         filled_by_applicant_id = app.id
   WHERE id = slot.id
  RETURNING filled_at INTO completed_at;

  UPDATE public.applicants
     SET status = 'Hired',
         needs_slot_reassignment = false,
         updated_at = now()
   WHERE id = app.id;

  INSERT INTO public.employee_history
    (employee_id, action, field_changed, old_value, new_value, effective_date, reason, remarks, performed_by)
  VALUES (
    emp.id, 'promoted', 'assignment',
    jsonb_build_object('position', emp."position", 'department', emp.department,
                       'division', emp.division, 'plantilla_num', emp.plantilla_num)::text,
    jsonb_build_object('position', btrim(posting.title), 'department', office_name,
                       'division', target_division, 'plantilla_num', plantilla_no)::text,
    public.manila_today(), 'Promotional appointment', history_marker, actor);

  RETURN jsonb_build_object(
    'applicant_id', app.id, 'employee_uuid', emp.id, 'employee_number', emp.employee_number,
    'slot_id', slot.id, 'completed_at', completed_at, 'already_completed', false);
END $$;

REVOKE ALL ON FUNCTION public.complete_promotional_appointment(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_promotional_appointment(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.complete_promotional_appointment(uuid, uuid) IS
  'Completes a reserved promotional appointment atomically and idempotently. See migration 20261102041556.';
