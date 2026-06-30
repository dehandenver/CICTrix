-- Enable Supabase Realtime for applicant_attachments so the applicant
-- status tracker receives live updates when RSP approves or requests
-- resubmission of documents.
ALTER PUBLICATION supabase_realtime ADD TABLE applicant_attachments;
