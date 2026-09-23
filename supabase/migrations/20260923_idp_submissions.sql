-- ─────────────────────────────────────────────────────────────────────────────
-- IDP submissions — the Individual Development Plan questionnaire
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The IDP was originally a Google Form. It is now filled in inside the portal,
-- built the same way as the interviewer evaluation form, because the responses
-- have to be readable by the system: L&D's annual output is a per-office matrix
-- of development needs, and that cannot be produced from a spreadsheet the app
-- has no access to.
--
-- Structure follows the printed questionnaire section for section:
--   PERSONAL DATA -> SELF-EVALUATION -> Part III (conditional)
--   -> CAREER DEVELOPMENT -> PERSONAL DEVELOPMENT -> RECOMMENDATION
--
-- The two checkbox groups are stored as arrays rather than child tables. The
-- option sets are fixed and short, and every read of them is "count responses
-- per category per office", which unnest() answers directly.

create table if not exists public.idp_submissions (
  id            uuid        primary key default gen_random_uuid(),

  -- Text, not a uuid FK: the employee portal identifies people by the same
  -- employee number that employee_portal_accounts.employee_id carries, and that
  -- column is text in both the production and the older employees shapes.
  employee_id   text        not null,

  -- The form runs once a year, so the cycle is part of the identity of a
  -- submission rather than something derived from submitted_at — a window that
  -- straddles New Year would otherwise split one cycle across two years.
  cycle_year    integer     not null,

  -- ── PERSONAL DATA ─────────────────────────────────────────────────────────
  -- Pre-filled from the employee's record where known, but stored here as
  -- answered: the sheet is a point-in-time declaration, and a later promotion
  -- must not silently rewrite what somebody submitted last cycle.
  full_name                 text,
  office                    text,
  division                  text,
  position                  text,
  salary_grade              text,
  years_in_position         text,
  years_government_service  text,
  eligibility               text,
  educational_attainment    text,
  age                       text,
  gender                    text,
  email                     text,

  -- ── SELF-EVALUATION ───────────────────────────────────────────────────────
  skills_to_develop             text,
  strengths_to_utilize          text,
  works_outside_job_description boolean,
  -- Part III, asked only when the answer above is YES.
  outside_tasks                 text,

  -- ── CAREER DEVELOPMENT ────────────────────────────────────────────────────
  career_needs      text[]  not null default '{}',
  career_other      text,
  career_specifics  text,

  -- ── PERSONAL DEVELOPMENT ──────────────────────────────────────────────────
  personal_goals     text[] not null default '{}',
  personal_other     text,
  personal_specifics text,

  -- ── RECOMMENDATION ────────────────────────────────────────────────────────
  other_topics  text,

  -- Null while a draft is in progress; set when the employee submits. The
  -- report counts submitted rows only.
  submitted_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- One submission per employee per cycle. Re-opening a window lets an employee
  -- revise their row rather than file a second one.
  constraint idp_submissions_employee_cycle_unique unique (employee_id, cycle_year)
);

-- The report groups by office within a cycle; the tracker looks up one
-- employee's row for the current cycle.
create index if not exists idp_submissions_cycle_office_idx
  on public.idp_submissions (cycle_year, office);
create index if not exists idp_submissions_employee_idx
  on public.idp_submissions (employee_id, cycle_year);

-- ── Access ──────────────────────────────────────────────────────────────────
-- Both roles: L&D reads through Supabase Auth (authenticated), while the
-- employee portal authenticates at the application layer and is anonymous to
-- Postgres.
--
-- Granted explicitly, because a clone of this project came up with tables
-- restored but no grants, which made every read fail with 42501.
grant select, insert, update, delete on public.idp_submissions to anon, authenticated;

alter table public.idp_submissions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'idp_submissions'
      and policyname = 'idp_submissions_portal_access'
  ) then
    -- NOTE: this is as tight as the current architecture allows. Employees have
    -- no Supabase identity — the portal authenticates them against
    -- employee_portal_accounts at the application layer — so there is no
    -- auth.uid() to scope rows by, and a per-employee policy is not expressible
    -- here. Anyone holding the public anon key can therefore read every
    -- submission, which for self-evaluations and salary grades is worth closing
    -- properly by moving the employee portal onto Supabase Auth.
    create policy idp_submissions_portal_access
      on public.idp_submissions
      for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end $$;
