-- Supabase Realtime row filters require REPLICA IDENTITY FULL.
-- Without this, filtered subscriptions (e.g. applicant_id=eq.xxx)
-- receive zero events even if the table is in the publication.
ALTER TABLE applicant_attachments REPLICA IDENTITY FULL;
ALTER TABLE applicants REPLICA IDENTITY FULL;
