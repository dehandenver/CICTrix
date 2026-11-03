-- ============================================================================
-- Shared fixture for the promotional appointment tests.
-- Included by promotional_appointment.test.sql and
-- promotional_appointment_concurrency.sh. Synthetic data only; the caller
-- decides whether it is rolled back or cleaned up.
-- ============================================================================

-- ── Fixture: one reserved promotion ready to complete ───────────────────────
-- An Active employee with one portal account applies for Plantilla 7 of a
-- posting in another office. A competitor applied for the same plantilla and
-- the employee has a second open application on Plantilla 8.
CREATE FUNCTION pg_temp.fixture(p_tag text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  old_office text := 'Old Office ' || p_tag;
  new_office text := 'New Office ' || p_tag;
  emp_number text := 'TEST-' || p_tag;
  email      text := 'maricel.delacruz.' || p_tag || '@example.test';
  posting    uuid;
  slot7      uuid;
  slot8      uuid;
  employee   uuid;
  app        uuid;
  rival      uuid;
  other_app  uuid;
  actor      uuid := gen_random_uuid();
  reserve_error text;
BEGIN
  INSERT INTO departments (code, name, is_active)
  VALUES ('TO' || left(md5(p_tag), 12), old_office, true),
         ('TN' || left(md5(p_tag), 12), new_office, true);

  INSERT INTO job_postings (title, department, office, division, status)
  VALUES ('Senior Records Analyst', new_office, new_office, 'Posting Division', 'Open')
  RETURNING id INTO posting;

  INSERT INTO plantilla_slots (job_posting_id, slot_number, label, division)
  VALUES (posting, 7, 'Plantilla 7', 'Records Division')
  RETURNING id INTO slot7;
  INSERT INTO plantilla_slots (job_posting_id, slot_number, label)
  VALUES (posting, 8, 'Plantilla 8')
  RETURNING id INTO slot8;

  INSERT INTO employees (employee_number, first_name, last_name, email, department, "position",
                         division, plantilla_num, date_hired, employment_status, status, user_account_id)
  VALUES (emp_number, 'Maricel', 'Dela Cruz', email, old_office, 'Records Analyst I',
          'Old Division', '3', DATE '2019-06-03', 'Regular', 'Active', gen_random_uuid())
  RETURNING id INTO employee;

  INSERT INTO employee_portal_accounts (id, username, password, employee_id, full_name, email)
  VALUES ('acct-' || p_tag, 'mdelacruz_' || p_tag, 'pw-' || p_tag, emp_number, 'Maricel Dela Cruz', email);

  INSERT INTO applicants (first_name, last_name, email, address, contact_number, "position", item_number,
                          office, application_type, employee_id, plantilla_slot_id, status)
  VALUES ('Maricel', 'Dela Cruz', email, 'Jaro, Iloilo City', '09170000001', 'Senior Records Analyst',
          'Plantilla 7', new_office, 'promotion', emp_number, slot7, 'Qualified')
  RETURNING id INTO app;

  INSERT INTO applicants (first_name, last_name, email, address, contact_number, "position", item_number,
                          office, application_type, plantilla_slot_id, status)
  VALUES ('Jomar', 'Villanueva', 'jomar.villanueva.' || p_tag || '@example.test', 'Molo, Iloilo City',
          '09170000002', 'Senior Records Analyst', 'Plantilla 7', new_office, 'job', slot7, 'Qualified')
  RETURNING id INTO rival;

  INSERT INTO applicants (first_name, last_name, email, address, contact_number, "position", item_number,
                          office, application_type, employee_id, plantilla_slot_id, status)
  VALUES ('Maricel', 'Dela Cruz', email, 'Jaro, Iloilo City', '09170000001', 'Senior Records Analyst',
          'Plantilla 8', new_office, 'promotion', emp_number, slot8, 'Submitted')
  RETURNING id INTO other_app;

  INSERT INTO applicant_category_scores (applicant_id, appointment_type, education, experience, performance,
                                         potential, pcpt, written_exam, written_exam_raw_score, is_finalized)
  VALUES (app, 'promotional',
          '{"initialScore": 4, "finalScore": 4, "remarks": ""}', '{"initialScore": 3, "finalScore": 3, "remarks": ""}',
          '{"initialScore": 4, "finalScore": 4, "remarks": ""}', '{"initialScore": 3, "finalScore": 3, "remarks": ""}',
          '{"initialScore": 0, "finalScore": 0, "remarks": ""}', '{"initialScore": 80, "finalScore": 80, "remarks": ""}',
          80, true);

  INSERT INTO user_roles (user_id, email, role, name, is_active)
  VALUES (actor, 'rsp.' || p_tag || '@example.test', 'RSP', 'Liza Santos', true);

  reserve_error := reserve_plantilla_slot(slot7, app, current_date + 7, 'Report to HR');
  IF reserve_error IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FAILED: fixture reservation was refused: %', reserve_error;
  END IF;

  RETURN jsonb_build_object(
    'posting', posting, 'slot', slot7, 'slot8', slot8, 'employee', employee, 'emp_number', emp_number,
    'app', app, 'rival', rival, 'other_app', other_app, 'actor', actor,
    'new_office', new_office, 'account', 'acct-' || p_tag);
END $$;
