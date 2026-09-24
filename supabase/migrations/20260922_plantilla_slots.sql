-- ============================================================================
-- Migration: Multiple plantilla items per job post
-- Date: 2026-09-22
--
-- Until now one Job Post == one plantilla item number == one vacant slot, held
-- in job_postings.item_number. Filling four identical "Admin Aide" vacancies
-- therefore meant creating four separate postings, which fragmented applicants,
-- scoring and reporting across rows that were the same job.
--
-- This migration moves the vacancy into its own row:
--
--   plantilla_slots              one row per real plantilla item number
--   application_plantilla_slots  many-to-many: one application -> N slots
--
-- WHY job_postings.item_number IS NOT DROPPED
-- -------------------------------------------
-- The feature spec suggests dropping it. We deliberately keep it, because the
-- applicant -> posting linkage across this app is still string matching on that
-- column (JobPostingsPage.findJobIdFromRow, RSPDashboard's per-item applicant
-- counts, LandingPage / JobPortalPage routing by item number, the FastAPI
-- applicants routes, and the seed scripts). Dropping it would break all of them
-- at once for no gain. Instead it becomes a DENORMALISED MIRROR of slot 1, kept
-- in step by the trigger below, and plantilla_slots is the authority.
--
-- Additive and idempotent.
-- ============================================================================

BEGIN;

-- Unqualified names resolve through search_path, which is not guaranteed to be
-- `public` in every SQL editor / connection. Pinning it here, and qualifying
-- the pre-existing tables below, means this migration cannot fail to find a
-- table that is sitting right there in public.
SET LOCAL search_path = public, pg_temp;

-- ── 1. The slots ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plantilla_slots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_posting_id      uuid NOT NULL,
  -- Display ordinal ("Plantilla 1", "Plantilla 2"). System-assigned and
  -- re-sequenced on delete; never typed by the admin.
  slot_number         integer NOT NULL,
  -- The real plantilla item number, e.g. ABYAN-2026-451. Unique system-wide.
  item_number         text NOT NULL,
  -- Per-slot overrides. NULL means "inherit the posting's shared value".
  salary_grade        integer,
  monthly_salary      numeric(12,2),
  status              text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'filled', 'closed')),
  filled_by_applicant_id uuid,
  filled_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Ordinals are unique within a posting; item numbers are unique everywhere.
-- Both are case/whitespace-insensitive so "abyan-2026-451 " cannot slip past
-- the uniqueness check the admin modal promises.
CREATE UNIQUE INDEX IF NOT EXISTS uq_plantilla_slots_posting_ordinal
  ON public.plantilla_slots (job_posting_id, slot_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_plantilla_slots_item_number
  ON public.plantilla_slots (lower(btrim(item_number)));
CREATE INDEX IF NOT EXISTS idx_plantilla_slots_posting
  ON public.plantilla_slots (job_posting_id);
CREATE INDEX IF NOT EXISTS idx_plantilla_slots_status
  ON public.plantilla_slots (status);

-- ── 2. Application -> slot(s) ───────────────────────────────────────────────
-- One application row (applicants) linked to one or more slots. The applicant
-- ticks the plantillas they want inside a SINGLE submission; they never file
-- one application per slot.
CREATE TABLE IF NOT EXISTS application_plantilla_slots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id      uuid NOT NULL,
  plantilla_slot_id uuid NOT NULL,
  -- Per-slot outcome: an applicant can be shortlisted for Plantilla 1 and
  -- turned down for Plantilla 3 under the same application.
  status            text NOT NULL DEFAULT 'applied'
                      CHECK (status IN ('applied', 'shortlisted', 'not_selected', 'hired')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_application_plantilla_pair
  ON public.application_plantilla_slots (applicant_id, plantilla_slot_id);
CREATE INDEX IF NOT EXISTS idx_application_plantilla_applicant
  ON public.application_plantilla_slots (applicant_id);
CREATE INDEX IF NOT EXISTS idx_application_plantilla_slot
  ON public.application_plantilla_slots (plantilla_slot_id);

-- Reports and exports must name the plantilla item a person was actually
-- placed into. The position title alone is ambiguous once one posting covers
-- four identical vacancies.
--
-- Guarded, following the precedent migration 005 set for this same table
-- ("newly_hired may not exist on every install"). Note that ADD COLUMN IF NOT
-- EXISTS guards the COLUMN, not the TABLE — without this block a missing
-- newly_hired aborts the entire migration. src/lib/recruitmentData.ts already
-- retries its upsert without these two columns, so skipping them degrades to
-- "hires don't record their item number" rather than breaking anything.
DO $$
BEGIN
  IF to_regclass('public.newly_hired') IS NULL THEN
    RAISE NOTICE 'newly_hired not found in schema public — skipping its plantilla columns.';
  ELSE
    ALTER TABLE public.newly_hired ADD COLUMN IF NOT EXISTS plantilla_item_number text;
    ALTER TABLE public.newly_hired ADD COLUMN IF NOT EXISTS plantilla_slot_number integer;
  END IF;
END $$;

-- An applicant whose chosen slot was deleted by the admin keeps their
-- application and stays attached to the job post, but is flagged so RSP can
-- move them onto a remaining slot.
--
-- Deliberately NOT guarded: the triggers and backfill below genuinely require
-- this column, so a missing applicants table must fail loudly rather than
-- leave a half-applied schema behind.
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS needs_slot_reassignment boolean NOT NULL DEFAULT false;

-- ── 3. Foreign keys ─────────────────────────────────────────────────────────
-- job_postings / applicants predate the migrations folder, so their id types
-- are not guaranteed here. Adding the constraints in a guarded block means a
-- type mismatch degrades to "no FK" instead of aborting the whole migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_plantilla_slots_posting') THEN
    ALTER TABLE plantilla_slots
      ADD CONSTRAINT fk_plantilla_slots_posting
      FOREIGN KEY (job_posting_id) REFERENCES public.job_postings (id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'plantilla_slots -> job_postings FK skipped: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_plantilla_slots_filled_by') THEN
    ALTER TABLE plantilla_slots
      ADD CONSTRAINT fk_plantilla_slots_filled_by
      FOREIGN KEY (filled_by_applicant_id) REFERENCES public.applicants (id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'plantilla_slots -> applicants FK skipped: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_app_plantilla_applicant') THEN
    ALTER TABLE application_plantilla_slots
      ADD CONSTRAINT fk_app_plantilla_applicant
      FOREIGN KEY (applicant_id) REFERENCES public.applicants (id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'application_plantilla_slots -> applicants FK skipped: %', SQLERRM;
END $$;

-- Deleting a slot removes the link rows but never the application itself —
-- see the flagging trigger in section 5.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_app_plantilla_slot') THEN
    ALTER TABLE application_plantilla_slots
      ADD CONSTRAINT fk_app_plantilla_slot
      FOREIGN KEY (plantilla_slot_id) REFERENCES plantilla_slots (id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'application_plantilla_slots -> plantilla_slots FK skipped: %', SQLERRM;
END $$;

-- ── 4. Backfill: every existing posting becomes a one-slot posting ──────────
-- Postings with a blank item_number get a generated placeholder rather than
-- being skipped, so the "at least one slot" invariant holds for every row and
-- the admin modal never opens on an empty list.
INSERT INTO plantilla_slots (job_posting_id, slot_number, item_number, salary_grade, monthly_salary, status)
SELECT
  jp.id,
  1,
  COALESCE(NULLIF(btrim(jp.item_number), ''), 'UNASSIGNED-' || left(jp.id::text, 8)),
  jp.salary_grade,
  jp.monthly_salary,
  CASE WHEN lower(COALESCE(jp.status, '')) = 'closed' THEN 'closed' ELSE 'open' END
FROM public.job_postings jp
WHERE NOT EXISTS (
  SELECT 1 FROM plantilla_slots ps WHERE ps.job_posting_id = jp.id
)
ON CONFLICT DO NOTHING;

-- Existing applications are linked to the slot whose item number they carry.
-- applicants.item_number doubles as the applicant's own tracking code, so only
-- the rows that genuinely match a plantilla number are linked — the rest are
-- walk-in/direct applications that were never tied to a slot to begin with.
INSERT INTO application_plantilla_slots (applicant_id, plantilla_slot_id, status)
SELECT a.id, ps.id, 'applied'
FROM public.applicants a
JOIN plantilla_slots ps
  ON lower(btrim(ps.item_number)) = lower(btrim(a.item_number))
WHERE COALESCE(btrim(a.item_number), '') <> ''
ON CONFLICT DO NOTHING;

-- ── 5. Triggers ─────────────────────────────────────────────────────────────

-- 5a. Keep job_postings.item_number pointing at slot 1 (see header).
CREATE OR REPLACE FUNCTION sync_job_posting_primary_item_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_posting uuid;
  primary_item   text;
BEGIN
  target_posting := COALESCE(NEW.job_posting_id, OLD.job_posting_id);

  SELECT ps.item_number INTO primary_item
  FROM plantilla_slots ps
  WHERE ps.job_posting_id = target_posting
  ORDER BY ps.slot_number
  LIMIT 1;

  IF primary_item IS NOT NULL THEN
    UPDATE public.job_postings SET item_number = primary_item WHERE id = target_posting;
  END IF;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sync_job_posting_item_number ON plantilla_slots;
CREATE TRIGGER trg_sync_job_posting_item_number
  AFTER INSERT OR UPDATE OF item_number, slot_number OR DELETE ON plantilla_slots
  FOR EACH ROW EXECUTE FUNCTION sync_job_posting_primary_item_number();

-- 5b. Deleting a slot must not silently drop its applicants. Flag anyone who
-- is left with no remaining slot on that posting so RSP has to act on them.
CREATE OR REPLACE FUNCTION flag_applicants_orphaned_by_slot_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.applicants a
     SET needs_slot_reassignment = true
   WHERE a.id IN (
     SELECT aps.applicant_id
     FROM application_plantilla_slots aps
     WHERE aps.plantilla_slot_id = OLD.id
   )
   AND NOT EXISTS (
     SELECT 1
     FROM application_plantilla_slots other
     JOIN plantilla_slots ps ON ps.id = other.plantilla_slot_id
     WHERE other.applicant_id = a.id
       AND other.plantilla_slot_id <> OLD.id
       AND ps.job_posting_id = OLD.job_posting_id
   );
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_flag_orphaned_applicants ON plantilla_slots;
CREATE TRIGGER trg_flag_orphaned_applicants
  BEFORE DELETE ON plantilla_slots
  FOR EACH ROW EXECUTE FUNCTION flag_applicants_orphaned_by_slot_delete();

-- 5c. A slot can only be filled by one person. Marking it filled stamps the
-- time and settles the per-application outcomes for that slot: the hire is
-- 'hired', everyone else who applied to it is 'not_selected'. Other slots on
-- the same posting are untouched and stay open.
CREATE OR REPLACE FUNCTION settle_plantilla_slot_outcomes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'filled' AND NEW.filled_by_applicant_id IS NOT NULL THEN
    NEW.filled_at := COALESCE(NEW.filled_at, now());
  ELSIF NEW.status <> 'filled' THEN
    NEW.filled_at := NULL;
    NEW.filled_by_applicant_id := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_settle_slot_outcomes ON plantilla_slots;
CREATE TRIGGER trg_settle_slot_outcomes
  BEFORE INSERT OR UPDATE ON plantilla_slots
  FOR EACH ROW EXECUTE FUNCTION settle_plantilla_slot_outcomes();

CREATE OR REPLACE FUNCTION apply_slot_outcomes_after_fill()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'filled' AND NEW.filled_by_applicant_id IS NOT NULL THEN
    UPDATE application_plantilla_slots
       SET status = CASE WHEN applicant_id = NEW.filled_by_applicant_id THEN 'hired' ELSE 'not_selected' END,
           updated_at = now()
     WHERE plantilla_slot_id = NEW.id;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_apply_slot_outcomes ON plantilla_slots;
CREATE TRIGGER trg_apply_slot_outcomes
  AFTER UPDATE OF status, filled_by_applicant_id ON plantilla_slots
  FOR EACH ROW EXECUTE FUNCTION apply_slot_outcomes_after_fill();

-- ── 6. Aggregate view for the Job Posts list ────────────────────────────────
-- "2/4 Open", "Fully Filled", unique applicant totals — computed once here so
-- the list view is a single read rather than N per-row queries.
CREATE OR REPLACE VIEW job_postings_with_slot_summary AS
SELECT
  jp.id                                   AS job_posting_id,
  COUNT(ps.id)                            AS slot_count,
  COUNT(ps.id) FILTER (WHERE ps.status = 'open')   AS open_count,
  COUNT(ps.id) FILTER (WHERE ps.status = 'filled') AS filled_count,
  COUNT(ps.id) FILTER (WHERE ps.status = 'closed') AS closed_count,
  COALESCE(
    (SELECT COUNT(DISTINCT aps.applicant_id)
       FROM application_plantilla_slots aps
       JOIN plantilla_slots s ON s.id = aps.plantilla_slot_id
      WHERE s.job_posting_id = jp.id),
    0
  )                                       AS applicant_count
FROM public.job_postings jp
LEFT JOIN plantilla_slots ps ON ps.job_posting_id = jp.id
GROUP BY jp.id;

-- ── 7. Anon-open, consistent with the rest of the recruitment tables ────────
ALTER TABLE plantilla_slots DISABLE ROW LEVEL SECURITY;
ALTER TABLE application_plantilla_slots DISABLE ROW LEVEL SECURITY;
GRANT ALL ON plantilla_slots TO anon, authenticated, service_role;
GRANT ALL ON application_plantilla_slots TO anon, authenticated, service_role;
GRANT SELECT ON job_postings_with_slot_summary TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
