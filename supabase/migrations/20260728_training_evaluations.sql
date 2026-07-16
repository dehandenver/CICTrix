-- ============================================================================
-- Training Evaluation (Page 6) — pre-test / post-test learning verification.
-- Created: 2026-07-28.
--
-- Verifies that learning happened, not just attendance. One evaluation row per
-- attendee (i.e. per training_enrollments row), tied to a training via the
-- enrollment's session. Supports two assessment modes:
--
--   * 'test'   — a pre-test baseline score and a post-test score (0–100). The
--                improvement delta is computed, never stored, so it can't drift.
--   * 'output' — the attendee submits a file/output instead of a quiz; L&D marks
--                it Pending → Reviewed → Verified. Uploads reuse the existing
--                'employee-documents' Storage bucket under a training-outputs/
--                key prefix, so no new bucket/policy is needed.
--
-- Completion status (Not started / Pre-test done / Post-test done / Complete) is
-- derived in the app from the scores / review status, not stored.
--
-- training_report_notes holds the manual recommendations field L&D fills in for
-- the after-training report export (one row per training).
--
-- Access: same anon-open posture as every other L&D/IPCR table (RLS disabled,
-- grants to anon+authenticated, app-layer gating via the already-gated portal).
-- See [[project_training_tables_rls_bug]] for why role-claim RLS is avoided.
--
-- Idempotent.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS training_evaluations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One evaluation per attendee-per-training. Cascades if the roster row is
  -- hard-deleted; soft-removed enrollments (is_active=false) simply drop out of
  -- the board query.
  enrollment_id   uuid NOT NULL UNIQUE REFERENCES training_enrollments(id) ON DELETE CASCADE,
  assessment_mode text NOT NULL DEFAULT 'test' CHECK (assessment_mode IN ('test','output')),

  -- 0–100 percentage scores; NULL until entered.
  pre_test_score  numeric(5,2) CHECK (pre_test_score  IS NULL OR (pre_test_score  >= 0 AND pre_test_score  <= 100)),
  post_test_score numeric(5,2) CHECK (post_test_score IS NULL OR (post_test_score >= 0 AND post_test_score <= 100)),

  -- Output-submission mode.
  submission_url   text,
  submission_name  text,
  submission_notes text,
  review_status    text NOT NULL DEFAULT 'Pending' CHECK (review_status IN ('Pending','Reviewed','Verified')),

  lnd_notes  text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The after-training report's manually-authored recommendations, one per training.
CREATE TABLE IF NOT EXISTS training_report_notes (
  session_id      uuid PRIMARY KEY REFERENCES training_sessions(id) ON DELETE CASCADE,
  recommendations text,
  prepared_by     text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Access — app-layer enforcement, consistent with the other L&D tables ─────
ALTER TABLE training_evaluations  DISABLE ROW LEVEL SECURITY;
ALTER TABLE training_report_notes DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON training_evaluations  TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON training_report_notes TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
