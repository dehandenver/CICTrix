-- Enable Realtime Replication for CICTrix tables
-- Supabase requires tables to be added to the supabase_realtime publication to emit changes.

DO $$
BEGIN
  -- Create supabase_realtime publication if it doesn't exist using dynamic SQL
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    EXECUTE 'CREATE PUBLICATION supabase_realtime';
  END IF;
END $$;

-- Enable replica identity full for accurate OLD values
ALTER TABLE public.employees REPLICA IDENTITY FULL;
ALTER TABLE public.ipcr_submissions REPLICA IDENTITY FULL;
ALTER TABLE public.probationary_ipcr_schedules REPLICA IDENTITY FULL;

-- Add tables to publication safely
DO $$
BEGIN
  -- employees
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'employees'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.employees;
  END IF;

  -- ipcr_submissions
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ipcr_submissions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ipcr_submissions;
  END IF;

  -- probationary_ipcr_schedules
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'probationary_ipcr_schedules'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.probationary_ipcr_schedules;
  END IF;
END $$;
