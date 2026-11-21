-- ============================================================================
-- Shared fixture for the external appointment tests.
-- Included by external_hire.test.sql and external_hire_concurrency.sh.
-- Synthetic data only; the caller decides whether it is rolled back or cleaned.
-- ============================================================================

CREATE FUNCTION pg_temp.ext_fixture(p_tag text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  dept_a       text := 'Ext Office A ' || p_tag;
  dept_b       text := 'Ext Office B ' || p_tag;
  email_main   text := 'ana.reyes.' || p_tag || '@example.test';
  email_rival  text := 'carlo.santos.' || p_tag || '@example.test';
  posting      uuid;
  slot7        uuid;
  slot8        uuid;
  app          uuid;
  rival        uuid;
  other_app    uuid;
  actor        uuid := gen_random_uuid();
  reserve_err  text;
BEGIN
  INSERT INTO departments (code, name, is_active)
  VALUES ('EA' || left(md5(p_tag), 12), dept_a, true),
         ('EB' || left(md5(p_tag), 12), dept_b, true);

  INSERT INTO job_postings (title, department, office, division, status)
  VALUES ('Administrative Officer I', dept_a, dept_a, 'Posting Division', 'Open')
  RETURNING id INTO posting;

  INSERT INTO plantilla_slots (job_posting_id, slot_number, label, division)
  VALUES (posting, 7, 'Plantilla 7', 'Records Division')
  RETURNING id INTO slot7;
  INSERT INTO plantilla_slots (job_posting_id, slot_number, label)
  VALUES (posting, 8, 'Plantilla 8')
  RETURNING id INTO slot8;

  INSERT INTO applicants (first_name, middle_name, last_name, gender, email, address, contact_number,
                          "position", item_number, office, application_type, plantilla_slot_id, status)
  VALUES ('Ana', 'Cruz', 'Reyes', 'Female', email_main, 'Molo, Iloilo City', '09171110001',
          'Administrative Officer I', 'Plantilla 7', dept_a, 'job', slot7, 'Qualified')
  RETURNING id INTO app;

  INSERT INTO applicants (first_name, last_name, gender, email, address, contact_number,
                          "position", item_number, office, application_type, plantilla_slot_id, status)
  VALUES ('Carlo', 'Santos', 'Male', email_rival, 'Jaro, Iloilo City', '09171110002',
          'Administrative Officer I', 'Plantilla 7', dept_a, 'job', slot7, 'Qualified')
  RETURNING id INTO rival;

  INSERT INTO applicants (first_name, middle_name, last_name, gender, email, address, contact_number,
                          "position", item_number, office, application_type, plantilla_slot_id, status)
  VALUES ('Ana', 'Cruz', 'Reyes', 'Female', email_main, 'Molo, Iloilo City', '09171110001',
          'Administrative Officer I', 'Plantilla 8', dept_a, 'job', slot8, 'Submitted')
  RETURNING id INTO other_app;

  INSERT INTO user_roles (user_id, email, role, name, is_active)
  VALUES (actor, 'rsp.' || p_tag || '@example.test', 'RSP', 'Liza Santos', true);

  reserve_err := reserve_plantilla_slot(slot7, app, current_date + 7, 'Report to HR');
  IF reserve_err IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FAILED: fixture reservation was refused: %', reserve_err;
  END IF;

  RETURN jsonb_build_object(
    'posting', posting,
    'slot', slot7,
    'slot8', slot8,
    'app', app,
    'rival', rival,
    'other_app', other_app,
    'actor', actor,
    'dept_a', dept_a,
    'dept_b', dept_b,
    'email_main', email_main,
    'email_rival', email_rival
  );
END $$;
