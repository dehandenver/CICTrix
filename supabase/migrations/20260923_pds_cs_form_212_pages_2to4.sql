-- ─────────────────────────────────────────────────────────────────────────────
-- Personal Data Sheet — CS Form No. 212 (Revised 2025), pages 2–4
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Completes the Personal Data Sheet started in 20260922_pds_cs_form_212_page1.sql
-- (page 1 / sheet C1). This migration covers sheets C2–C4:
--
--   C2 (page 2): IV. Civil Service Eligibility (27), V. Work Experience (28)
--   C3 (page 3): VI. Voluntary Work (29), VII. L&D Interventions (30),
--                VIII. Other Information (31-33)
--   C4 (page 4): background disclosure questions (34-40), References (41),
--                government-issued ID fields (42, data only — no photo,
--                signature, thumbmark or notarial block; those need real
--                file/signing capture and are a separate feature)
--
-- Items 27-30 and 41 are repeating lists. employee_voluntary_work,
-- employee_ld_interventions and employee_references are new tables, same
-- shape and access pattern as employee_children / employee_education in the
-- page-1 migration.
--
-- employee_eligibility and employee_work_experience are NOT new tables:
-- they already exist in production (created ad hoc from
-- backend/database/migrations/001_create_employee_tables.sql, for an
-- existing, unrelated admin "employee 201 file" read path in
-- src/lib/api/employees.ts) with their own column names and grants already
-- in place. This was only discovered by probing the live schema via
-- PostgREST after writing this migration the first time — `create table if
-- not exists` against those two names would have silently no-opped and left
-- every PDS write for items 27/28 failing with "column does not exist" in
-- production. They are extended in place below instead, using their real
-- column names, and are deliberately left out of the grants loop further
-- down since anon already has full access to them (verified live).
--
-- Items 31-42 (minus the lists) are scalars on `employees`.

-- ── VIII. OTHER INFORMATION (31-33) ─────────────────────────────────────────
alter table public.employees
  add column if not exists special_skills_hobbies      text,
  add column if not exists non_academic_distinctions    text,
  add column if not exists membership_associations      text,

-- ── Background information (34-40) ──────────────────────────────────────────
-- Nullable booleans: unanswered and an explicit "No" are different states on
-- a legal disclosure, so a cleared/never-answered question must stay NULL
-- rather than default to false.
  add column if not exists related_third_degree         boolean,
  add column if not exists related_fourth_degree        boolean,
  add column if not exists related_details              text,
  add column if not exists admin_offense_guilty         boolean,
  add column if not exists admin_offense_details        text,
  add column if not exists criminally_charged           boolean,
  add column if not exists criminal_charge_details      text,
  add column if not exists criminal_case_date_filed     date,
  add column if not exists criminal_case_status         text,
  add column if not exists convicted_of_crime           boolean,
  add column if not exists convicted_details             text,
  add column if not exists separated_from_service       boolean,
  add column if not exists separated_details            text,
  add column if not exists election_candidate           boolean,
  add column if not exists election_candidate_details   text,
  add column if not exists resigned_to_campaign         boolean,
  add column if not exists resigned_to_campaign_details text,
  add column if not exists immigrant_status             boolean,
  add column if not exists immigrant_country            text,
  add column if not exists indigenous_group_member      boolean,
  add column if not exists indigenous_group_specify     text,
  add column if not exists person_with_disability       boolean,
  add column if not exists pwd_id_number                text,
  add column if not exists solo_parent                  boolean,
  add column if not exists solo_parent_id_number        text,

-- ── 42. Government-issued ID (data fields only) ─────────────────────────────
  add column if not exists gov_id_type                  text,
  add column if not exists gov_id_number                text,
  add column if not exists gov_id_issued_date_place     text;

-- ── 27. CIVIL SERVICE ELIGIBILITY ───────────────────────────────────────────
-- Pre-existing table (see note above). Real columns already there:
--   eligibility_type, rating (numeric), date_of_exam, place_of_examination,
--   license_number, validity_date. Only sort_order is missing, needed to
--   keep the portal's list order stable across reloads (the original schema
--   had no ordering column).
alter table public.employee_eligibility
  add column if not exists sort_order integer not null default 0;

create index if not exists employee_eligibility_employee_idx
  on public.employee_eligibility (employee_id, sort_order);

-- ── 28. WORK EXPERIENCE ─────────────────────────────────────────────────────
-- Pre-existing table (see note above). Real columns already there:
--   position_title, company_name, from_date, to_date, is_government_service
--   (plus is_present/duties_responsibilities/separation_reason, which this
--   PDS view doesn't surface). Adding what item 28 needs that isn't there yet.
alter table public.employee_work_experience
  add column if not exists status_of_appointment text,
  add column if not exists sort_order integer not null default 0;

create index if not exists employee_work_experience_employee_idx
  on public.employee_work_experience (employee_id, sort_order);

-- ── 29. VOLUNTARY WORK ──────────────────────────────────────────────────────
create table if not exists public.employee_voluntary_work (
  id                     uuid        primary key default gen_random_uuid(),
  employee_id            uuid        not null references public.employees(id) on delete cascade,
  org_name_address       text        not null,
  date_from              date,
  date_to                date,
  number_of_hours        numeric(6,2),
  position_nature_of_work text,
  sort_order             integer     not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists employee_voluntary_work_employee_idx
  on public.employee_voluntary_work (employee_id, sort_order);

-- ── 30. L&D INTERVENTIONS / TRAINING PROGRAMS ATTENDED ──────────────────────
-- Named after the form's own heading, not "employee_trainings": the codebase
-- already has an unrelated, much larger training/L&D *scheduling* system
-- (training_plan_entries, lnd_training_tables, etc.). This table is the
-- employee's own self-reported history for the printed form and must not be
-- confused with — or later wired into — that scheduling feature.
create table if not exists public.employee_ld_interventions (
  id               uuid        primary key default gen_random_uuid(),
  employee_id      uuid        not null references public.employees(id) on delete cascade,
  title            text        not null,
  date_from        date,
  date_to          date,
  number_of_hours  numeric(6,2),
  ld_type          text,
  conducted_by     text,
  sort_order       integer     not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists employee_ld_interventions_employee_idx
  on public.employee_ld_interventions (employee_id, sort_order);

-- ── 41. REFERENCES ──────────────────────────────────────────────────────────
create table if not exists public.employee_references (
  id            uuid        primary key default gen_random_uuid(),
  employee_id   uuid        not null references public.employees(id) on delete cascade,
  name          text        not null,
  address       text,
  contact_info  text,
  sort_order    integer     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists employee_references_employee_idx
  on public.employee_references (employee_id, sort_order);

-- ── Access ──────────────────────────────────────────────────────────────────
-- Same reasoning as the page-1 migration: granted explicitly to both roles
-- (admin portals use Supabase Auth / authenticated; the employee portal
-- authenticates at the application layer and is anonymous to Postgres). A
-- clone that restores tables without grants fails every read with 42501 and
-- leaves the portal blank behind a working login — do not reintroduce that.
--
-- employee_eligibility and employee_work_experience are deliberately not in
-- this list: they're pre-existing tables already granted to anon/authenticated
-- for the admin "employee 201 file" read path, confirmed live via a
-- foreign-key-violation probe (an insert reached the FK check rather than
-- being rejected by RLS/grants). Re-running the grant/policy statements
-- against them would be harmless, but they're left out to keep this
-- migration's blast radius limited to the tables it actually owns.
do $$
declare
  t text;
begin
  foreach t in array array[
    'employee_voluntary_work',
    'employee_ld_interventions',
    'employee_references'
  ]
  loop
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
    execute format('alter table public.%I enable row level security', t);

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename  = t
        and policyname = t || '_portal_access'
    ) then
      execute format(
        'create policy %I on public.%I for all to anon, authenticated using (true) with check (true)',
        t || '_portal_access', t
      );
    end if;
  end loop;
end $$;
