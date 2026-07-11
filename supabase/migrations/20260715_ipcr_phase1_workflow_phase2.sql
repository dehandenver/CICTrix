-- ============================================================================
-- IPCR Phase 1 approval workflow + Phase 2 per-indicator QET ratings
-- Created: 2026-07-15
-- Builds on 20260714_ipcr_target_setting.sql (target_settings / mfos /
-- success_indicators).
--
-- Design decisions (confirmed with the team):
--
--   * Enforcement lives in the FastAPI backend (service_role), because
--     employees and Office Accounts reach PostgREST as anon (no Supabase Auth),
--     so RLS cannot identify the caller. Privileged actions — approve,
--     admin-override, return-for-revision, rating-override — go through FastAPI.
--
--   * BUT immutability of an APPROVED record does NOT need identity, only the
--     record's status. So it is enforced here with a trigger that rejects any
--     write to the MFOs / success indicators / ratings of an approved
--     target_setting. This is real server-side immutability that holds even for
--     an anon client hitting PostgREST directly — not just a UI guard.
--
--   * Self-approval block DOES need identity (approver != employee), so it stays
--     in FastAPI. A defensive CHECK (approved_by <> employee_id) is added too.
--
--   * Phase 2 is employee self-rating; the Office Account may override any Q/E/T
--     value, exactly as it may override Phase 1 target text before approving.
--     Ratings are stored as three separate 1-5 integers per success indicator —
--     never a pre-averaged value.
--
-- Idempotent: safe to re-apply.
-- ============================================================================

BEGIN;

-- ── 1. Phase 1 workflow status vocabulary + columns ─────────────────────────
-- Old check: ('draft','submitted','approved','rejected'). Move to the spec's
-- names and migrate the (single, 'approved') existing row along the way.
ALTER TABLE target_settings DROP CONSTRAINT IF EXISTS target_settings_status_check;

UPDATE target_settings SET status = 'submitted_for_approval' WHERE status = 'submitted';
UPDATE target_settings SET status = 'returned_for_revision'  WHERE status = 'rejected';

-- The two legacy values ('submitted','rejected') are tolerated so that the
-- frontend deploy and this migration can land in either order without a submit
-- failing in the gap. No code writes them any more; they can be dropped from the
-- constraint in a later cleanup once both are confirmed live.
ALTER TABLE target_settings
  ADD CONSTRAINT target_settings_status_check
  CHECK (status IN (
    'draft', 'submitted_for_approval', 'returned_for_revision', 'approved',
    'submitted', 'rejected'
  ));

ALTER TABLE target_settings
  ADD COLUMN IF NOT EXISTS approved_by   uuid REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at   timestamptz,
  ADD COLUMN IF NOT EXISTS returned_at   timestamptz,
  -- Phase 2 runs on top of an approved Phase 1, so it is a separate axis.
  ADD COLUMN IF NOT EXISTS phase2_status text NOT NULL DEFAULT 'not_started'
    CHECK (phase2_status IN ('not_started', 'in_progress', 'completed')),
  ADD COLUMN IF NOT EXISTS phase2_completed_at timestamptz;

-- Defence in depth for the self-approval block (FastAPI is the primary guard).
ALTER TABLE target_settings DROP CONSTRAINT IF EXISTS target_settings_no_self_approval;
ALTER TABLE target_settings
  ADD CONSTRAINT target_settings_no_self_approval
  CHECK (approved_by IS NULL OR approved_by <> employee_id);


-- ── 2. Per-success-indicator QET ratings ────────────────────────────────────
-- One row per success indicator. Q/E/T are nullable so a rater can save partial
-- progress. Averaging/weighting happens at read time, never here.
CREATE TABLE IF NOT EXISTS success_indicator_ratings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  success_indicator_id uuid NOT NULL UNIQUE
                         REFERENCES success_indicators(id) ON DELETE CASCADE,
  quality     integer CHECK (quality     BETWEEN 1 AND 5),
  efficiency  integer CHECK (efficiency  BETWEEN 1 AND 5),
  timeliness  integer CHECK (timeliness  BETWEEN 1 AND 5),
  -- Who entered the score (the employee, self-rating) and who last overrode it
  -- (an Office Account), for the audit trail and the "edited by office" chip.
  rated_by      uuid REFERENCES employees(id) ON DELETE SET NULL,
  overridden_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  overridden_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS success_indicator_ratings_si_idx
  ON success_indicator_ratings (success_indicator_id);


-- ── 3. Audit log (mirrors the employee_history column shape) ────────────────
CREATE TABLE IF NOT EXISTS ipcr_audit_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_setting_id uuid NOT NULL REFERENCES target_settings(id) ON DELETE CASCADE,
  action            text NOT NULL,   -- submit | admin_edit | return | approve | rate | rating_override
  field_changed     text,
  old_value         text,
  new_value         text,
  performed_by      uuid REFERENCES employees(id) ON DELETE SET NULL,
  performed_by_role text,            -- 'employee' | 'office_account'
  reason            text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ipcr_audit_log_target_idx
  ON ipcr_audit_log (target_setting_id, created_at DESC);


-- ── 4. Immutability: no edits once Phase 1 is APPROVED ──────────────────────
-- Status-based, so it needs no caller identity and holds against a direct anon
-- PostgREST write, not just the UI. Blocks writes to the children of an approved
-- target_setting. Phase 2 ratings are exempt: rating an approved record is the
-- whole point of Phase 2, and ratings live in their own table with their own
-- lifecycle (phase2_status / phase2_completed_at gate those in FastAPI).
-- Fields are read via to_jsonb(...)->>'key' rather than NEW.col / OLD.col. This
-- one function is shared by triggers on two tables with different row shapes;
-- referencing NEW.mfo_id directly makes PL/pgSQL fail to plan the function on
-- the mfos table ("record new has no field mfo_id"). A jsonb key lookup resolves
-- at runtime and returns NULL for an absent key, so the same body is safe on
-- both tables and for INSERT/UPDATE/DELETE (where NEW or OLD is null).
CREATE OR REPLACE FUNCTION ipcr_block_edit_when_approved()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_new        jsonb := to_jsonb(NEW);
  v_old        jsonb := to_jsonb(OLD);
  v_setting_id uuid;
  v_status     text;
BEGIN
  IF TG_TABLE_NAME = 'mfos' THEN
    v_setting_id := COALESCE(v_new->>'target_setting_id', v_old->>'target_setting_id')::uuid;
  ELSIF TG_TABLE_NAME = 'success_indicators' THEN
    SELECT m.target_setting_id INTO v_setting_id
      FROM mfos m
     WHERE m.id = COALESCE(v_new->>'mfo_id', v_old->>'mfo_id')::uuid;
  END IF;

  SELECT status INTO v_status FROM target_settings WHERE id = v_setting_id;

  IF v_status = 'approved' THEN
    RAISE EXCEPTION 'IPCR target setting % is approved and frozen; its targets cannot be modified.', v_setting_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS mfos_block_when_approved ON mfos;
CREATE TRIGGER mfos_block_when_approved
  BEFORE INSERT OR UPDATE OR DELETE ON mfos
  FOR EACH ROW EXECUTE FUNCTION ipcr_block_edit_when_approved();

DROP TRIGGER IF EXISTS success_indicators_block_when_approved ON success_indicators;
CREATE TRIGGER success_indicators_block_when_approved
  BEFORE INSERT OR UPDATE OR DELETE ON success_indicators
  FOR EACH ROW EXECUTE FUNCTION ipcr_block_edit_when_approved();


-- ── 5. Access ───────────────────────────────────────────────────────────────
-- Reads open to the portal (anon). Self-service writes (employee draft edits,
-- self-rating) stay anon, guarded by the immutability trigger above. Privileged
-- writes (approve / override / return) are performed by FastAPI with the service
-- key; the audit log is append-only for anon (no update/delete).
ALTER TABLE success_indicator_ratings DISABLE ROW LEVEL SECURITY;
ALTER TABLE ipcr_audit_log            DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON success_indicator_ratings TO anon, authenticated;
GRANT SELECT, INSERT ON ipcr_audit_log TO anon, authenticated;   -- append-only
REVOKE UPDATE, DELETE ON ipcr_audit_log FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
