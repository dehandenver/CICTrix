-- Applicants can list several relevant work experiences (up to 10, enforced by
-- the application form). Each element:
--   { "years": int, "months": int (0-11), "position": text,
--     "company": text, "duties": text }
--
-- years_of_experience stays and keeps holding the total (the sum of the
-- entries), because scoring, qualification matching and the SRP ranking read
-- it. Nothing reads the old per-entry fields from the database: the form never
-- stored position, company or duties, only the total.

alter table public.applicants
  add column if not exists work_experiences jsonb not null default '[]'::jsonb;

alter table public.applicants
  drop constraint if exists applicants_work_experiences_is_array;
alter table public.applicants
  add constraint applicants_work_experiences_is_array
  check (jsonb_typeof(work_experiences) = 'array');

comment on column public.applicants.work_experiences is
  'Relevant work experiences from the application form: [{years, months, position, company, duties}]. years_of_experience holds their total.';

-- Backfill: an existing application's total becomes a one-item list, so no
-- recorded experience is lost. Only the total was ever stored, so the text
-- fields are null. The total is in years (e.g. 2.5); split it into whole
-- years and leftover months via total months, so 2.99 becomes 3 y 0 m rather
-- than 2 y 12 m. Rows already backfilled (non-empty list) are skipped, so the
-- migration is safe to re-run. The text cast tolerates a numeric or text column.
with totals as (
  select id, round(years_of_experience::text::numeric * 12)::int as total_months
  from public.applicants
  where years_of_experience is not null
    and years_of_experience::text ~ '^[0-9]+(\.[0-9]+)?$'
)
update public.applicants a
set work_experiences = jsonb_build_array(jsonb_build_object(
  'years', t.total_months / 12,
  'months', t.total_months % 12,
  'position', null,
  'company', null,
  'duties', null
))
from totals t
where a.id = t.id
  and t.total_months > 0
  and a.work_experiences = '[]'::jsonb;
