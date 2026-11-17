-- Transactional Personal Data Sheet section reads and saves.
--
-- Why this exists
-- ---------------
-- The PDS editor used to save each repeating list by deleting every row for
-- the employee and re-inserting the submitted rows. A failure between those
-- two statements lost the whole list, a stale editor could silently replace a
-- newer save, and every edit changed row IDs and discarded columns the form
-- does not surface (work-experience is_present / duties_responsibilities /
-- separation_reason, creation timestamps).
--
-- read_pds_section returns the rows and a revision from one database snapshot.
-- save_pds_section locks the employee row, recomputes that revision, and
-- refuses the save when the caller's revision is stale. It then updates
-- existing IDs in place, inserts ID-less rows, and deletes only IDs that were
-- present in the loaded snapshot but omitted by the caller.
--
-- The revision hashes the full database row image of every section row,
-- including legacy columns and timestamps, plus the family/background scalar
-- columns owned by the section. A write by any direct legacy writer is
-- therefore detected between the read and the save. It does not make those
-- writers participate in the protocol: two direct table writers can still
-- race each other, and a writer that ignores revisions can still race this
-- function after the lock. Active application writers were inventoried when
-- this migration was added; the old PDS delete/insert path in
-- src/lib/api/personalDataSheet.ts is gone after this change.
--
-- Security
-- --------
-- Both functions are SECURITY INVOKER and schema-qualified. They compose only
-- operations the caller could already perform on these tables, so they do not
-- bypass RLS and do not need table-policy or grant changes. The section,
-- table, editable columns, and paired scalar columns come from static CASE
-- lists; no caller-supplied identifier is ever interpolated. Execute is
-- revoked from PUBLIC and granted only to anon and authenticated, the roles
-- the portal already uses.
--
-- The current production policies on these tables are permissive (USING
-- (true), WITH CHECK (true)); they do not enforce employee ownership. This
-- migration does not change that security model. It does verify that each
-- update and delete matched the expected row count, so a row hidden by a
-- future restrictive policy cannot be reported as successfully saved.

begin;

create or replace function public.read_pds_section(
  p_employee_id uuid,
  p_section text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_table text;
  v_rows jsonb;
  v_employee jsonb;
  v_scalars jsonb;
  v_revision text;
begin
  if p_employee_id is null then
    raise exception 'pds_employee_required'
      using errcode = '22023', detail = 'A PDS section needs an employee id.';
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

  -- Rows and the employee scalar basis are read by one statement, so the
  -- returned revision describes exactly the returned rows.
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

  if v_employee is null then
    raise exception 'pds_employee_not_found'
      using errcode = 'P0002', detail = 'No visible employee row for this section.';
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

create or replace function public.save_pds_section(
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

  -- Static section-to-column whitelists. No table, column, or scalar field
  -- name is ever accepted from the caller.
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

  -- A seeded education placeholder carries only its level; level alone is not
  -- employee input and must not turn a blank form line into a row.
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

  -- The three pre-existing admin tables (education, eligibility, work
  -- experience) have created_at but no updated_at column. Preserve metadata
  -- by only touching updated_at where it exists.
  v_has_updated_at := p_section in (
    'children', 'voluntaryWork', 'training', 'references'
  );

  -- Lock the employee row first. Every RPC save for this employee serialises
  -- here, and a direct employees update (the old family/background path)
  -- blocks on the same row until this transaction ends.
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

  -- Validate every row before the first mutation.
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

    -- A wholly blank ID-less row is a printed-form placeholder, not input.
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

  -- Build the update/insert expressions from the static column whitelist.
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

  -- Mutate. Updates keep the row id and every column outside the PDS editor.
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
          'update public.%I set %s, sort_order = ($2 - 1)
            where id = $4 and employee_id = $3',
          v_table,
          array_to_string(v_set_parts, ', ')
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

  -- Commit scalar and list changes in the same transaction.
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
      -- modified_at exists in the deployed employees table but is not created
      -- by a repo migration, so touch it only when the locked row has it.
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

  -- Canonical post-save snapshot and revision from one statement.
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

  -- Exact ID membership, not just the same count. This catches a trigger or
  -- policy that replaces or renumbers a row while leaving the row count
  -- unchanged.
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

revoke all on function public.read_pds_section(uuid, text) from public;
revoke all on function public.save_pds_section(uuid, text, jsonb, text, jsonb) from public;

grant execute on function public.read_pds_section(uuid, text) to anon, authenticated;
grant execute on function public.save_pds_section(uuid, text, jsonb, text, jsonb) to anon, authenticated;

commit;
