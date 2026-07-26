-- ============================================================================
-- 20260726: tag Competency Map rows by origin (manual vs auto-synced)
--
-- The Summary of Ratings gap analysis is being reconciled against the PM
-- Competency Map (position_competency_requirements), which becomes the single
-- source of truth for a position's competencies and required levels. Some
-- competencies referenced in the ratings data have no Map row yet and get
-- backfilled by scripts/backfill-competency-map.mjs. This column lets PM Admins
-- tell those auto-synced rows apart from ones they curated by hand — a PM Save
-- (src/lib/api/pmCompetency.ts saveRequirement) flips a row back to 'manual'.
--
-- Idempotent; matches the anon-open pattern from migration 024.
-- Created: 2026-07-26
-- ============================================================================

ALTER TABLE position_competency_requirements
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'auto-synced'));

CREATE INDEX IF NOT EXISTS idx_pcr_source ON position_competency_requirements (source);

NOTIFY pgrst, 'reload schema';
