-- ─────────────────────────────────────────────────────────────────────────────
-- System of Ranking Positions (SRP) — succession specification, section C
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Succession needs to know how positions rank relative to one another, so that
-- a candidate's current position can be judged appropriate for a target — and
-- so the system never proposes somebody in a higher-ranked position for a
-- lower-ranked one.
--
-- Extends the existing `positions` table rather than adding another. It already
-- holds name/department and is already the thing
-- position_competency_requirements points at, which is the SRP's "required
-- competencies" line; a parallel table would split the definition in two.
--
-- The SRP is meant to define, per section C:
--   Position                  -> positions.name (existing)
--   Position level / rank     -> salary_grade + position_level + level_order
--   Minimum qualifications    -> min_education, min_education_field,
--                                required_eligibility
--   Required experience       -> min_years_experience
--   Required training         -> min_training_hours, required_training_categories
--   Required competencies     -> position_competency_requirements (existing FK)
--   Position hierarchy        -> parent_position_id
--
-- Two ranking signals, deliberately:
--
--   salary_grade is the civil-service ladder and the one to trust — it is
--   ordinal, externally defined, and already recorded against most job
--   postings. Where it is set, it decides rank.
--
--   level_order exists because it is not always set. Production job postings
--   carry a salary grade on 14 of 22 rows, so a grade-only comparison would
--   leave a third of positions unrankable. The Staff -> Senior Staff ->
--   Supervisor -> Division Chief ladder from the spec gives a coarse fallback.
--   Comparing a position that has neither must return "unknown" rather than
--   "equal", or an unranked position silently reads as a peer of everything.

alter table public.positions
  -- Civil-service salary grade, 1–33. The primary rank signal.
  add column if not exists salary_grade      smallint,

  -- Human-readable rung, e.g. 'Staff', 'Senior Staff', 'Supervisor',
  -- 'Division Chief'. Free text so an office can use its own vocabulary.
  add column if not exists position_level    text,

  -- Numeric ordering for position_level, since the labels themselves do not
  -- sort. Higher means more senior. Only meaningful within an organisation.
  add column if not exists level_order       smallint,

  -- Position hierarchy: the position this one reports into. Self-referencing,
  -- so a chain reads Staff -> Senior Staff -> Supervisor -> Division Chief.
  add column if not exists parent_position_id uuid
    references public.positions(id) on delete set null,

  -- Minimum qualifications, mirroring what critical_positions already carries
  -- so a critical position can inherit from its SRP entry instead of repeating
  -- every threshold by hand.
  add column if not exists min_education             text,
  add column if not exists min_education_field       text,
  add column if not exists required_eligibility      text,
  add column if not exists min_years_experience      numeric(4,1),
  add column if not exists min_training_hours        numeric(6,1),
  add column if not exists required_training_categories text[] not null default '{}',

  -- A position that has been abolished stays on the record for history but
  -- should not appear as a succession target.
  add column if not exists is_active         boolean not null default true;

-- Salary grade is an external scale; a typo outside it is a data error, not a
-- very senior position.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'positions_salary_grade_range'
  ) then
    alter table public.positions
      add constraint positions_salary_grade_range
      check (salary_grade is null or (salary_grade between 1 and 33));
  end if;
end $$;

-- A position cannot report to itself. Deeper cycles are not caught here — that
-- needs a recursive check the application does when editing the hierarchy.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'positions_no_self_parent'
  ) then
    alter table public.positions
      add constraint positions_no_self_parent
      check (parent_position_id is null or parent_position_id <> id);
  end if;
end $$;

create index if not exists positions_salary_grade_idx on public.positions (salary_grade);
create index if not exists positions_parent_idx       on public.positions (parent_position_id);
-- Resolving an employee's rank from their free-text position title needs a
-- case-insensitive lookup on name; employees.position_id is rarely populated.
create index if not exists positions_name_lower_idx   on public.positions (lower(name));

-- ── Access ──────────────────────────────────────────────────────────────────
-- Granted explicitly: a clone of this project came up with tables restored but
-- no grants, which made every read fail with 42501 behind a working login.
grant select, insert, update, delete on public.positions to anon, authenticated;

alter table public.positions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'positions'
      and policyname = 'positions_portal_access'
  ) then
    create policy positions_portal_access
      on public.positions
      for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end $$;

-- ── Seeding from existing job postings ──────────────────────────────────────
-- job_postings already carries title, department, salary grade and every
-- requirement the SRP wants, for 22 real positions. Lifting them gives the SRP
-- something to stand on rather than an empty screen.
--
-- position_level is deliberately left null: that column is null on every job
-- posting too, so there is nothing to copy and guessing a rung from a title
-- would put invented hierarchy into the system of record. HR fills it in.
insert into public.positions (
  name, department, salary_grade, min_education, min_education_field,
  required_eligibility, min_years_experience, min_training_hours
)
select distinct on (lower(jp.title), lower(coalesce(jp.department, '')))
  jp.title,
  coalesce(jp.department, 'Unassigned'),
  case when jp.salary_grade ~ '^[0-9]+$'
         and jp.salary_grade::int between 1 and 33
       then jp.salary_grade::smallint end,
  jp.education_requirement,
  jp.education_field,
  jp.eligibility,
  case when jp.experience_years ~ '^[0-9]+(\.[0-9]+)?$'
       then jp.experience_years::numeric end,
  case when jp.training_requirement ~ '^[0-9]+(\.[0-9]+)?$'
       then jp.training_requirement::numeric end
from public.job_postings jp
where coalesce(trim(jp.title), '') <> ''
order by lower(jp.title), lower(coalesce(jp.department, '')), jp.created_at desc
on conflict (name, department) do nothing;
