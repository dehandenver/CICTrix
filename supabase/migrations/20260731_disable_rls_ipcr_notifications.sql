-- Disable Row Level Security (RLS) on ipcr_notifications so the Office/PM portals (anon/authenticated) can read and write notifications.
-- Created: 2026-07-17

BEGIN;

ALTER TABLE ipcr_notifications DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON ipcr_notifications TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
