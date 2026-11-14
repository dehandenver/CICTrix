-- Marks a Phase 2 rating sheet the reviewer returned for revision. A returned
-- sheet stays phase2_status = 'in_progress', the same as an unfinished one, so
-- this column is what lets it bypass a closed rating window and the period
-- close. Set by returnPhase2ForRevision, cleared on the employee's resubmit.
--
-- Plan: docs/plans/2026-11-03-ipcr-phase2-return-lockout.md
ALTER TABLE target_settings ADD COLUMN IF NOT EXISTS phase2_returned_at timestamptz;
