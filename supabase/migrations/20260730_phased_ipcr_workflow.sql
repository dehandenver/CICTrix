-- Safety net: ipcr_notifications (migration 015 not in repo). Columns match ipcrSubmissions.ts types.
CREATE TABLE IF NOT EXISTS ipcr_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase text NOT NULL CHECK (phase IN ('target','rating')),
  office_id uuid,            -- NULL = all offices (system-wide open)
  office_name text,
  period text,
  employee_count integer NOT NULL DEFAULT 0,
  message text,
  triggered_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Realtime for both notification inboxes (guarded like 20260729)
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE employee_notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE ipcr_notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
