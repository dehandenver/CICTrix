-- ============================================================================
-- Tests for public.read_pds_section / public.save_pds_section.
--
-- Run against a LOCAL or preview database only, as a role that can create
-- temporary test policies and roles:
--   psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f pds_section_transactions.test.sql
--
-- Everything runs inside one transaction that ends in ROLLBACK, so it leaves
-- no data, role, policy, or trigger behind. All fixtures are synthetic labels,
-- never personal records. Success prints "ALL PDS SECTION TESTS PASSED"; any
-- failure aborts with "TEST FAILED: ...".
--
-- Two-session concurrency is covered separately by pds_section_concurrency.sh.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

-- ── Fixtures ────────────────────────────────────────────────────────────────

CREATE FUNCTION pg_temp.make_employee(p_tag text) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
  v_cols text[] := array['email'];
  v_vals text[] := array[format('%L', 'pds-fixture-' || p_tag)];
  v_has_employee_number boolean;
  v_has_employee_id boolean;
  v_has_first_name boolean;
  v_has_last_name boolean;
  v_has_full_name boolean;
  v_full_name_not_null boolean;
  v_has_department boolean;
  v_has_position boolean;
  v_sql text;
BEGIN
  SELECT
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'employees'
               AND column_name = 'employee_number'),
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'employees'
               AND column_name = 'employee_id'),
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'employees'
               AND column_name = 'first_name'),
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'employees'
               AND column_name = 'last_name'),
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'employees'
               AND column_name = 'full_name'),
    COALESCE((SELECT is_nullable = 'NO' FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'employees'
                 AND column_name = 'full_name'), false),
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'employees'
               AND column_name = 'department'),
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'employees'
               AND column_name = 'position')
  INTO v_has_employee_number, v_has_employee_id, v_has_first_name,
       v_has_last_name, v_has_full_name, v_full_name_not_null,
       v_has_department, v_has_position;

  IF v_has_employee_number THEN
    v_cols := array_append(v_cols, 'employee_number');
    v_vals := array_append(v_vals, format('%L', 'PDS-' || p_tag));
  END IF;
  IF v_has_employee_id THEN
    v_cols := array_append(v_cols, 'employee_id');
    v_vals := array_append(v_vals, format('%L', 'PDS-ID-' || p_tag));
  END IF;

  IF v_has_first_name THEN
    v_cols := array_append(v_cols, 'first_name');
    v_vals := array_append(v_vals, quote_literal('PDS First ' || p_tag));
  END IF;
  IF v_has_last_name THEN
    v_cols := array_append(v_cols, 'last_name');
    v_vals := array_append(v_vals, quote_literal('PDS Last ' || p_tag));
  END IF;
  IF v_has_full_name AND v_full_name_not_null THEN
    v_cols := array_append(v_cols, 'full_name');
    v_vals := array_append(v_vals, quote_literal('PDS Fixture ' || p_tag));
  END IF;
  -- Live-shaped employees require these without defaults; older local dumps
  -- may not have them at all. Synthetic labels only.
  IF v_has_department THEN
    v_cols := array_append(v_cols, 'department');
    v_vals := array_append(v_vals, quote_literal('PDS Department ' || p_tag));
  END IF;
  IF v_has_position THEN
    v_cols := array_append(v_cols, '"position"');
    v_vals := array_append(v_vals, quote_literal('PDS Position ' || p_tag));
  END IF;

  IF NOT (v_has_first_name OR v_has_full_name) THEN
    RAISE EXCEPTION 'TEST FIXTURE FAILED: employees has no name column';
  END IF;

  v_sql := format(
    'insert into public.employees (%s) values (%s) returning id',
    array_to_string(v_cols, ', '),
    array_to_string(v_vals, ', ')
  );
  EXECUTE v_sql INTO v_id;
  RETURN v_id;
END $$;

CREATE FUNCTION pg_temp.seed_section(p_employee uuid, p_section text) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_section = 'children' THEN
    INSERT INTO public.employee_children
      (employee_id, full_name, date_of_birth, sort_order)
    VALUES (p_employee, 'Original Child', '2010-01-01', 0)
    RETURNING id INTO v_id;
  ELSIF p_section = 'education' THEN
    INSERT INTO public.employee_education
      (employee_id, level, school_name, course, year_attended_from,
       year_attended_to, units_earned, year_graduated, honors_awards, sort_order)
    VALUES (p_employee, 'College', 'Original School', 'BS Original', 2000,
            2004, 0, 2004, 'Original Honors', 0)
    RETURNING id INTO v_id;
  ELSIF p_section = 'eligibility' THEN
    INSERT INTO public.employee_eligibility
      (employee_id, eligibility_type, rating, date_of_exam,
       place_of_examination, license_number, validity_date, sort_order)
    VALUES (p_employee, 'Original Eligibility', 80.5, '2020-01-01',
            'Original Place', 'LIC-ORIGINAL', '2030-01-01', 0)
    RETURNING id INTO v_id;
  ELSIF p_section = 'workExperience' THEN
    INSERT INTO public.employee_work_experience
      (employee_id, from_date, to_date, position_title, company_name,
       status_of_appointment, is_government_service, is_present,
       duties_responsibilities, separation_reason, sort_order)
    VALUES (p_employee, '2015-01-01', '2020-12-31', 'Original Position',
            'Original Company', 'Regular', true, false, 'Original Duties',
            'Original Reason', 0)
    RETURNING id INTO v_id;
  ELSIF p_section = 'voluntaryWork' THEN
    INSERT INTO public.employee_voluntary_work
      (employee_id, org_name_address, date_from, date_to, number_of_hours,
       position_nature_of_work, sort_order)
    VALUES (p_employee, 'Original Organization', '2018-01-01', '2018-12-31',
            10, 'Original Nature', 0)
    RETURNING id INTO v_id;
  ELSIF p_section = 'training' THEN
    INSERT INTO public.employee_ld_interventions
      (employee_id, title, date_from, date_to, number_of_hours, ld_type,
       conducted_by, sort_order)
    VALUES (p_employee, 'Original Training', '2019-01-01', '2019-01-02', 8,
            'Technical', 'Original Provider', 0)
    RETURNING id INTO v_id;
  ELSIF p_section = 'references' THEN
    INSERT INTO public.employee_references
      (employee_id, name, address, contact_info, sort_order)
    VALUES (p_employee, 'Original Reference', 'Original Address',
            'Original Contact', 0)
    RETURNING id INTO v_id;
  ELSE
    RAISE EXCEPTION 'unknown section %', p_section;
  END IF;

  RETURN v_id;
END $$;

CREATE FUNCTION pg_temp.pds_rows(p_employee uuid, p_section text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_table text := CASE p_section
    WHEN 'children' THEN 'employee_children'
    WHEN 'education' THEN 'employee_education'
    WHEN 'eligibility' THEN 'employee_eligibility'
    WHEN 'workExperience' THEN 'employee_work_experience'
    WHEN 'voluntaryWork' THEN 'employee_voluntary_work'
    WHEN 'training' THEN 'employee_ld_interventions'
    WHEN 'references' THEN 'employee_references'
  END;
  v_rows jsonb;
BEGIN
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'unknown section %', p_section;
  END IF;
  EXECUTE format(
    'select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order, t.id), ''[]''::jsonb)
       from public.%I t where t.employee_id = $1',
    v_table
  ) INTO v_rows USING p_employee;
  RETURN v_rows;
END $$;

CREATE FUNCTION pg_temp.pds_employee(p_employee uuid) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT to_jsonb(e) FROM public.employees e WHERE e.id = p_employee
$$;

CREATE FUNCTION pg_temp.pds_input_row(p_section text, p_row jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_section
    WHEN 'children' THEN jsonb_build_object(
      'id', p_row -> 'id', 'full_name', p_row -> 'full_name',
      'date_of_birth', p_row -> 'date_of_birth'
    )
    WHEN 'education' THEN jsonb_build_object(
      'id', p_row -> 'id', 'level', p_row -> 'level',
      'school_name', p_row -> 'school_name', 'course', p_row -> 'course',
      'year_attended_from', p_row -> 'year_attended_from',
      'year_attended_to', p_row -> 'year_attended_to',
      'units_earned', p_row -> 'units_earned',
      'year_graduated', p_row -> 'year_graduated',
      'honors_awards', p_row -> 'honors_awards'
    )
    WHEN 'eligibility' THEN jsonb_build_object(
      'id', p_row -> 'id', 'eligibility_type', p_row -> 'eligibility_type',
      'rating', p_row -> 'rating', 'date_of_exam', p_row -> 'date_of_exam',
      'place_of_examination', p_row -> 'place_of_examination',
      'license_number', p_row -> 'license_number',
      'validity_date', p_row -> 'validity_date'
    )
    WHEN 'workExperience' THEN jsonb_build_object(
      'id', p_row -> 'id', 'from_date', p_row -> 'from_date',
      'to_date', p_row -> 'to_date', 'position_title', p_row -> 'position_title',
      'company_name', p_row -> 'company_name',
      'status_of_appointment', p_row -> 'status_of_appointment',
      'is_government_service', p_row -> 'is_government_service'
    )
    WHEN 'voluntaryWork' THEN jsonb_build_object(
      'id', p_row -> 'id', 'org_name_address', p_row -> 'org_name_address',
      'date_from', p_row -> 'date_from', 'date_to', p_row -> 'date_to',
      'number_of_hours', p_row -> 'number_of_hours',
      'position_nature_of_work', p_row -> 'position_nature_of_work'
    )
    WHEN 'training' THEN jsonb_build_object(
      'id', p_row -> 'id', 'title', p_row -> 'title',
      'date_from', p_row -> 'date_from', 'date_to', p_row -> 'date_to',
      'number_of_hours', p_row -> 'number_of_hours',
      'ld_type', p_row -> 'ld_type', 'conducted_by', p_row -> 'conducted_by'
    )
    WHEN 'references' THEN jsonb_build_object(
      'id', p_row -> 'id', 'name', p_row -> 'name',
      'address', p_row -> 'address', 'contact_info', p_row -> 'contact_info'
    )
  END
$$;

CREATE FUNCTION pg_temp.pds_text_column(p_section text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_section
    WHEN 'children' THEN 'full_name'
    WHEN 'education' THEN 'school_name'
    WHEN 'eligibility' THEN 'eligibility_type'
    WHEN 'workExperience' THEN 'position_title'
    WHEN 'voluntaryWork' THEN 'org_name_address'
    WHEN 'training' THEN 'title'
    WHEN 'references' THEN 'name'
  END
$$;

CREATE FUNCTION pg_temp.pds_sentinel_row(p_section text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_section
    WHEN 'children' THEN jsonb_build_object(
      'full_name', 'PDS_FORCE_FAIL', 'date_of_birth', null)
    WHEN 'education' THEN jsonb_build_object(
      'level', 'College', 'school_name', 'PDS_FORCE_FAIL')
    WHEN 'eligibility' THEN jsonb_build_object(
      'eligibility_type', 'PDS_FORCE_FAIL')
    WHEN 'workExperience' THEN jsonb_build_object(
      'from_date', '2024-01-01', 'position_title', 'PDS_FORCE_FAIL',
      'company_name', 'Sentinel Company')
    WHEN 'voluntaryWork' THEN jsonb_build_object(
      'org_name_address', 'PDS_FORCE_FAIL')
    WHEN 'training' THEN jsonb_build_object(
      'title', 'PDS_FORCE_FAIL')
    WHEN 'references' THEN jsonb_build_object(
      'name', 'PDS_FORCE_FAIL')
  END
$$;

CREATE FUNCTION pg_temp.expect_save_error(
  p_employee uuid,
  p_section text,
  p_rows jsonb,
  p_revision text,
  p_patch jsonb,
  p_label text,
  p_states text[]
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_state text;
  v_rows_before jsonb := pg_temp.pds_rows(p_employee, p_section);
  v_employee_before jsonb := pg_temp.pds_employee(p_employee);
BEGIN
  BEGIN
    PERFORM public.save_pds_section(
      p_employee, p_section, p_rows, p_revision, p_patch
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;

  IF v_state IS NULL THEN
    RAISE EXCEPTION 'TEST FAILED: %: save succeeded', p_label;
  END IF;
  IF NOT (v_state = ANY (p_states)) THEN
    RAISE EXCEPTION 'TEST FAILED: %: got state %, expected one of %',
      p_label, v_state, p_states;
  END IF;
  IF pg_temp.pds_rows(p_employee, p_section) <> v_rows_before THEN
    RAISE EXCEPTION 'TEST FAILED: %: section rows changed after rejection', p_label;
  END IF;
  IF pg_temp.pds_employee(p_employee) <> v_employee_before THEN
    RAISE EXCEPTION 'TEST FAILED: %: employee row changed after rejection', p_label;
  END IF;
END $$;

CREATE FUNCTION pg_temp.call_read_as(
  p_role text,
  p_employee uuid,
  p_section text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config('role', p_role, true);
  BEGIN
    EXECUTE 'select public.read_pds_section($1, $2)'
      INTO v_result USING p_employee, p_section;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE;
  END;
  PERFORM set_config('role', 'postgres', true);
  RETURN v_result;
END $$;

CREATE FUNCTION pg_temp.call_save_as(
  p_role text,
  p_employee uuid,
  p_section text,
  p_rows jsonb,
  p_revision text,
  p_patch jsonb
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config('role', p_role, true);
  BEGIN
    EXECUTE 'select public.save_pds_section($1, $2, $3, $4, $5)'
      INTO v_result
      USING p_employee, p_section, p_rows, p_revision, p_patch;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE;
  END;
  PERFORM set_config('role', 'postgres', true);
  RETURN v_result;
END $$;

-- Sentinel triggers force the last mutation to fail after earlier rows in the
-- same transaction have already been written.
CREATE FUNCTION pg_temp.pds_force_fail_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF to_jsonb(NEW)::text LIKE '%PDS_FORCE_FAIL%' THEN
    RAISE EXCEPTION 'forced failure for rollback test';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER pds_force_fail_children
  BEFORE INSERT OR UPDATE ON public.employee_children
  FOR EACH ROW EXECUTE FUNCTION pg_temp.pds_force_fail_trigger();
CREATE TRIGGER pds_force_fail_education
  BEFORE INSERT OR UPDATE ON public.employee_education
  FOR EACH ROW EXECUTE FUNCTION pg_temp.pds_force_fail_trigger();
CREATE TRIGGER pds_force_fail_eligibility
  BEFORE INSERT OR UPDATE ON public.employee_eligibility
  FOR EACH ROW EXECUTE FUNCTION pg_temp.pds_force_fail_trigger();
CREATE TRIGGER pds_force_fail_work
  BEFORE INSERT OR UPDATE ON public.employee_work_experience
  FOR EACH ROW EXECUTE FUNCTION pg_temp.pds_force_fail_trigger();
CREATE TRIGGER pds_force_fail_voluntary
  BEFORE INSERT OR UPDATE ON public.employee_voluntary_work
  FOR EACH ROW EXECUTE FUNCTION pg_temp.pds_force_fail_trigger();
CREATE TRIGGER pds_force_fail_training
  BEFORE INSERT OR UPDATE ON public.employee_ld_interventions
  FOR EACH ROW EXECUTE FUNCTION pg_temp.pds_force_fail_trigger();
CREATE TRIGGER pds_force_fail_references
  BEFORE INSERT OR UPDATE ON public.employee_references
  FOR EACH ROW EXECUTE FUNCTION pg_temp.pds_force_fail_trigger();

CREATE FUNCTION pg_temp.pds_scalar_fail_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF to_jsonb(NEW)::text LIKE '%PDS_SCALAR_FAIL%' THEN
    RAISE EXCEPTION 'forced scalar failure for rollback test';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER pds_force_scalar_fail
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION pg_temp.pds_scalar_fail_trigger();

-- A BEFORE trigger that suppresses the row update without raising. This
-- creates a true zero-match scalar UPDATE for the matched-count regression.
CREATE FUNCTION pg_temp.pds_scalar_zero_match_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.spouse_surname = 'PDS_ZERO_MATCH_SCALAR' THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER pds_scalar_zero_match
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION pg_temp.pds_scalar_zero_match_trigger();

-- Count-preserving membership swap: after the scalar update, the employee
-- trigger renumbers the saved child. The list/delete steps have already run,
-- the final row count is still one, and only exact ID membership can catch it.
CREATE FUNCTION pg_temp.pds_membership_swap_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.spouse_surname = 'PDS_SWAP_MEMBERSHIP' THEN
    UPDATE public.employee_children
       SET id = gen_random_uuid()
     WHERE employee_id = NEW.id
       AND full_name = 'Original Child';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER pds_swap_membership
  AFTER UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION pg_temp.pds_membership_swap_trigger();

-- ── Tests ───────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_sections text[] := array[
    'children', 'education', 'eligibility', 'workExperience',
    'voluntaryWork', 'training', 'references'
  ];
  v_section text;
  v_edit_col text;
  v_employee uuid;
  v_employee_b uuid;
  v_read jsonb;
  v_rows jsonb;
  v_before_row jsonb;
  v_after_row jsonb;
  v_res jsonb;
  v_res2 jsonb;
  v_state text;
  v_inputs jsonb;
  v_role text;
  v_roles text[] := array['anon', 'authenticated'];
  v_rows_before jsonb;
  v_employee_before jsonb;
BEGIN
  -- 1. Force the last mutation to fail in each section; IDs, rows, and
  --    metadata from before the transaction must be restored.
  FOREACH v_section IN ARRAY v_sections LOOP
    v_employee := pg_temp.make_employee('rollback-' || v_section);
    PERFORM pg_temp.seed_section(v_employee, v_section);
    v_read := public.read_pds_section(v_employee, v_section);
    v_edit_col := pg_temp.pds_text_column(v_section);

    SELECT coalesce(
             jsonb_agg(pg_temp.pds_input_row(v_section, r.value) ORDER BY r.ord),
             '[]'::jsonb
           )
      INTO v_rows
      FROM jsonb_array_elements(v_read -> 'rows') WITH ORDINALITY AS r(value, ord);

    v_rows := jsonb_set(
      v_rows,
      array['0', v_edit_col],
      to_jsonb('Edited before forced failure'::text),
      false
    );
    v_rows := v_rows || jsonb_build_array(pg_temp.pds_sentinel_row(v_section));

    PERFORM pg_temp.expect_save_error(
      v_employee, v_section, v_rows, v_read ->> 'revision', '{}'::jsonb,
      'rollback after last mutation fails: ' || v_section,
      array['P0001']
    );
  END LOOP;

  -- 2. A row ID owned by a different employee is rejected before mutation.
  v_employee := pg_temp.make_employee('foreign-a');
  PERFORM pg_temp.seed_section(v_employee, 'children');
  v_employee_b := pg_temp.make_employee('foreign-b');
  PERFORM pg_temp.seed_section(v_employee_b, 'children');
  v_read := public.read_pds_section(v_employee, 'children');
  v_inputs := pg_temp.pds_input_row(
    'children',
    (public.read_pds_section(v_employee_b, 'children') -> 'rows' -> 0)
  );
  SELECT coalesce(
           jsonb_agg(pg_temp.pds_input_row('children', r.value) ORDER BY r.ord),
           '[]'::jsonb
         )
    INTO v_rows
    FROM jsonb_array_elements(v_read -> 'rows') WITH ORDINALITY AS r(value, ord);
  v_rows := v_rows || jsonb_build_array(v_inputs);

  PERFORM pg_temp.expect_save_error(
    v_employee, 'children', v_rows, v_read ->> 'revision', '{}'::jsonb,
    'foreign employee row id', array['42501']
  );

  -- 3. Duplicate IDs in one save are rejected.
  v_employee := pg_temp.make_employee('duplicate');
  PERFORM pg_temp.seed_section(v_employee, 'children');
  v_read := public.read_pds_section(v_employee, 'children');
  v_rows := jsonb_build_array(
    pg_temp.pds_input_row('children', v_read -> 'rows' -> 0),
    pg_temp.pds_input_row('children', v_read -> 'rows' -> 0)
  );

  PERFORM pg_temp.expect_save_error(
    v_employee, 'children', v_rows, v_read ->> 'revision', '{}'::jsonb,
    'duplicate row id', array['22023']
  );

  -- 4. Malformed rows and invalid columns are rejected before mutation.
  v_employee := pg_temp.make_employee('malformed');
  PERFORM pg_temp.seed_section(v_employee, 'children');
  PERFORM pg_temp.seed_section(v_employee, 'workExperience');
  v_read := public.read_pds_section(v_employee, 'children');

  PERFORM pg_temp.expect_save_error(
    v_employee, 'children', '{}'::jsonb, v_read ->> 'revision', '{}'::jsonb,
    'rows must be an array', array['22023']
  );
  PERFORM pg_temp.expect_save_error(
    v_employee, 'children', '[42]'::jsonb, v_read ->> 'revision', '{}'::jsonb,
    'row must be an object', array['22023']
  );
  PERFORM pg_temp.expect_save_error(
    v_employee, 'children',
    jsonb_build_array(jsonb_build_object('full_name', 'Test', 'bogus', 'x')),
    v_read ->> 'revision', '{}'::jsonb,
    'unknown row column', array['22023']
  );
  PERFORM pg_temp.expect_save_error(
    v_employee, 'children',
    jsonb_build_array(jsonb_build_object('full_name', 42)),
    v_read ->> 'revision', '{}'::jsonb,
    'wrong row value type', array['22023']
  );
  PERFORM pg_temp.expect_save_error(
    v_employee, 'children',
    jsonb_build_array(jsonb_build_object(
      'full_name', 'Test', 'date_of_birth', '2024-02-30')),
    v_read ->> 'revision', '{}'::jsonb,
    'invalid calendar date', array['22023']
  );
  PERFORM pg_temp.expect_save_error(
    v_employee, 'children',
    jsonb_build_array(jsonb_build_object('date_of_birth', '2020-01-01')),
    v_read ->> 'revision', '{}'::jsonb,
    'missing required field', array['22023']
  );

  v_read := public.read_pds_section(v_employee, 'workExperience');
  v_rows := jsonb_build_array(
    jsonb_set(
      pg_temp.pds_input_row('workExperience', v_read -> 'rows' -> 0),
      '{to_date}', '"2000-01-01"'::jsonb, false
    )
  );
  PERFORM pg_temp.expect_save_error(
    v_employee, 'workExperience', v_rows, v_read ->> 'revision', '{}'::jsonb,
    'reversed date range', array['22023']
  );

  -- 5. Invalid section and scalar fields are rejected.
  v_read := public.read_pds_section(v_employee, 'workExperience');
  BEGIN
    PERFORM public.save_pds_section(
      v_employee, 'notASection', '[]'::jsonb, v_read ->> 'revision', '{}'::jsonb
    );
    RAISE EXCEPTION 'TEST FAILED: invalid section was accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    IF v_state <> '22023' THEN
      RAISE EXCEPTION 'TEST FAILED: invalid section state %', v_state;
    END IF;
  END;

  PERFORM pg_temp.expect_save_error(
    v_employee, 'workExperience', '[]'::jsonb, v_read ->> 'revision',
    jsonb_build_object('spouse_surname', 'Not Allowed'),
    'scalar patch on a list-only section', array['22023']
  );

  v_employee := pg_temp.make_employee('scalar-invalid');
  PERFORM pg_temp.seed_section(v_employee, 'children');
  v_read := public.read_pds_section(v_employee, 'children');
  PERFORM pg_temp.expect_save_error(
    v_employee, 'children', '[]'::jsonb, v_read ->> 'revision',
    jsonb_build_object('bogus_scalar', 'x'),
    'unknown scalar column', array['22023']
  );

  -- 6. A successful update keeps row IDs, creation metadata, legacy columns,
  --    duties, presentation flags, and separation reasons.
  FOREACH v_section IN ARRAY v_sections LOOP
    v_employee := pg_temp.make_employee('preserve-' || v_section);
    PERFORM pg_temp.seed_section(v_employee, v_section);
    v_read := public.read_pds_section(v_employee, v_section);
    v_edit_col := pg_temp.pds_text_column(v_section);

    SELECT coalesce(
             jsonb_agg(pg_temp.pds_input_row(v_section, r.value) ORDER BY r.ord),
             '[]'::jsonb
           )
      INTO v_rows
      FROM jsonb_array_elements(v_read -> 'rows') WITH ORDINALITY AS r(value, ord);

    v_rows := jsonb_set(
      v_rows,
      array['0', v_edit_col],
      to_jsonb('Edited ' || v_section),
      false
    );

    v_res := public.save_pds_section(
      v_employee, v_section, v_rows, v_read ->> 'revision', '{}'::jsonb
    );

    IF jsonb_array_length(v_res -> 'rows') <> 1 THEN
      RAISE EXCEPTION 'TEST FAILED: preserve %: row count changed', v_section;
    END IF;
    IF v_res -> 'rows' -> 0 ->> 'id' <> v_read -> 'rows' -> 0 ->> 'id' THEN
      RAISE EXCEPTION 'TEST FAILED: preserve %: row id changed', v_section;
    END IF;
    IF v_res ->> 'revision' = v_read ->> 'revision' THEN
      RAISE EXCEPTION 'TEST FAILED: preserve %: revision did not change', v_section;
    END IF;

    v_before_row := (v_read -> 'rows' -> 0) - v_edit_col - 'updated_at';
    v_after_row := (v_res -> 'rows' -> 0) - v_edit_col - 'updated_at';
    IF v_before_row <> v_after_row THEN
      RAISE EXCEPTION 'TEST FAILED: preserve %: unedited metadata changed', v_section;
    END IF;
  END LOOP;

  -- 7. Explicit empty list deletes loaded rows; a new row gets a database id
  --    and creation timestamp from the canonical save response.
  v_employee := pg_temp.make_employee('empty');
  PERFORM pg_temp.seed_section(v_employee, 'children');
  v_read := public.read_pds_section(v_employee, 'children');
  v_res := public.save_pds_section(
    v_employee, 'children', '[]'::jsonb, v_read ->> 'revision', '{}'::jsonb
  );
  IF jsonb_array_length(v_res -> 'rows') <> 0 THEN
    RAISE EXCEPTION 'TEST FAILED: explicit empty list did not delete rows';
  END IF;

  v_res2 := public.save_pds_section(
    v_employee, 'children',
    jsonb_build_array(jsonb_build_object('full_name', 'New Child')),
    v_res ->> 'revision', '{}'::jsonb
  );
  IF jsonb_array_length(v_res2 -> 'rows') <> 1 THEN
    RAISE EXCEPTION 'TEST FAILED: new child was not inserted';
  END IF;
  IF v_res2 -> 'rows' -> 0 ->> 'id' IS NULL
     OR v_res2 -> 'rows' -> 0 ->> 'created_at' IS NULL THEN
    RAISE EXCEPTION 'TEST FAILED: inserted row has no canonical id/created_at';
  END IF;

  -- 8. A count-preserving trigger that renumbers the saved row after the
  --    list and delete steps must be rejected by exact ID membership.
  v_employee := pg_temp.make_employee('membership-swap');
  PERFORM pg_temp.seed_section(v_employee, 'children');
  v_read := public.read_pds_section(v_employee, 'children');
  v_rows := jsonb_build_array(
    pg_temp.pds_input_row('children', v_read -> 'rows' -> 0)
  );
  PERFORM pg_temp.expect_save_error(
    v_employee, 'children', v_rows, v_read ->> 'revision',
    jsonb_build_object('spouse_surname', 'PDS_SWAP_MEMBERSHIP'),
    'count-preserving membership swap', array['42501']
  );

  -- 9. A stale sequential save gets an independent fixture: initial read, a
  --    successful intervening save, then an old-revision rejection that must
  --    leave the successful snapshot untouched. The true two-session race is
  --    in the shell test.
  v_employee := pg_temp.make_employee('stale-sequential');
  PERFORM pg_temp.seed_section(v_employee, 'children');
  v_read := public.read_pds_section(v_employee, 'children');

  v_rows := jsonb_build_array(
    jsonb_set(
      pg_temp.pds_input_row('children', v_read -> 'rows' -> 0),
      '{full_name}', '"Winning Child"'::jsonb, false
    )
  );
  v_res := public.save_pds_section(
    v_employee, 'children', v_rows, v_read ->> 'revision', '{}'::jsonb
  );
  IF v_res -> 'rows' -> 0 ->> 'full_name' <> 'Winning Child' THEN
    RAISE EXCEPTION 'TEST FAILED: intervening save did not win';
  END IF;

  v_rows_before := pg_temp.pds_rows(v_employee, 'children');
  v_employee_before := pg_temp.pds_employee(v_employee);

  PERFORM pg_temp.expect_save_error(
    v_employee, 'children',
    jsonb_build_array(
      jsonb_set(
        pg_temp.pds_input_row('children', v_read -> 'rows' -> 0),
        '{full_name}', '"Stale Child"'::jsonb, false
      )
    ),
    v_read ->> 'revision', '{}'::jsonb,
    'stale sequential save', array['40001']
  );

  IF pg_temp.pds_rows(v_employee, 'children') <> v_rows_before
     OR pg_temp.pds_employee(v_employee) <> v_employee_before THEN
    RAISE EXCEPTION 'TEST FAILED: stale save changed the winning snapshot';
  END IF;
  IF (pg_temp.pds_rows(v_employee, 'children') -> 0 ->> 'full_name')
     <> 'Winning Child' THEN
    RAISE EXCEPTION 'TEST FAILED: winning child name was not preserved';
  END IF;

  -- 10. Revision covers the full database row, not only PDS-edited columns.
  v_employee := pg_temp.make_employee('legacy-write');
  PERFORM pg_temp.seed_section(v_employee, 'workExperience');
  v_read := public.read_pds_section(v_employee, 'workExperience');
  UPDATE public.employee_work_experience
     SET duties_responsibilities = 'Changed by a direct legacy writer'
   WHERE employee_id = v_employee;

  SELECT jsonb_agg(pg_temp.pds_input_row('workExperience', r.value) ORDER BY r.ord)
    INTO v_rows
    FROM jsonb_array_elements(v_read -> 'rows') WITH ORDINALITY AS r(value, ord);
  v_rows := jsonb_set(
    v_rows, array['0', 'position_title'], to_jsonb('Edited after legacy write'::text), false
  );
  PERFORM pg_temp.expect_save_error(
    v_employee, 'workExperience', v_rows, v_read ->> 'revision', '{}'::jsonb,
    'legacy direct writer changed full row', array['40001']
  );

  -- 11. Family and background scalars commit atomically with their list.
  v_employee := pg_temp.make_employee('family');
  PERFORM pg_temp.seed_section(v_employee, 'children');
  v_read := public.read_pds_section(v_employee, 'children');
  v_rows := jsonb_build_array(
    jsonb_set(
      pg_temp.pds_input_row('children', v_read -> 'rows' -> 0),
      '{full_name}', '"Edited Child"'::jsonb, false
    )
  );
  v_res := public.save_pds_section(
    v_employee, 'children', v_rows, v_read ->> 'revision',
    jsonb_build_object('spouse_surname', 'Test Spouse')
  );
  IF v_res -> 'scalars' ->> 'spouse_surname' <> 'Test Spouse' THEN
    RAISE EXCEPTION 'TEST FAILED: family scalar did not commit with children';
  END IF;
  IF v_res -> 'rows' -> 0 ->> 'full_name' <> 'Edited Child' THEN
    RAISE EXCEPTION 'TEST FAILED: child did not commit with family scalar';
  END IF;

  -- 12. A scalar failure rolls the child list back, and vice versa.
  v_employee := pg_temp.make_employee('family-rollback');
  PERFORM pg_temp.seed_section(v_employee, 'children');
  v_read := public.read_pds_section(v_employee, 'children');
  v_rows := jsonb_build_array(
    jsonb_set(
      pg_temp.pds_input_row('children', v_read -> 'rows' -> 0),
      '{full_name}', '"Should Roll Back"'::jsonb, false
    )
  );
  PERFORM pg_temp.expect_save_error(
    v_employee, 'children', v_rows, v_read ->> 'revision',
    jsonb_build_object('spouse_surname', 'PDS_SCALAR_FAIL'),
    'scalar failure rolls child list back', array['P0001']
  );

  v_employee := pg_temp.make_employee('background');
  PERFORM pg_temp.seed_section(v_employee, 'references');
  v_read := public.read_pds_section(v_employee, 'references');
  v_rows := jsonb_build_array(
    jsonb_set(
      pg_temp.pds_input_row('references', v_read -> 'rows' -> 0),
      '{name}', '"Edited Reference"'::jsonb, false
    )
  );
  v_res := public.save_pds_section(
    v_employee, 'references', v_rows, v_read ->> 'revision',
    jsonb_build_object('related_details', 'Test Details',
                       'related_fourth_degree', false)
  );
  IF v_res -> 'scalars' ->> 'related_details' <> 'Test Details'
     OR (v_res -> 'scalars' ->> 'related_fourth_degree')::boolean IS NOT false THEN
    RAISE EXCEPTION 'TEST FAILED: background scalars did not commit with references';
  END IF;

  v_employee := pg_temp.make_employee('background-rollback');
  PERFORM pg_temp.seed_section(v_employee, 'references');
  v_read := public.read_pds_section(v_employee, 'references');
  v_rows := jsonb_build_array(
    jsonb_set(
      pg_temp.pds_input_row('references', v_read -> 'rows' -> 0),
      '{name}', '"Should Roll Back"'::jsonb, false
    )
  );
  PERFORM pg_temp.expect_save_error(
    v_employee, 'references', v_rows, v_read ->> 'revision',
    jsonb_build_object('related_details', 'PDS_SCALAR_FAIL'),
    'scalar failure rolls reference list back', array['P0001']
  );

  -- 13. SECURITY INVOKER: the caller's policies apply. A restrictive SELECT
  --     policy denies rows regardless of how many permissive employee policies
  --     exist (live has both employees_open_access and an authenticated
  --     ALL policy). It is dropped below and rollback also restores the table.
  v_employee := pg_temp.make_employee('invoker');
  PERFORM pg_temp.seed_section(v_employee, 'children');
  v_read := public.read_pds_section(v_employee, 'children');

  EXECUTE 'alter table public.employees enable row level security';
  EXECUTE 'create policy pds_invoker_employee_no_visible
             on public.employees
             as restrictive for select to anon, authenticated
             using (false)';

  -- No visible employee for either actual browser role: reads and saves fail.
  v_rows := jsonb_build_array(
    jsonb_set(
      pg_temp.pds_input_row('children', v_read -> 'rows' -> 0),
      '{full_name}', '"No Visible Employee"'::jsonb, false
    )
  );
  FOREACH v_role IN ARRAY v_roles LOOP
    BEGIN
      PERFORM pg_temp.call_read_as(v_role, v_employee, 'children');
      RAISE EXCEPTION 'TEST FAILED: % read succeeded with no visible employee', v_role;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
      IF v_state <> 'P0002' THEN
        RAISE EXCEPTION 'TEST FAILED: % no-visible read state %', v_role, v_state;
      END IF;
    END;

    BEGIN
      PERFORM pg_temp.call_save_as(
        v_role, v_employee, 'children', v_rows,
        v_read ->> 'revision', '{}'::jsonb
      );
      RAISE EXCEPTION 'TEST FAILED: % save succeeded with no visible employee', v_role;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
      IF v_state <> 'P0002' THEN
        RAISE EXCEPTION 'TEST FAILED: % no-visible save state %', v_role, v_state;
      END IF;
    END;
  END LOOP;

  EXECUTE 'drop policy pds_invoker_employee_no_visible on public.employees';
  EXECUTE 'create policy pds_invoker_employee_visible
             on public.employees
             for all to anon, authenticated
             using (true) with check (true)';

  v_rows_before := pg_temp.pds_rows(v_employee, 'children');
  v_employee_before := pg_temp.pds_employee(v_employee);

  -- Denied UPDATE: the child row is visible but no UPDATE matches.
  EXECUTE 'create policy pds_invoker_children_no_update
             on public.employee_children
             as restrictive for update to anon, authenticated
             using (false)';

  v_rows := jsonb_build_array(
    jsonb_set(
      pg_temp.pds_input_row('children', v_read -> 'rows' -> 0),
      '{full_name}', '"Restricted Child"'::jsonb, false
    )
  );

  FOREACH v_role IN ARRAY v_roles LOOP
    BEGIN
      PERFORM pg_temp.call_save_as(
        v_role, v_employee, 'children', v_rows,
        v_read ->> 'revision', '{}'::jsonb
      );
      RAISE EXCEPTION 'TEST FAILED: % restricted update was reported as a complete save', v_role;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
      IF v_state = 'P0001' THEN
        RAISE EXCEPTION 'TEST FAILED: % restricted update was accepted', v_role;
      END IF;
      IF v_state NOT IN ('42501') THEN
        RAISE EXCEPTION 'TEST FAILED: % restricted update state %', v_role, v_state;
      END IF;
    END;
  END LOOP;

  IF pg_temp.pds_rows(v_employee, 'children') <> v_rows_before
     OR pg_temp.pds_employee(v_employee) <> v_employee_before THEN
    RAISE EXCEPTION 'TEST FAILED: restricted update left a partial save';
  END IF;

  EXECUTE 'drop policy pds_invoker_children_no_update on public.employee_children';

  -- Denied DELETE: omitting the loaded row must not succeed by matching zero
  -- rows and then claiming the empty desired list was saved.
  EXECUTE 'create policy pds_invoker_children_no_delete
             on public.employee_children
             as restrictive for delete to anon, authenticated
             using (false)';

  FOREACH v_role IN ARRAY v_roles LOOP
    BEGIN
      PERFORM pg_temp.call_save_as(
        v_role, v_employee, 'children', '[]'::jsonb,
        v_read ->> 'revision', '{}'::jsonb
      );
      RAISE EXCEPTION 'TEST FAILED: % restricted delete was reported as a complete save', v_role;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
      IF v_state = 'P0001' THEN
        RAISE EXCEPTION 'TEST FAILED: % restricted delete was accepted', v_role;
      END IF;
      IF v_state NOT IN ('42501') THEN
        RAISE EXCEPTION 'TEST FAILED: % restricted delete state %', v_role, v_state;
      END IF;
    END;
  END LOOP;

  IF pg_temp.pds_rows(v_employee, 'children') <> v_rows_before
     OR pg_temp.pds_employee(v_employee) <> v_employee_before THEN
    RAISE EXCEPTION 'TEST FAILED: restricted delete left a partial save';
  END IF;

  EXECUTE 'drop policy pds_invoker_children_no_delete on public.employee_children';

  -- Denied scalar UPDATE: SELECT FOR UPDATE must still see the employee (the
  -- USING expression is true), but the paired family update fails the
  -- restrictive UPDATE check. The whole save must roll back.
  EXECUTE 'create policy pds_invoker_employees_scalar_check
             on public.employees
             as restrictive for update to anon, authenticated
             using (true) with check (false)';

  v_rows := jsonb_build_array(
    pg_temp.pds_input_row('children', v_read -> 'rows' -> 0)
  );

  FOREACH v_role IN ARRAY v_roles LOOP
    BEGIN
      PERFORM pg_temp.call_save_as(
        v_role, v_employee, 'children', v_rows,
        v_read ->> 'revision',
        jsonb_build_object('spouse_surname', 'Restricted Spouse')
      );
      RAISE EXCEPTION 'TEST FAILED: % restricted scalar update was reported as a complete save', v_role;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
      IF v_state = 'P0001' THEN
        RAISE EXCEPTION 'TEST FAILED: % restricted scalar update was accepted', v_role;
      END IF;
      IF v_state NOT IN ('42501') THEN
        RAISE EXCEPTION 'TEST FAILED: % restricted scalar state %', v_role, v_state;
      END IF;
    END;
  END LOOP;

  IF pg_temp.pds_rows(v_employee, 'children') <> v_rows_before
     OR pg_temp.pds_employee(v_employee) <> v_employee_before THEN
    RAISE EXCEPTION 'TEST FAILED: restricted scalar update left a partial save';
  END IF;

  EXECUTE 'drop policy pds_invoker_employees_scalar_check on public.employees';

  -- True zero-match scalar UPDATE: the BEFORE trigger suppresses the row, so
  -- the matched count is zero and the RPC must raise and roll back.
  FOREACH v_role IN ARRAY v_roles LOOP
    BEGIN
      PERFORM pg_temp.call_save_as(
        v_role, v_employee, 'children', v_rows,
        v_read ->> 'revision',
        jsonb_build_object('spouse_surname', 'PDS_ZERO_MATCH_SCALAR')
      );
      RAISE EXCEPTION 'TEST FAILED: % zero-match scalar update was reported as a complete save', v_role;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
      IF v_state = 'P0001' THEN
        RAISE EXCEPTION 'TEST FAILED: % zero-match scalar update was accepted', v_role;
      END IF;
      IF v_state NOT IN ('42501') THEN
        RAISE EXCEPTION 'TEST FAILED: % zero-match scalar state %', v_role, v_state;
      END IF;
    END;
  END LOOP;

  IF pg_temp.pds_rows(v_employee, 'children') <> v_rows_before
     OR pg_temp.pds_employee(v_employee) <> v_employee_before THEN
    RAISE EXCEPTION 'TEST FAILED: zero-match scalar update left a partial save';
  END IF;

  EXECUTE 'drop trigger pds_scalar_zero_match on public.employees';

  EXECUTE 'alter table public.employees disable row level security';
END $$;

ROLLBACK;

\echo 'ALL PDS SECTION TESTS PASSED'
