-- ============================================================================
-- EXTEND ipcr_workspace WITH Q/E/T SUB-RATINGS + PER-CATEGORY % WEIGHTS
-- Backs the richer Phase 2 rating capture in the Employee Portal "My IPCR
-- Workspace" tab, matching the official IPCR form's Rating columns
-- (Q = Quality, E = Efficiency, T = Timeliness, A = Average) and the
-- Average Rating summary table's "% Weight" column.
--
-- The existing *_rating columns are reused as the per-category Average (A):
--   A = mean of the filled Q/E/T for that category.
-- overall_score becomes the weight-blended final (falls back to the simple
-- mean of the category averages when no weights are provided).
-- Created: 2026-07-09
-- ============================================================================

ALTER TABLE ipcr_workspace
  ADD COLUMN IF NOT EXISTS core_quality        numeric(4,2),
  ADD COLUMN IF NOT EXISTS core_efficiency     numeric(4,2),
  ADD COLUMN IF NOT EXISTS core_timeliness     numeric(4,2),
  ADD COLUMN IF NOT EXISTS core_weight         numeric(5,2),

  ADD COLUMN IF NOT EXISTS strategic_quality   numeric(4,2),
  ADD COLUMN IF NOT EXISTS strategic_efficiency numeric(4,2),
  ADD COLUMN IF NOT EXISTS strategic_timeliness numeric(4,2),
  ADD COLUMN IF NOT EXISTS strategic_weight    numeric(5,2),

  ADD COLUMN IF NOT EXISTS support_quality     numeric(4,2),
  ADD COLUMN IF NOT EXISTS support_efficiency  numeric(4,2),
  ADD COLUMN IF NOT EXISTS support_timeliness  numeric(4,2),
  ADD COLUMN IF NOT EXISTS support_weight      numeric(5,2);

-- Force PostgREST schema reload so the new columns are exposed immediately.
NOTIFY pgrst, 'reload schema';
