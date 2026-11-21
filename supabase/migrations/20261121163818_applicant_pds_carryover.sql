-- ============================================================================
-- Carry applicant work history, education, and PWD into new-hire PDS
-- ============================================================================
-- Plan: docs/plans/2026-11-21-applicant-to-pds-carryover.md.
--
-- Adds applicants.work_experience_entries (jsonb array) and extends
-- complete_external_hire so external hires atomically seed:
--   * employees.highest_educational_attainment + employees.person_with_disability
--   * public.employee_education (when attainment + school are provided)
--   * public.employee_work_experience rows from work_experience_entries
-- Also updates save_pds_section so setting to_date on an existing work
-- experience row clears is_present = false.
-- ============================================================================

BEGIN;

-- ── 1. Ensure schema columns & array constraint ─────────────────────────────
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS highest_educational_attainment text,
  ADD COLUMN IF NOT EXISTS person_with_disability boolean;

ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS education_level text,
  ADD COLUMN IF NOT EXISTS education_degree text,
  ADD COLUMN IF NOT EXISTS education_school text,
  ADD COLUMN IF NOT EXISTS is_pwd boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS work_experience_entries jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.applicants'::regclass
       AND conname = 'applicants_work_experience_entries_is_array'
  ) THEN
    ALTER TABLE public.applicants
      ADD CONSTRAINT applicants_work_experience_entries_is_array
      CHECK (jsonb_typeof(work_experience_entries) = 'array');
  END IF;
END $$;

-- ── 2. Updated transactional external hire RPC ──────────────────────────────
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
  edu_level          text;
  edu_school         text;
  edu_degree         text;
  work_elem          record;
  work_entry         jsonb;
  work_pos           text;
  work_comp          text;
  work_from_txt      text;
  work_from_date     date;
  work_to_txt        text;
  work_to_date       date;
  work_is_present    boolean;
  work_duties        text;
  work_govt          boolean;
  work_sort_idx      integer := 0;
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

  -- ── Strict reserve-then-hire plantilla and status checks ───────────────────
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

  -- ── Deterministic identity collision checks ────────────────────────────────
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
    highest_educational_attainment,
    person_with_disability,
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
    nullif(btrim(coalesce(app.education_level, '')), ''),
    app.is_pwd,
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

  -- Seed PDS Section III (Education) when attainment and school are present.
  edu_level := CASE btrim(coalesce(app.education_level, ''))
    WHEN 'Elementary Level' THEN 'Elementary'
    WHEN 'Elementary Graduate' THEN 'Elementary'
    WHEN 'Elementary' THEN 'Elementary'
    WHEN 'High School Level' THEN 'Secondary'
    WHEN 'High School Graduate' THEN 'Secondary'
    WHEN 'Secondary' THEN 'Secondary'
    WHEN 'Vocational' THEN 'Vocational'
    WHEN 'College Level' THEN 'College'
    WHEN 'College Graduate' THEN 'College'
    WHEN 'College' THEN 'College'
    WHEN 'Masteral Units' THEN 'Graduate Studies'
    WHEN 'Graduate School' THEN 'Graduate Studies'
    WHEN 'Graduate Studies' THEN 'Graduate Studies'
    WHEN 'Doctorate' THEN 'Doctorate'
    ELSE NULL
  END;
  edu_school := nullif(btrim(coalesce(app.education_school, '')), '');
  edu_degree := nullif(btrim(coalesce(app.education_degree, '')), '');

  IF edu_level IS NOT NULL AND edu_school IS NOT NULL THEN
    INSERT INTO public.employee_education (
      employee_id,
      level,
      school_name,
      course,
      sort_order
    ) VALUES (
      emp.id,
      edu_level,
      edu_school,
      edu_degree,
      0
    );
  END IF;

  -- Seed PDS Section V (Work Experience) from applicant work_experience_entries.
  work_sort_idx := 0;
  FOR work_elem IN
    SELECT elem.value
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(app.work_experience_entries) = 'array'
            THEN app.work_experience_entries
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY AS elem(value, ord)
     ORDER BY elem.ord
  LOOP
    work_entry := work_elem.value;
    IF jsonb_typeof(work_entry) <> 'object' THEN
      CONTINUE;
    END IF;

    work_pos := nullif(btrim(coalesce(work_entry->>'position_title', '')), '');
    work_comp := nullif(btrim(coalesce(work_entry->>'company_name', '')), '');
    work_from_txt := nullif(btrim(coalesce(work_entry->>'from_date', '')), '');

    IF work_pos IS NULL OR work_comp IS NULL OR work_from_txt IS NULL OR work_from_txt !~ '^\d{4}-\d{2}-\d{2}$' THEN
      CONTINUE;
    END IF;

    work_from_date := NULL;
    BEGIN
      work_from_date := work_from_txt::date;
    EXCEPTION WHEN others THEN
      work_from_date := NULL;
    END;
    IF work_from_date IS NULL THEN
      CONTINUE;
    END IF;

    work_is_present := CASE
      WHEN jsonb_typeof(work_entry->'is_present') = 'boolean'
        THEN (work_entry->>'is_present')::boolean
      ELSE false
    END;

    work_to_date := NULL;
    IF NOT work_is_present THEN
      work_to_txt := nullif(btrim(coalesce(work_entry->>'to_date', '')), '');
      IF work_to_txt IS NOT NULL AND work_to_txt ~ '^\d{4}-\d{2}-\d{2}$' THEN
        BEGIN
          work_to_date := work_to_txt::date;
        EXCEPTION WHEN others THEN
          work_to_date := NULL;
        END;
        IF work_to_date IS NOT NULL AND work_to_date < work_from_date THEN
          work_to_date := NULL;
        END IF;
      END IF;
    END IF;

    work_duties := nullif(btrim(coalesce(work_entry->>'duties_responsibilities', '')), '');
    work_govt := CASE
      WHEN jsonb_typeof(work_entry->'is_government_service') = 'boolean'
        THEN (work_entry->>'is_government_service')::boolean
      ELSE false
    END;

    INSERT INTO public.employee_work_experience (
      employee_id,
      position_title,
      company_name,
      from_date,
      to_date,
      is_present,
      is_government_service,
      duties_responsibilities,
      sort_order
    ) VALUES (
      emp.id,
      work_pos,
      work_comp,
      work_from_date,
      work_to_date,
      work_is_present,
      work_govt,
      work_duties,
      work_sort_idx
    );

    work_sort_idx := work_sort_idx + 1;
  END LOOP;

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
  'Completes a reserved external appointment atomically, idempotently, and carries over applicant work history, education, and PWD status. See migration 20261121163818.';

-- ── 3. Clear is_present when save_pds_section sets a to_date ────────────────
CREATE OR REPLACE FUNCTION public.save_pds_section(
  p_employee_id uuid,
  p_section text,
  p_rows jsonb,
  p_expected_revision text,
  p_scalar_patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_table text;
  v_input_cols text[];
  v_types jsonb;
  v_required text[];
  v_placeholder_exempt text[];
  v_scalar_cols text[];
  v_scalar_types jsonb;
  v_range_from text;
  v_range_to text;
  v_has_updated_at boolean;
  v_employee jsonb;
  v_rows jsonb;
  v_scalars jsonb;
  v_revision text;
  v_current_rows jsonb;
  v_current_scalars jsonb;
  v_current_revision text;
  v_current_ids uuid[];
  v_final_ids uuid[];
  v_input_ids uuid[] := '{}'::uuid[];
  v_desired_ids uuid[] := '{}'::uuid[];
  v_valid_rows jsonb := '[]'::jsonb;
  v_row jsonb;
  v_value jsonb;
  v_text text;
  v_id uuid;
  v_new_id uuid;
  v_key text;
  v_col text;
  v_order integer;
  v_meaningful boolean;
  v_set_parts text[];
  v_insert_cols text[];
  v_insert_vals text[];
  v_scalar_set text[];
  v_sql text;
  v_matched integer;
  v_deleted integer;
  v_expected_deleted integer;
  v_final_count integer;
begin
  if p_employee_id is null then
    raise exception 'pds_employee_required'
      using errcode = '22023', detail = 'A PDS section needs an employee id.';
  end if;

  if p_expected_revision is null or btrim(p_expected_revision) = '' then
    raise exception 'pds_revision_required'
      using errcode = '22023', detail = 'Load the section before saving it.';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'pds_rows_array_required'
      using errcode = '22023', detail = 'Section rows must be a JSON array.';
  end if;

  p_scalar_patch := coalesce(p_scalar_patch, '{}'::jsonb);
  if jsonb_typeof(p_scalar_patch) <> 'object' then
    raise exception 'pds_scalar_object_required'
      using errcode = '22023', detail = 'The scalar patch must be a JSON object.';
  end if;

  v_table := case p_section
    when 'children' then 'employee_children'
    when 'education' then 'employee_education'
    when 'eligibility' then 'employee_eligibility'
    when 'workExperience' then 'employee_work_experience'
    when 'voluntaryWork' then 'employee_voluntary_work'
    when 'training' then 'employee_ld_interventions'
    when 'references' then 'employee_references'
    else null
  end;

  if v_table is null then
    raise exception 'pds_invalid_section'
      using errcode = '22023',
            detail = format('Unknown PDS list section: %s.', coalesce(p_section, '<null>'));
  end if;

  v_input_cols := case p_section
    when 'children' then array['id', 'full_name', 'date_of_birth']
    when 'education' then array[
      'id', 'level', 'school_name', 'course', 'year_attended_from',
      'year_attended_to', 'units_earned', 'year_graduated', 'honors_awards'
    ]
    when 'eligibility' then array[
      'id', 'eligibility_type', 'rating', 'date_of_exam',
      'place_of_examination', 'license_number', 'validity_date'
    ]
    when 'workExperience' then array[
      'id', 'from_date', 'to_date', 'position_title', 'company_name',
      'status_of_appointment', 'is_government_service'
    ]
    when 'voluntaryWork' then array[
      'id', 'org_name_address', 'date_from', 'date_to', 'number_of_hours',
      'position_nature_of_work'
    ]
    when 'training' then array[
      'id', 'title', 'date_from', 'date_to', 'number_of_hours', 'ld_type',
      'conducted_by'
    ]
    when 'references' then array['id', 'name', 'address', 'contact_info']
  end;

  v_types := case p_section
    when 'children' then jsonb_build_object(
      'id', 'uuid', 'full_name', 'text', 'date_of_birth', 'date'
    )
    when 'education' then jsonb_build_object(
      'id', 'uuid', 'level', 'text', 'school_name', 'text', 'course', 'text',
      'year_attended_from', 'integer', 'year_attended_to', 'integer',
      'units_earned', 'integer', 'year_graduated', 'integer',
      'honors_awards', 'text'
    )
    when 'eligibility' then jsonb_build_object(
      'id', 'uuid', 'eligibility_type', 'text', 'rating', 'numeric',
      'date_of_exam', 'date', 'place_of_examination', 'text',
      'license_number', 'text', 'validity_date', 'date'
    )
    when 'workExperience' then jsonb_build_object(
      'id', 'uuid', 'from_date', 'date', 'to_date', 'date',
      'position_title', 'text', 'company_name', 'text',
      'status_of_appointment', 'text', 'is_government_service', 'boolean'
    )
    when 'voluntaryWork' then jsonb_build_object(
      'id', 'uuid', 'org_name_address', 'text', 'date_from', 'date',
      'date_to', 'date', 'number_of_hours', 'numeric',
      'position_nature_of_work', 'text'
    )
    when 'training' then jsonb_build_object(
      'id', 'uuid', 'title', 'text', 'date_from', 'date', 'date_to', 'date',
      'number_of_hours', 'numeric', 'ld_type', 'text', 'conducted_by', 'text'
    )
    when 'references' then jsonb_build_object(
      'id', 'uuid', 'name', 'text', 'address', 'text', 'contact_info', 'text'
    )
  end;

  v_required := case p_section
    when 'children' then array['full_name']
    when 'education' then array['level', 'school_name']
    when 'eligibility' then array['eligibility_type']
    when 'workExperience' then array['from_date', 'position_title', 'company_name']
    when 'voluntaryWork' then array['org_name_address']
    when 'training' then array['title']
    when 'references' then array['name']
  end;

  v_placeholder_exempt := case
    when p_section = 'education' then array['level']
    else '{}'::text[]
  end;

  v_scalar_cols := case p_section
    when 'children' then array[
      'spouse_surname', 'spouse_first_name', 'spouse_middle_name', 'spouse_suffix',
      'spouse_occupation', 'spouse_employer', 'spouse_business_address',
      'spouse_telephone', 'father_surname', 'father_first_name',
      'father_middle_name', 'father_suffix', 'mother_surname',
      'mother_first_name', 'mother_middle_name'
    ]
    when 'references' then array[
      'related_third_degree', 'related_fourth_degree', 'related_details',
      'admin_offense_guilty', 'admin_offense_details', 'criminally_charged',
      'criminal_charge_details', 'criminal_case_date_filed',
      'criminal_case_status', 'convicted_of_crime', 'convicted_details',
      'separated_from_service', 'separated_details', 'election_candidate',
      'election_candidate_details', 'resigned_to_campaign',
      'resigned_to_campaign_details', 'immigrant_status', 'immigrant_country',
      'indigenous_group_member', 'indigenous_group_specify',
      'person_with_disability', 'pwd_id_number', 'solo_parent',
      'solo_parent_id_number', 'gov_id_type', 'gov_id_number',
      'gov_id_issued_date_place'
    ]
    else '{}'::text[]
  end;

  v_scalar_types := case p_section
    when 'children' then jsonb_build_object(
      'spouse_surname', 'text', 'spouse_first_name', 'text',
      'spouse_middle_name', 'text', 'spouse_suffix', 'text',
      'spouse_occupation', 'text', 'spouse_employer', 'text',
      'spouse_business_address', 'text', 'spouse_telephone', 'text',
      'father_surname', 'text', 'father_first_name', 'text',
      'father_middle_name', 'text', 'father_suffix', 'text',
      'mother_surname', 'text', 'mother_first_name', 'text',
      'mother_middle_name', 'text'
    )
    when 'references' then jsonb_build_object(
      'related_third_degree', 'boolean', 'related_fourth_degree', 'boolean',
      'related_details', 'text', 'admin_offense_guilty', 'boolean',
      'admin_offense_details', 'text', 'criminally_charged', 'boolean',
      'criminal_charge_details', 'text', 'criminal_case_date_filed', 'date',
      'criminal_case_status', 'text', 'convicted_of_crime', 'boolean',
      'convicted_details', 'text', 'separated_from_service', 'boolean',
      'separated_details', 'text', 'election_candidate', 'boolean',
      'election_candidate_details', 'text', 'resigned_to_campaign', 'boolean',
      'resigned_to_campaign_details', 'text', 'immigrant_status', 'boolean',
      'immigrant_country', 'text', 'indigenous_group_member', 'boolean',
      'indigenous_group_specify', 'text', 'person_with_disability', 'boolean',
      'pwd_id_number', 'text', 'solo_parent', 'boolean',
      'solo_parent_id_number', 'text', 'gov_id_type', 'text',
      'gov_id_number', 'text', 'gov_id_issued_date_place', 'text'
    )
    else '{}'::jsonb
  end;

  v_range_from := case p_section
    when 'education' then 'year_attended_from'
    when 'workExperience' then 'from_date'
    when 'voluntaryWork' then 'date_from'
    when 'training' then 'date_from'
    else null
  end;
  v_range_to := case p_section
    when 'education' then 'year_attended_to'
    when 'workExperience' then 'to_date'
    when 'voluntaryWork' then 'date_to'
    when 'training' then 'date_to'
    else null
  end;

  v_has_updated_at := p_section in (
    'children', 'voluntaryWork', 'training', 'references'
  );

  select to_jsonb(e)
    into v_employee
    from public.employees e
   where e.id = p_employee_id
   for update;

  if v_employee is null then
    raise exception 'pds_employee_not_found'
      using errcode = 'P0002', detail = 'No visible employee row for this section.';
  end if;

  execute format(
    'select coalesce(
       (select jsonb_agg(to_jsonb(t) order by t.sort_order, t.id)
          from public.%I t
         where t.employee_id = $1),
       ''[]''::jsonb
     )',
    v_table
  )
  into v_current_rows
  using p_employee_id;

  v_current_scalars := case p_section
    when 'children' then jsonb_build_object(
      'spouse_surname', v_employee -> 'spouse_surname',
      'spouse_first_name', v_employee -> 'spouse_first_name',
      'spouse_middle_name', v_employee -> 'spouse_middle_name',
      'spouse_suffix', v_employee -> 'spouse_suffix',
      'spouse_occupation', v_employee -> 'spouse_occupation',
      'spouse_employer', v_employee -> 'spouse_employer',
      'spouse_business_address', v_employee -> 'spouse_business_address',
      'spouse_telephone', v_employee -> 'spouse_telephone',
      'father_surname', v_employee -> 'father_surname',
      'father_first_name', v_employee -> 'father_first_name',
      'father_middle_name', v_employee -> 'father_middle_name',
      'father_suffix', v_employee -> 'father_suffix',
      'mother_surname', v_employee -> 'mother_surname',
      'mother_first_name', v_employee -> 'mother_first_name',
      'mother_middle_name', v_employee -> 'mother_middle_name'
    )
    when 'references' then jsonb_build_object(
      'related_third_degree', v_employee -> 'related_third_degree',
      'related_fourth_degree', v_employee -> 'related_fourth_degree',
      'related_details', v_employee -> 'related_details',
      'admin_offense_guilty', v_employee -> 'admin_offense_guilty',
      'admin_offense_details', v_employee -> 'admin_offense_details',
      'criminally_charged', v_employee -> 'criminally_charged',
      'criminal_charge_details', v_employee -> 'criminal_charge_details',
      'criminal_case_date_filed', v_employee -> 'criminal_case_date_filed',
      'criminal_case_status', v_employee -> 'criminal_case_status',
      'convicted_of_crime', v_employee -> 'convicted_of_crime',
      'convicted_details', v_employee -> 'convicted_details',
      'separated_from_service', v_employee -> 'separated_from_service',
      'separated_details', v_employee -> 'separated_details',
      'election_candidate', v_employee -> 'election_candidate',
      'election_candidate_details', v_employee -> 'election_candidate_details',
      'resigned_to_campaign', v_employee -> 'resigned_to_campaign',
      'resigned_to_campaign_details', v_employee -> 'resigned_to_campaign_details',
      'immigrant_status', v_employee -> 'immigrant_status',
      'immigrant_country', v_employee -> 'immigrant_country',
      'indigenous_group_member', v_employee -> 'indigenous_group_member',
      'indigenous_group_specify', v_employee -> 'indigenous_group_specify',
      'person_with_disability', v_employee -> 'person_with_disability',
      'pwd_id_number', v_employee -> 'pwd_id_number',
      'solo_parent', v_employee -> 'solo_parent',
      'solo_parent_id_number', v_employee -> 'solo_parent_id_number',
      'gov_id_type', v_employee -> 'gov_id_type',
      'gov_id_number', v_employee -> 'gov_id_number',
      'gov_id_issued_date_place', v_employee -> 'gov_id_issued_date_place'
    )
    else '{}'::jsonb
  end;

  v_current_revision := md5(v_current_rows::text || '|' || v_current_scalars::text);

  if p_expected_revision <> v_current_revision then
    raise exception 'pds_revision_conflict'
      using errcode = '40001',
            detail = format(
              'Section %s changed since it was loaded.',
              p_section
            );
  end if;

  select coalesce(array_agg((r.value ->> 'id')::uuid), '{}'::uuid[])
    into v_current_ids
    from jsonb_array_elements(v_current_rows) as r(value);

  for v_row, v_order in
    select r.value, r.ordinality::integer
      from jsonb_array_elements(p_rows) with ordinality as r(value, ordinality)
  loop
    if jsonb_typeof(v_row) <> 'object' then
      raise exception 'pds_row_object_required'
        using errcode = '22023',
              detail = format('Row %s is not a JSON object.', v_order);
    end if;

    for v_key in select jsonb_object_keys(v_row)
    loop
      if not (v_key = any(v_input_cols)) then
        raise exception 'pds_invalid_column'
          using errcode = '22023',
                detail = format(
                  'Column %s is not editable in section %s.', v_key, p_section
                );
      end if;
    end loop;

    v_id := null;
    if v_row ? 'id' and jsonb_typeof(v_row -> 'id') <> 'null' then
      begin
        v_id := (v_row ->> 'id')::uuid;
      exception when others then
        raise exception 'pds_invalid_row_id'
          using errcode = '22023',
                detail = format('Row %s has an invalid id.', v_order);
      end;
    end if;

    v_meaningful := false;
    foreach v_col in array v_input_cols loop
      if v_col = 'id' or v_col = any(v_placeholder_exempt) then
        continue;
      end if;
      v_value := v_row -> v_col;
      if v_value is null or jsonb_typeof(v_value) = 'null' then
        continue;
      end if;
      if jsonb_typeof(v_value) = 'string' then
        if btrim(v_value #>> '{}') <> '' then
          v_meaningful := true;
        end if;
      else
        v_meaningful := true;
      end if;
    end loop;

    if v_id is null and not v_meaningful then
      continue;
    end if;

    if v_id is not null then
      if v_id = any(v_input_ids) then
        raise exception 'pds_duplicate_row_id'
          using errcode = '22023',
                detail = format('Row %s repeats an id in the same save.', v_order);
      end if;
      if not (v_id = any(v_current_ids)) then
        raise exception 'pds_row_not_owned'
          using errcode = '42501',
                detail = format(
                  'Row %s is not owned by employee %s in section %s.',
                  v_order, p_employee_id, p_section
                );
      end if;
      v_input_ids := v_input_ids || v_id;
    end if;

    foreach v_col in array v_input_cols loop
      if v_col = 'id' or not (v_row ? v_col) then
        continue;
      end if;
      v_value := v_row -> v_col;
      if v_value is null or jsonb_typeof(v_value) = 'null' then
        continue;
      end if;

      case (v_types ->> v_col)
        when 'text' then
          if jsonb_typeof(v_value) <> 'string' then
            raise exception 'pds_invalid_value'
              using errcode = '22023',
                    detail = format('Row %s column %s must be text.', v_order, v_col);
          end if;
        when 'date' then
          if jsonb_typeof(v_value) <> 'string' then
            raise exception 'pds_invalid_value'
              using errcode = '22023',
                    detail = format('Row %s column %s must be a date.', v_order, v_col);
          end if;
          v_text := btrim(v_value #>> '{}');
          if v_text = '' then
            continue;
          end if;
          if v_text !~ '^\d{4}-\d{2}-\d{2}$' then
            raise exception 'pds_invalid_value'
              using errcode = '22023',
                    detail = format('Row %s column %s is not YYYY-MM-DD.', v_order, v_col);
          end if;
          begin
            perform v_text::date;
          exception when others then
            raise exception 'pds_invalid_value'
              using errcode = '22023',
                    detail = format('Row %s column %s is not a calendar date.', v_order, v_col);
          end;
        when 'integer' then
          if jsonb_typeof(v_value) = 'number' or jsonb_typeof(v_value) = 'string' then
            v_text := btrim(v_value #>> '{}');
          else
            raise exception 'pds_invalid_value'
              using errcode = '22023',
                    detail = format('Row %s column %s must be a number.', v_order, v_col);
          end if;
          if v_text = '' then
            continue;
          end if;
          if v_text !~ '^-?\d+(\.\d+)?$' then
            raise exception 'pds_invalid_value'
              using errcode = '22023',
                    detail = format('Row %s column %s must be a whole number.', v_order, v_col);
          end if;
          if (v_text::numeric) <> trunc(v_text::numeric) then
            raise exception 'pds_invalid_value'
              using errcode = '22023',
                    detail = format('Row %s column %s must be a whole number.', v_order, v_col);
          end if;
        when 'numeric' then
          if jsonb_typeof(v_value) = 'number' or jsonb_typeof(v_value) = 'string' then
            v_text := btrim(v_value #>> '{}');
          else
            raise exception 'pds_invalid_value'
              using errcode = '22023',
                    detail = format('Row %s column %s must be a number.', v_order, v_col);
          end if;
          if v_text = '' then
            continue;
          end if;
          if v_text !~ '^-?(\d+(\.\d+)?|\.\d+)$' then
            raise exception 'pds_invalid_value'
              using errcode = '22023',
                    detail = format('Row %s column %s must be a finite number.', v_order, v_col);
          end if;
        when 'boolean' then
          if jsonb_typeof(v_value) <> 'boolean' then
            raise exception 'pds_invalid_value'
              using errcode = '22023',
                    detail = format('Row %s column %s must be true or false.', v_order, v_col);
          end if;
        else
          raise exception 'pds_invalid_value'
            using errcode = '22023',
                  detail = format('Row %s column %s has no editable type.', v_order, v_col);
      end case;
    end loop;

    foreach v_col in array v_required loop
      v_value := v_row -> v_col;
      if v_value is null
         or jsonb_typeof(v_value) = 'null'
         or (jsonb_typeof(v_value) = 'string' and btrim(v_value #>> '{}') = '') then
        raise exception 'pds_required_field'
          using errcode = '22023',
                detail = format('Row %s column %s is required.', v_order, v_col);
      end if;
    end loop;

    if v_range_from is not null
       and nullif(btrim(coalesce(v_row ->> v_range_from, '')), '') is not null
       and nullif(btrim(coalesce(v_row ->> v_range_to, '')), '') is not null then
      if p_section = 'education' then
        if (v_row ->> v_range_from)::integer > (v_row ->> v_range_to)::integer then
          raise exception 'pds_invalid_date_range'
            using errcode = '22023',
                  detail = format('Row %s has an end before its start.', v_order);
        end if;
      else
        if (v_row ->> v_range_from)::date > (v_row ->> v_range_to)::date then
          raise exception 'pds_invalid_date_range'
            using errcode = '22023',
                  detail = format('Row %s has an end before its start.', v_order);
        end if;
      end if;
    end if;

    v_valid_rows := v_valid_rows || jsonb_build_array(v_row);
  end loop;

  if p_scalar_patch <> '{}'::jsonb then
    if cardinality(v_scalar_cols) = 0 then
      raise exception 'pds_scalar_not_allowed'
        using errcode = '22023',
              detail = format('Section %s does not own scalar columns.', p_section);
    end if;

    for v_key in select jsonb_object_keys(p_scalar_patch)
    loop
      if not (v_key = any(v_scalar_cols)) then
        raise exception 'pds_invalid_scalar_column'
          using errcode = '22023',
                detail = format(
                  'Scalar column %s is not editable in section %s.', v_key, p_section
                );
      end if;
    end loop;

    foreach v_col in array v_scalar_cols loop
      if not (p_scalar_patch ? v_col) then
        continue;
      end if;
      v_value := p_scalar_patch -> v_col;
      if v_value is null or jsonb_typeof(v_value) = 'null' then
        continue;
      end if;

      case (v_scalar_types ->> v_col)
        when 'text' then
          if jsonb_typeof(v_value) <> 'string' then
            raise exception 'pds_invalid_scalar_value'
              using errcode = '22023',
                    detail = format('Scalar column %s must be text.', v_col);
          end if;
        when 'boolean' then
          if jsonb_typeof(v_value) <> 'boolean' then
            raise exception 'pds_invalid_scalar_value'
              using errcode = '22023',
                    detail = format('Scalar column %s must be true or false.', v_col);
          end if;
        when 'date' then
          if jsonb_typeof(v_value) <> 'string' then
            raise exception 'pds_invalid_scalar_value'
              using errcode = '22023',
                    detail = format('Scalar column %s must be a date.', v_col);
          end if;
          v_text := btrim(v_value #>> '{}');
          if v_text = '' then
            continue;
          end if;
          if v_text !~ '^\d{4}-\d{2}-\d{2}$' then
            raise exception 'pds_invalid_scalar_value'
              using errcode = '22023',
                    detail = format('Scalar column %s is not YYYY-MM-DD.', v_col);
          end if;
          begin
            perform v_text::date;
          exception when others then
            raise exception 'pds_invalid_scalar_value'
              using errcode = '22023',
                    detail = format('Scalar column %s is not a calendar date.', v_col);
          end;
        else
          raise exception 'pds_invalid_scalar_value'
            using errcode = '22023',
                  detail = format('Scalar column %s has no editable type.', v_col);
      end case;
    end loop;
  end if;

  select array_agg(
           format(
             '%I = %s',
             u.name,
             case (v_types ->> u.name)
               when 'text' then format('nullif(btrim($1->>%L), %L)', u.name, '')
               when 'date' then format('nullif(btrim($1->>%L), %L)::date', u.name, '')
               when 'integer' then format('nullif(btrim($1->>%L), %L)::integer', u.name, '')
               when 'numeric' then format('nullif(btrim($1->>%L), %L)::numeric', u.name, '')
               when 'boolean' then format('nullif(btrim($1->>%L), %L)::boolean', u.name, '')
               else format('nullif(btrim($1->>%L), %L)', u.name, '')
             end
           )
           order by u.ord
         )
    into v_set_parts
    from unnest(v_input_cols) with ordinality as u(name, ord)
   where u.name <> 'id';

  select array_agg(
           format(
             '%s',
             case (v_types ->> u.name)
               when 'text' then format('nullif(btrim($1->>%L), %L)', u.name, '')
               when 'date' then format('nullif(btrim($1->>%L), %L)::date', u.name, '')
               when 'integer' then format('nullif(btrim($1->>%L), %L)::integer', u.name, '')
               when 'numeric' then format('nullif(btrim($1->>%L), %L)::numeric', u.name, '')
               when 'boolean' then format('nullif(btrim($1->>%L), %L)::boolean', u.name, '')
               else format('nullif(btrim($1->>%L), %L)', u.name, '')
             end
           )
           order by u.ord
         )
    into v_insert_vals
    from unnest(v_input_cols) with ordinality as u(name, ord)
   where u.name <> 'id';

  select array_agg(format('%I', u.name) order by u.ord)
    into v_insert_cols
    from unnest(v_input_cols) with ordinality as u(name, ord)
   where u.name <> 'id';

  v_insert_cols := array['employee_id'] || v_insert_cols || array['sort_order'];
  v_insert_vals := array['$3'] || v_insert_vals || array['($2 - 1)'];

  for v_row, v_order in
    select r.value, r.ordinality::integer
      from jsonb_array_elements(v_valid_rows) with ordinality as r(value, ordinality)
  loop
    v_id := null;
    if v_row ? 'id' and jsonb_typeof(v_row -> 'id') <> 'null' then
      v_id := (v_row ->> 'id')::uuid;
    end if;

    if v_id is null then
      v_sql := format(
        'insert into public.%I (%s) values (%s) returning id',
        v_table,
        array_to_string(v_insert_cols, ', '),
        array_to_string(v_insert_vals, ', ')
      );
      execute v_sql into v_new_id using v_row, v_order, p_employee_id;
      if v_new_id is null then
        raise exception 'pds_insert_not_applied'
          using errcode = '42501',
                detail = format(
                  'Row %s did not return an inserted id; it may be suppressed by a policy or trigger.',
                  v_order
                );
      end if;
      v_desired_ids := v_desired_ids || v_new_id;
    else
      if v_has_updated_at then
        v_sql := format(
          'update public.%I set %s, sort_order = ($2 - 1), updated_at = now()
            where id = $4 and employee_id = $3',
          v_table,
          array_to_string(v_set_parts, ', ')
        );
      else
        v_sql := format(
          'update public.%I set %s, sort_order = ($2 - 1)%s
            where id = $4 and employee_id = $3',
          v_table,
          array_to_string(v_set_parts, ', '),
          case when p_section = 'workExperience'
            then ', is_present = case when nullif(btrim($1->>''to_date''), '''') is not null then false else is_present end'
            else ''
          end
        );
      end if;
      execute v_sql using v_row, v_order, p_employee_id, v_id;
      get diagnostics v_matched = row_count;
      if v_matched <> 1 then
        raise exception 'pds_update_not_applied'
          using errcode = '42501',
                detail = format(
                  'Row %s was not updated; it may be hidden by a policy.', v_order
                );
      end if;
      v_desired_ids := v_desired_ids || v_id;
    end if;
  end loop;

  select count(*)
    into v_expected_deleted
    from unnest(v_current_ids) as c(value)
   where not (c.value = any(v_desired_ids));

  execute format(
    'delete from public.%I where employee_id = $1 and id <> all($2)',
    v_table
  )
  using p_employee_id, v_desired_ids;
  get diagnostics v_deleted = row_count;

  if v_deleted <> v_expected_deleted then
    raise exception 'pds_delete_not_applied'
      using errcode = '42501',
            detail = format(
              'Expected to remove %s rows but removed %s.',
              v_expected_deleted, v_deleted
            );
  end if;

  if p_scalar_patch <> '{}'::jsonb then
    select array_agg(
             format(
               '%I = %s',
               u.name,
               case (v_scalar_types ->> u.name)
                 when 'text' then format('nullif(btrim($1->>%L), %L)', u.name, '')
                 when 'boolean' then format('nullif(btrim($1->>%L), %L)::boolean', u.name, '')
                 when 'date' then format('nullif(btrim($1->>%L), %L)::date', u.name, '')
                 else format('nullif(btrim($1->>%L), %L)', u.name, '')
               end
             )
             order by u.ord
           )
      into v_scalar_set
      from unnest(v_scalar_cols) with ordinality as u(name, ord)
     where p_scalar_patch ? u.name;

    execute format(
      'update public.employees
          set %s, pds_updated_at = now()%s
        where id = $2',
      array_to_string(v_scalar_set, ', '),
      case when v_employee ? 'modified_at' then ', modified_at = now()' else '' end
    )
    using p_scalar_patch, p_employee_id;
    get diagnostics v_matched = row_count;

    if v_matched <> 1 then
      raise exception 'pds_scalar_not_applied'
        using errcode = '42501',
              detail = 'The employee scalar patch was not applied.';
    end if;
  end if;

  execute format(
    'select
       coalesce(
         (select jsonb_agg(to_jsonb(t) order by t.sort_order, t.id)
            from public.%I t
           where t.employee_id = $1),
         ''[]''::jsonb
       ),
       to_jsonb(e)
     from public.employees e
     where e.id = $1',
    v_table
  )
  into v_rows, v_employee
  using p_employee_id;

  v_final_count := jsonb_array_length(v_rows);

  select coalesce(array_agg((r.value ->> 'id')::uuid), '{}'::uuid[])
    into v_final_ids
    from jsonb_array_elements(v_rows) as r(value);

  if v_final_count <> cardinality(v_desired_ids) then
    raise exception 'pds_membership_mismatch'
      using errcode = '42501',
            detail = format(
              'Expected %s rows after save but found %s.',
              cardinality(v_desired_ids), v_final_count
            );
  end if;

  if array_position(v_final_ids, null::uuid) is not null then
    raise exception 'pds_membership_mismatch'
      using errcode = '42501',
            detail = 'The saved section contains a row without an id.';
  end if;

  if (
    select count(distinct u.id)
      from unnest(v_final_ids) as u(id)
  ) <> cardinality(v_final_ids) then
    raise exception 'pds_membership_mismatch'
      using errcode = '42501',
            detail = 'The saved section contains duplicate row ids.';
  end if;

  if (
    select coalesce(array_agg(u.id order by u.id), '{}'::uuid[])
      from unnest(v_final_ids) as u(id)
  ) is distinct from (
    select coalesce(array_agg(u.id order by u.id), '{}'::uuid[])
      from unnest(v_desired_ids) as u(id)
  ) then
    raise exception 'pds_membership_mismatch'
      using errcode = '42501',
            detail = format(
              'Final row ids %s do not match the requested ids %s.',
              v_final_ids, v_desired_ids
            );
  end if;

  v_scalars := case p_section
    when 'children' then jsonb_build_object(
      'spouse_surname', v_employee -> 'spouse_surname',
      'spouse_first_name', v_employee -> 'spouse_first_name',
      'spouse_middle_name', v_employee -> 'spouse_middle_name',
      'spouse_suffix', v_employee -> 'spouse_suffix',
      'spouse_occupation', v_employee -> 'spouse_occupation',
      'spouse_employer', v_employee -> 'spouse_employer',
      'spouse_business_address', v_employee -> 'spouse_business_address',
      'spouse_telephone', v_employee -> 'spouse_telephone',
      'father_surname', v_employee -> 'father_surname',
      'father_first_name', v_employee -> 'father_first_name',
      'father_middle_name', v_employee -> 'father_middle_name',
      'father_suffix', v_employee -> 'father_suffix',
      'mother_surname', v_employee -> 'mother_surname',
      'mother_first_name', v_employee -> 'mother_first_name',
      'mother_middle_name', v_employee -> 'mother_middle_name'
    )
    when 'references' then jsonb_build_object(
      'related_third_degree', v_employee -> 'related_third_degree',
      'related_fourth_degree', v_employee -> 'related_fourth_degree',
      'related_details', v_employee -> 'related_details',
      'admin_offense_guilty', v_employee -> 'admin_offense_guilty',
      'admin_offense_details', v_employee -> 'admin_offense_details',
      'criminally_charged', v_employee -> 'criminally_charged',
      'criminal_charge_details', v_employee -> 'criminal_charge_details',
      'criminal_case_date_filed', v_employee -> 'criminal_case_date_filed',
      'criminal_case_status', v_employee -> 'criminal_case_status',
      'convicted_of_crime', v_employee -> 'convicted_of_crime',
      'convicted_details', v_employee -> 'convicted_details',
      'separated_from_service', v_employee -> 'separated_from_service',
      'separated_details', v_employee -> 'separated_details',
      'election_candidate', v_employee -> 'election_candidate',
      'election_candidate_details', v_employee -> 'election_candidate_details',
      'resigned_to_campaign', v_employee -> 'resigned_to_campaign',
      'resigned_to_campaign_details', v_employee -> 'resigned_to_campaign_details',
      'immigrant_status', v_employee -> 'immigrant_status',
      'immigrant_country', v_employee -> 'immigrant_country',
      'indigenous_group_member', v_employee -> 'indigenous_group_member',
      'indigenous_group_specify', v_employee -> 'indigenous_group_specify',
      'person_with_disability', v_employee -> 'person_with_disability',
      'pwd_id_number', v_employee -> 'pwd_id_number',
      'solo_parent', v_employee -> 'solo_parent',
      'solo_parent_id_number', v_employee -> 'solo_parent_id_number',
      'gov_id_type', v_employee -> 'gov_id_type',
      'gov_id_number', v_employee -> 'gov_id_number',
      'gov_id_issued_date_place', v_employee -> 'gov_id_issued_date_place'
    )
    else '{}'::jsonb
  end;

  v_revision := md5(v_rows::text || '|' || v_scalars::text);

  return jsonb_build_object(
    'rows', v_rows,
    'revision', v_revision,
    'scalars', v_scalars
  );
end;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
