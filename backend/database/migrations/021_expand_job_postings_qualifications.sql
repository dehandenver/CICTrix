-- ============================================================================
-- 021: Expand job_postings with the real posting + qualification fields
-- ============================================================================
-- Problem this fixes
-- ------------------
-- `job_postings` only stored (title, department, office, description,
-- item_number, status). Every other field the UI shows was FABRICATED at map
-- time in src/lib/recruitmentData.ts — most notably:
--
--     qualifications: { education: "Bachelor's Degree", ... }   <-- hardcoded
--
-- so every posting in the Job Portal advertised the same fake requirement, and
-- the RSP "Create Job" dialog silently threw away the qualifications /
-- responsibilities / deadline the user typed. This migration gives those
-- fields a real home so the portal can show what a posting ACTUALLY requires
-- (and show nothing when a field is genuinely unset).
--
-- Also adds salary_grade, which is what ranks positions within a department —
-- required for the "what am I lacking vs the highest position in this
-- department?" gap analysis.
--
-- Additive and idempotent: no existing column is dropped or retyped.
-- ============================================================================

-- ── Job information ─────────────────────────────────────────────────────────
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS summary               TEXT;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS division              VARCHAR(120);
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS position_type         VARCHAR(60);
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS position_level        VARCHAR(60);
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS employment_status     VARCHAR(60);
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS number_of_positions   INTEGER DEFAULT 1;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS salary_grade          INTEGER;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS monthly_salary        NUMERIC(12,2);

-- ── CSC Qualification Standards (Education · Experience · Training · Eligibility)
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS education_requirement TEXT;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS education_field       TEXT;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS experience_years      NUMERIC(4,1) DEFAULT 0;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS experience_field      TEXT;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS training_requirement  TEXT;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS eligibility           TEXT;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS competency            TEXT;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS preferred_qualifications TEXT;

-- ── List-valued fields (jsonb arrays of text) ───────────────────────────────
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS responsibilities      JSONB DEFAULT '[]'::jsonb;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS required_skills       JSONB DEFAULT '[]'::jsonb;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS certifications        JSONB DEFAULT '[]'::jsonb;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS required_documents    JSONB DEFAULT '[]'::jsonb;

-- ── Dates ───────────────────────────────────────────────────────────────────
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS application_deadline  DATE;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS expected_start_date   DATE;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS posted_by             VARCHAR(120);

-- Ranking positions within a department (gap analysis reads this).
CREATE INDEX IF NOT EXISTS idx_job_postings_dept_grade
  ON job_postings (department, salary_grade DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON job_postings TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
