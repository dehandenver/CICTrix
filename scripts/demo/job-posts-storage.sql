-- ─────────────────────────────────────────────────────────────────────────────
-- JOB POST STORAGE — for the HR Demo database (hydqhmtppkghqaatdgwx)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Gives a database everything RSP > Job Posts needs to store a job post and
-- everything the public landing page needs to read it back:
--
--   1. job_postings      every column the app writes (mapJobPostingToSupabaseRow
--                        in src/lib/recruitmentData.ts), matching production
--   2. plantilla_slots   one row per plantilla, with its own label, salary grade
--                        and monthly salary; no visible item number
--   3. access            the public site (anon) reads; signed-in admins
--                        (authenticated, via Supabase Auth) read and write
--   4. save_job_posting_with_slots()
--                        writes a posting and all its plantillas in ONE
--                        transaction, so a failure leaves nothing half-created
--
-- HOW TO RUN: Supabase dashboard of the DEMO project -> SQL Editor -> paste this
-- whole file -> Run. It is one transaction: if any statement fails, nothing is
-- applied. Safe to re-run; every step checks before it creates.
--
-- Do NOT run this on production (fyzdfgxaaowjzbjpwrii). Production already
-- stores job posts, and step 3 would add access policies alongside the ones
-- it has.
--
-- Applicants, attachments and application links are NOT covered here; they
-- come with the full demo rebuild.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

SET LOCAL search_path = public, pg_temp;

-- ── 1. job_postings ─────────────────────────────────────────────────────────
-- The demo already has a job_postings table with an unknown column set, so the
-- table is created only if missing and every column is then added if missing.
CREATE TABLE IF NOT EXISTS public.job_postings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_postings
  ADD COLUMN IF NOT EXISTS item_number              text,
  ADD COLUMN IF NOT EXISTS office                   text,
  ADD COLUMN IF NOT EXISTS department               text,
  ADD COLUMN IF NOT EXISTS division                 text,
  ADD COLUMN IF NOT EXISTS status                   text NOT NULL DEFAULT 'Open',
  ADD COLUMN IF NOT EXISTS summary                  text,
  ADD COLUMN IF NOT EXISTS description              text,
  ADD COLUMN IF NOT EXISTS requirements             text,
  ADD COLUMN IF NOT EXISTS position_type            text,
  ADD COLUMN IF NOT EXISTS position_level           text,
  ADD COLUMN IF NOT EXISTS employment_type          text,
  ADD COLUMN IF NOT EXISTS employment_status        text,
  ADD COLUMN IF NOT EXISTS number_of_positions      integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS salary_grade             integer,
  ADD COLUMN IF NOT EXISTS monthly_salary           numeric(12,2),
  ADD COLUMN IF NOT EXISTS education_requirement    text,
  ADD COLUMN IF NOT EXISTS education_field          text,
  -- Years and months are combined into a decimal (1 year 6 months = 1.5).
  ADD COLUMN IF NOT EXISTS experience_years         numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS experience_field         text,
  ADD COLUMN IF NOT EXISTS training_requirement     text,
  ADD COLUMN IF NOT EXISTS eligibility              text,
  ADD COLUMN IF NOT EXISTS competency               text,
  ADD COLUMN IF NOT EXISTS preferred_qualifications text,
  ADD COLUMN IF NOT EXISTS responsibilities         text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS required_skills          text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS certifications           text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS required_documents       text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS application_deadline     date,
  ADD COLUMN IF NOT EXISTS expected_start_date      date,
  ADD COLUMN IF NOT EXISTS posted_by                text,
  ADD COLUMN IF NOT EXISTS updated_at               timestamptz DEFAULT now();

-- The app only ever writes these three statuses (see mapJobPostingToSupabaseRow).
-- NOT VALID: checked on every new write, but rows already in the table are not
-- re-checked, so a leftover row with an old status cannot abort this script.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_postings_status_check') THEN
    ALTER TABLE public.job_postings
      ADD CONSTRAINT job_postings_status_check CHECK (status IN ('Open', 'Closed', 'On Hold')) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_job_postings_status     ON public.job_postings (status);
CREATE INDEX IF NOT EXISTS idx_job_postings_created_at ON public.job_postings (created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_job_postings_touch_updated_at ON public.job_postings;
CREATE TRIGGER trg_job_postings_touch_updated_at
  BEFORE UPDATE ON public.job_postings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── 2. plantilla_slots ──────────────────────────────────────────────────────
-- Same shape as production (migrations 20260922 + 20260928), minus the parts
-- that need the applicants table.
CREATE TABLE IF NOT EXISTS public.plantilla_slots (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_posting_id         uuid NOT NULL REFERENCES public.job_postings (id) ON DELETE CASCADE,
  -- Display order, 1, 2, 3 ... within the posting.
  slot_number            integer NOT NULL,
  -- Internal key only; never shown. Filled automatically.
  item_number            text NOT NULL
                           DEFAULT ('PLT-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10))),
  salary_grade           integer,
  monthly_salary         numeric(12,2),
  status                 text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'closed')),
  filled_by_applicant_id uuid,
  filled_at              timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Admin-typed name, e.g. "Plantilla 2".
ALTER TABLE public.plantilla_slots ADD COLUMN IF NOT EXISTS label text;
UPDATE public.plantilla_slots
   SET label = 'Plantilla ' || slot_number
 WHERE label IS NULL OR btrim(label) = '';
ALTER TABLE public.plantilla_slots ALTER COLUMN label SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_plantilla_slots_label_not_blank') THEN
    ALTER TABLE public.plantilla_slots
      ADD CONSTRAINT chk_plantilla_slots_label_not_blank CHECK (btrim(label) <> '');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_plantilla_slots_posting_ordinal
  ON public.plantilla_slots (job_posting_id, slot_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_plantilla_slots_posting_label
  ON public.plantilla_slots (job_posting_id, lower(btrim(label)));
CREATE UNIQUE INDEX IF NOT EXISTS uq_plantilla_slots_item_number
  ON public.plantilla_slots (lower(btrim(item_number)));
CREATE INDEX IF NOT EXISTS idx_plantilla_slots_posting ON public.plantilla_slots (job_posting_id);

DROP TRIGGER IF EXISTS trg_plantilla_slots_touch_updated_at ON public.plantilla_slots;
CREATE TRIGGER trg_plantilla_slots_touch_updated_at
  BEFORE UPDATE ON public.plantilla_slots
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- job_postings.item_number mirrors Plantilla 1's internal key, as on production.
CREATE OR REPLACE FUNCTION public.sync_job_posting_primary_item_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_posting uuid := COALESCE(NEW.job_posting_id, OLD.job_posting_id);
  primary_item   text;
BEGIN
  SELECT ps.item_number INTO primary_item
    FROM public.plantilla_slots ps
   WHERE ps.job_posting_id = target_posting
   ORDER BY ps.slot_number
   LIMIT 1;
  IF primary_item IS NOT NULL THEN
    UPDATE public.job_postings SET item_number = primary_item WHERE id = target_posting;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sync_job_posting_item_number ON public.plantilla_slots;
CREATE TRIGGER trg_sync_job_posting_item_number
  AFTER INSERT OR UPDATE OF item_number, slot_number OR DELETE ON public.plantilla_slots
  FOR EACH ROW EXECUTE FUNCTION public.sync_job_posting_primary_item_number();

-- ── 3. Access ───────────────────────────────────────────────────────────────
-- anon          = the public landing page and job portal: read only.
-- authenticated = RSP admins, signed in through Supabase Auth: read and write.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.job_postings, public.plantilla_slots TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.job_postings, public.plantilla_slots TO authenticated;

ALTER TABLE public.job_postings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plantilla_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_postings_read  ON public.job_postings;
DROP POLICY IF EXISTS job_postings_write ON public.job_postings;
CREATE POLICY job_postings_read  ON public.job_postings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY job_postings_write ON public.job_postings FOR ALL    TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS plantilla_slots_read  ON public.plantilla_slots;
DROP POLICY IF EXISTS plantilla_slots_write ON public.plantilla_slots;
CREATE POLICY plantilla_slots_read  ON public.plantilla_slots FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY plantilla_slots_write ON public.plantilla_slots FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- ── 4. Save a posting and its plantillas in one transaction ─────────────────
-- p_posting: one job_postings row as JSON, with the same keys the app writes
--            (title, department, status, salary_grade, ...). id is optional.
-- p_slots:   JSON array, one object per plantilla, in display order:
--            [{ "label": "Plantilla 1", "salary_grade": 6, "monthly_salary": 16113,
--               "status": "open" }, ...]
-- Returns the posting id. Runs as the caller (SECURITY INVOKER), so the access
-- rules above apply: only a signed-in admin can call it successfully.
CREATE OR REPLACE FUNCTION public.save_job_posting_with_slots(p_posting jsonb, p_slots jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_row public.job_postings;
  v_id  uuid;
BEGIN
  IF p_slots IS NULL OR jsonb_typeof(p_slots) <> 'array' OR jsonb_array_length(p_slots) < 1 THEN
    RAISE EXCEPTION 'A job post needs at least one plantilla.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(btrim(p_posting ->> 'title'), '') = '' THEN
    RAISE EXCEPTION 'Position Title is required.' USING ERRCODE = '22023';
  END IF;

  -- Unknown keys are ignored; missing keys fall back to the column defaults.
  v_row := jsonb_populate_record(NULL::public.job_postings, p_posting);
  v_id  := COALESCE(v_row.id, gen_random_uuid());

  INSERT INTO public.job_postings (
    id, title, office, department, division, status, summary, description,
    position_type, position_level, employment_status, number_of_positions,
    salary_grade, monthly_salary, education_requirement, education_field,
    experience_years, experience_field, training_requirement, eligibility,
    competency, preferred_qualifications, responsibilities, required_skills,
    certifications, required_documents, application_deadline,
    expected_start_date, posted_by
  ) VALUES (
    v_id, btrim(v_row.title), COALESCE(v_row.office, v_row.department), v_row.department,
    v_row.division, COALESCE(v_row.status, 'Open'), v_row.summary, v_row.description,
    v_row.position_type, v_row.position_level, v_row.employment_status,
    COALESCE(v_row.number_of_positions, jsonb_array_length(p_slots)),
    v_row.salary_grade, v_row.monthly_salary, v_row.education_requirement,
    v_row.education_field, COALESCE(v_row.experience_years, 0), v_row.experience_field,
    v_row.training_requirement, v_row.eligibility, v_row.competency,
    v_row.preferred_qualifications,
    COALESCE(v_row.responsibilities, '{}'), COALESCE(v_row.required_skills, '{}'),
    COALESCE(v_row.certifications, '{}'), COALESCE(v_row.required_documents, '{}'),
    v_row.application_deadline, v_row.expected_start_date, v_row.posted_by
  );

  INSERT INTO public.plantilla_slots (job_posting_id, slot_number, label, salary_grade, monthly_salary, status)
  SELECT v_id,
         s.ord,
         COALESCE(NULLIF(btrim(s.slot ->> 'label'), ''), 'Plantilla ' || s.ord),
         NULLIF(s.slot ->> 'salary_grade', '')::integer,
         NULLIF(s.slot ->> 'monthly_salary', '')::numeric,
         COALESCE(NULLIF(s.slot ->> 'status', ''), 'open')
    FROM jsonb_array_elements(p_slots) WITH ORDINALITY AS s(slot, ord);

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.save_job_posting_with_slots(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_job_posting_with_slots(jsonb, jsonb) TO authenticated;

-- Make the API see the new columns and function immediately.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── Example (run separately, as a signed-in admin or in the SQL Editor) ─────
-- SELECT public.save_job_posting_with_slots(
--   '{"title": "Engineer V", "department": "City Engineer''s Office", "status": "Open",
--     "salary_grade": 24, "monthly_salary": 90078, "application_deadline": "2026-10-31",
--     "education_requirement": "Bachelor''s degree in Civil Engineering",
--     "eligibility": "RA 1080", "posted_by": "RSP Admin"}'::jsonb,
--   '[{"label": "Plantilla 1", "salary_grade": 24, "monthly_salary": 90078},
--     {"label": "Plantilla 2", "salary_grade": 24, "monthly_salary": 90078}]'::jsonb
-- );
