-- ============================================================================
-- Migration: split the applicant's tracking code out of item_number
-- Date: 2026-09-23
--
-- `applicants.item_number` has been carrying two unrelated identities:
--
--   1. the official plantilla code of the position applied for
--      (ABYAN-2026-985) — written when the applicant starts from a job post
--   2. a random per-application tracking code (APP-2026-XXXXXXX) — written
--      when they don't
--
-- Which one a given row holds depends on how the applicant entered the wizard.
-- That is why two applicants for the same posting could share an "item number",
-- and why the tracker's lookup was ambiguous.
--
-- This migration gives the tracking code its own column:
--
--   applicants.item_number   -> ONLY the plantilla code applied for
--                               (keeps the applicant -> posting matching that
--                                JobPostingsPage / RSPDashboard rely on)
--   applicants.reference_no  -> ONLY the application tracking code,
--                               format ABYAN-000-000, generated server-side
--
-- Reference numbers are assigned by a BEFORE INSERT trigger, so they cannot be
-- set or edited by any client, and never change once issued.
--
-- Additive and idempotent.
-- ============================================================================

BEGIN;

-- Unqualified names resolve through search_path, which is not guaranteed to be
-- `public` in every SQL editor / connection. Pinned here for the same reason as
-- in 20260922: so this migration cannot fail to find a table that is sitting
-- right there in public.
SET LOCAL search_path = public, pg_temp;

-- ── 1. The column ───────────────────────────────────────────────────────────
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS reference_no text;

-- Applicants read their reference off a printout or an email and type it back
-- in with whatever spacing and case they please. The normalised form is what
-- lookups and the uniqueness guarantee actually run on.
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS reference_no_normalized text
  GENERATED ALWAYS AS (upper(regexp_replace(COALESCE(reference_no, ''), '[^A-Za-z0-9]', '', 'g'))) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS uq_applicants_reference_no_normalized
  ON public.applicants (reference_no_normalized)
  WHERE reference_no IS NOT NULL AND btrim(reference_no) <> '';

-- ── 2. Generator ────────────────────────────────────────────────────────────
-- ABYAN- + 3 random digits + - + 3 random digits. Deliberately not sequential
-- and not derived from the job or the date: it identifies an application, and
-- leaking volume or ordering through it serves no one.
--
-- 1,000,000 combinations is small enough that collisions are a question of
-- when, not if, so this retries and the unique index is the real guarantee.
CREATE OR REPLACE FUNCTION generate_application_reference_no()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  candidate text;
  attempts  integer := 0;
BEGIN
  LOOP
    candidate := 'ABYAN-'
      || lpad((floor(random() * 1000))::int::text, 3, '0')
      || '-'
      || lpad((floor(random() * 1000))::int::text, 3, '0');

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.applicants
       WHERE reference_no_normalized = upper(regexp_replace(candidate, '[^A-Za-z0-9]', '', 'g'))
    );

    attempts := attempts + 1;
    -- The 6-digit space is exhausted or nearly so. Widen rather than spin
    -- forever: a longer reference is better than a failed submission.
    IF attempts > 50 THEN
      candidate := 'ABYAN-'
        || lpad((floor(random() * 1000))::int::text, 3, '0')
        || '-'
        || lpad((floor(random() * 1000))::int::text, 3, '0')
        || '-'
        || lpad((floor(random() * 1000))::int::text, 3, '0');
      EXIT;
    END IF;
  END LOOP;

  RETURN candidate;
END $$;

-- Assigned server-side on insert. A client-supplied value is ignored outright
-- rather than trusted — the spec is that this is never settable from outside.
CREATE OR REPLACE FUNCTION assign_application_reference_no()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.reference_no := generate_application_reference_no();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assign_application_reference_no ON applicants;
CREATE TRIGGER trg_assign_application_reference_no
  BEFORE INSERT ON applicants
  FOR EACH ROW EXECUTE FUNCTION assign_application_reference_no();

-- And it never changes once issued, whatever an UPDATE tries to do.
CREATE OR REPLACE FUNCTION freeze_application_reference_no()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.reference_no IS NOT NULL AND NEW.reference_no IS DISTINCT FROM OLD.reference_no THEN
    NEW.reference_no := OLD.reference_no;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_freeze_application_reference_no ON applicants;
CREATE TRIGGER trg_freeze_application_reference_no
  BEFORE UPDATE ON applicants
  FOR EACH ROW EXECUTE FUNCTION freeze_application_reference_no();

-- ── 3. Backfill ─────────────────────────────────────────────────────────────
-- Every existing row gets a reference number. Which one depends on what its
-- item_number turned out to be:
--
--   (a) it matches a real plantilla slot  -> item_number is a PLANTILLA CODE.
--       Leave it there and issue a fresh reference. These applicants were only
--       ever shown the plantilla code, and it is shared with everyone else who
--       applied to that slot, so it cannot survive as a unique tracking code.
--
--   (b) it matches nothing               -> item_number is a legacy TRACKING
--       CODE (APP-2026-XXXXXXX). Move it across verbatim so anyone holding a
--       printout can still find their application, and blank the item_number
--       since it never identified a position.
--
-- (b) runs first: it claims the unique index with the codes applicants
-- actually hold, and (a) then generates around them.
-- Wrapped because plantilla_slots only exists once 20260922 has been applied.
-- Filename order runs that first, but these migrations still get pasted in by
-- hand, and a missing table should not abort the whole run. Without it, every
-- row simply falls through to the generator below.
DO $$
BEGIN
  IF to_regclass('public.plantilla_slots') IS NULL THEN
    RAISE NOTICE 'plantilla_slots not found — skipping the legacy tracking-code rescue. Apply 20260922 first if you want it.';
    RETURN;
  END IF;

  UPDATE public.applicants a
     SET reference_no = btrim(a.item_number),
         item_number  = 'UNASSIGNED'
   WHERE a.reference_no IS NULL
     AND COALESCE(btrim(a.item_number), '') NOT IN ('', 'UNASSIGNED')
     AND NOT EXISTS (
       SELECT 1 FROM plantilla_slots ps
        WHERE lower(btrim(ps.item_number)) = lower(btrim(a.item_number))
     )
     -- Skip anything that would collide; the loop below issues those a new one.
     AND NOT EXISTS (
       SELECT 1 FROM public.applicants other
        WHERE other.id <> a.id
          AND other.reference_no_normalized
              = upper(regexp_replace(btrim(a.item_number), '[^A-Za-z0-9]', '', 'g'))
     );
END $$;

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN SELECT id FROM public.applicants WHERE reference_no IS NULL LOOP
    UPDATE public.applicants
       SET reference_no = generate_application_reference_no()
     WHERE id = target.id;
  END LOOP;
END $$;

-- ── 4. Tracker view ─────────────────────────────────────────────────────────
-- The view lists its columns explicitly, so a new column on the base table is
-- invisible to it until it is recreated. Without this the tracker cannot look
-- anyone up by their reference number.
DROP VIEW IF EXISTS applicant_tracker_view CASCADE;

CREATE VIEW applicant_tracker_view AS
SELECT
  a.id,
  a.item_number,
  a.reference_no,
  a.reference_no_normalized,
  a.first_name,
  a.last_name,
  a.email,
  a.contact_number,
  a.position,
  a.office,
  a.status,
  a.created_at,
  a.updated_at,
  a.application_type,
  a.disqualification_reason,
  a.exam_date,
  a.exam_time,
  a.oral_exam_date,
  a.oral_exam_time,
  a.interview_date,
  a.interview_time,
  a.venue,
  a.schedule_instructions,
  a.disqualified_at,
  a.disqualification_reason_category,
  a.is_final,
  CASE
    WHEN a.disqualification_message_visible THEN a.disqualification_message
    ELSE NULL
  END AS disqualification_message,
  a.disqualification_message_visible
  -- disqualified_by is intentionally omitted — never exposed to the public tracker.
FROM public.applicants a;

GRANT SELECT ON applicant_tracker_view TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
