-- ============================================================================
-- IPCR competency matches — AI-assisted mapping of IPCR targets to the LGU's
-- 12 defined competencies.
-- Created: 2026-07-21.
--
-- An HR admin analyzes an employee's IPCR targets (success indicators) against
-- the organization's competency taxonomy. A Claude model reads each target,
-- weighs the employee's job position, and returns the competency (or
-- competencies) the target demonstrates, each with a confidence score and a
-- one-sentence justification grounded in the target text.
--
-- Storage shape: ONE ROW PER (target, matched competency). A single target that
-- maps to two competencies produces two rows. A target that matched nothing is
-- stored as a single row with competency = NULL and flag_for_review = true, so
-- the review queue is a plain `WHERE flag_for_review` scan with no second table.
--
--   * competency      — one of the 12 canonical strings from
--                       src/constants/positions.ts (COMPETENCIES). The prompt is
--                       fed those exact strings so model output maps 1:1 to the
--                       app's competency records. NULL means "no match".
--   * confidence      — 0.00–1.00, how directly the target evidences the
--                       competency. Below 0.60 is a weak/indirect match.
--   * flag_for_review — true when the row needs human confirmation (no strong
--                       match, over-tagged target, or a too-vague target). This
--                       is what feeds the HR admin review queue / override-rate.
--   * prompt_version  — the version of the prompt that produced the match, so a
--                       later prompt revision never silently reinterprets old
--                       historical matches. See backend/app/prompts.
--
-- Access: same anon-open posture as the other IPCR/RSP tables (RLS disabled,
-- grants to anon+authenticated). The management UI lives inside the access-gated
-- L&D Portal; enforcement is app-layer. The Claude call itself is server-side
-- (FastAPI) so the API key never reaches the browser.
--
-- Idempotent.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ipcr_competency_matches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable: an analysis may be run ad-hoc against pasted targets before an
  -- employee record is linked. ON DELETE SET NULL so removing an employee never
  -- deletes the analysis history.
  employee_id       uuid REFERENCES employees(id) ON DELETE SET NULL,
  employee_position text NOT NULL,
  rating_period     text,
  target_text       text NOT NULL,
  -- NULL when the target matched no competency (an "unmatched" row).
  competency        text,
  -- NULL for unmatched rows; 0.00–1.00 otherwise.
  confidence        numeric(3,2),
  justification     text,
  flag_for_review   boolean NOT NULL DEFAULT false,
  prompt_version    text NOT NULL,
  model             text,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- A matched row carries a competency; an unmatched row carries neither a
  -- competency nor a confidence. Enforce that pairing so the table can't drift
  -- into "competency set but confidence null" or vice-versa.
  CONSTRAINT ipcr_competency_matches_pairing CHECK (
    (competency IS NULL     AND confidence IS NULL) OR
    (competency IS NOT NULL AND confidence IS NOT NULL)
  ),
  CONSTRAINT ipcr_competency_matches_confidence_range CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  )
);

CREATE INDEX IF NOT EXISTS ipcr_competency_matches_employee_idx
  ON ipcr_competency_matches (employee_id);

CREATE INDEX IF NOT EXISTS ipcr_competency_matches_competency_idx
  ON ipcr_competency_matches (competency);

-- The review queue: rows an HR admin still needs to confirm.
CREATE INDEX IF NOT EXISTS ipcr_competency_matches_review_idx
  ON ipcr_competency_matches (flag_for_review)
  WHERE flag_for_review;

-- ── Access — app-layer enforcement, consistent with the other IPCR tables ────
ALTER TABLE ipcr_competency_matches DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON ipcr_competency_matches TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
