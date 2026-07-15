-- Enable Supabase Realtime for the applicants table so the applicant
-- status tracker receives live updates when RSP changes the application
-- status (e.g., "Document Verified", "Shortlisted", schedule updates).
ALTER PUBLICATION supabase_realtime ADD TABLE applicants;
