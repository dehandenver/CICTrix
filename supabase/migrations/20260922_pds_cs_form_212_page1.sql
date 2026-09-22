-- ─────────────────────────────────────────────────────────────────────────────
-- Personal Data Sheet — CS Form No. 212 (Revised 2025), page 1
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The employee portal's "Personal Information" tab showed nine read-only fields.
-- It is being replaced by a Personal Data Sheet that follows the actual CSC
-- form, so the columns below are the page-1 fields the employees table did not
-- already carry.
--
-- Already present and deliberately reused rather than duplicated:
--   first_name / middle_name / last_name   1. and 2. SURNAME / FIRST / MIDDLE
--   suffix                                 NAME EXTENSION (JR., SR.)
--   date_of_birth                          3. DATE OF BIRTH
--   sex                                    5. SEX AT BIRTH
--   civil_status                           6. CIVIL STATUS
--   employee_number                        15. AGENCY EMPLOYEE NO.
--   email                                  21. E-MAIL ADDRESS
--   tin_number / sss_number /              14. TIN, and the GSIS/PhilHealth/
--   philhealth_number / pagibig_number /       Pag-IBIG identifiers
--   gsis_number
--
-- Addresses are stored as discrete components rather than one free-text line
-- because the form prints them into separate boxes (House/Block/Lot, Street,
-- Subdivision/Village, Barangay, City/Municipality, Province, ZIP) and a single
-- string cannot be split back apart reliably.

-- ── I. PERSONAL INFORMATION ─────────────────────────────────────────────────
alter table public.employees
  add column if not exists place_of_birth            text,
  add column if not exists height_m                  numeric(4,2),
  add column if not exists weight_kg                 numeric(5,2),
  add column if not exists blood_type                text,
  add column if not exists umid_number               text,
  add column if not exists philsys_number            text,
  add column if not exists citizenship               text,
  -- 16. CITIZENSHIP is "by birth" or "by naturalization", with the country
  -- named only when the holder has dual citizenship.
  add column if not exists citizenship_basis         text,
  add column if not exists dual_citizenship_country  text,
  add column if not exists telephone_number          text,
  -- `phone` already exists and is written by several older code paths, so the
  -- form's 20. MOBILE NO. gets its own column rather than redefining that one.
  add column if not exists mobile_number             text,

  -- 17. RESIDENTIAL ADDRESS
  add column if not exists residential_house_lot     text,
  add column if not exists residential_street        text,
  add column if not exists residential_subdivision   text,
  add column if not exists residential_barangay      text,
  add column if not exists residential_city          text,
  add column if not exists residential_province      text,
  add column if not exists residential_zip           text,

  -- 18. PERMANENT ADDRESS
  add column if not exists permanent_house_lot       text,
  add column if not exists permanent_street          text,
  add column if not exists permanent_subdivision     text,
  add column if not exists permanent_barangay        text,
  add column if not exists permanent_city            text,
  add column if not exists permanent_province        text,
  add column if not exists permanent_zip             text,

-- ── II. FAMILY BACKGROUND ───────────────────────────────────────────────────
  add column if not exists spouse_surname            text,
  add column if not exists spouse_first_name         text,
  add column if not exists spouse_middle_name        text,
  add column if not exists spouse_suffix             text,
  add column if not exists spouse_occupation         text,
  add column if not exists spouse_employer           text,
  add column if not exists spouse_business_address   text,
  add column if not exists spouse_telephone          text,
  add column if not exists father_surname            text,
  add column if not exists father_first_name         text,
  add column if not exists father_middle_name        text,
  add column if not exists father_suffix             text,
  -- 25. MOTHER'S MAIDEN NAME — maiden surname, so it is not father_surname.
  add column if not exists mother_surname            text,
  add column if not exists mother_first_name         text,
  add column if not exists mother_middle_name        text,

-- ── Sheet metadata ──────────────────────────────────────────────────────────
  -- The form carries a signature and date; recording when the employee last
  -- affirmed the sheet is what makes a printed copy defensible.
  add column if not exists pds_signed_at             timestamptz,
  add column if not exists pds_updated_at            timestamptz;

-- ── 23. NAME of CHILDREN ────────────────────────────────────────────────────
-- A repeating list on the form, so it cannot live in columns on employees.
create table if not exists public.employee_children (
  id            uuid        primary key default gen_random_uuid(),
  employee_id   uuid        not null references public.employees(id) on delete cascade,
  full_name     text        not null,
  date_of_birth date,
  sort_order    integer     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists employee_children_employee_idx
  on public.employee_children (employee_id, sort_order);

-- ── III. EDUCATIONAL BACKGROUND ─────────────────────────────────────────────
-- employee_education already exists but only held school / degree /
-- year_graduated. The form needs the level it belongs to, the attendance
-- period, units earned when not graduated, and honours received.
alter table public.employee_education
  add column if not exists level                text,
  add column if not exists period_from          text,
  add column if not exists period_to            text,
  add column if not exists highest_level_units  text,
  add column if not exists scholarship_honors   text,
  add column if not exists sort_order           integer not null default 0;

-- ── Access ──────────────────────────────────────────────────────────────────
-- Granted explicitly. A clone of this project came up with tables restored but
-- no grants, which made every read fail with 42501 and left the portal blank
-- behind a working login; a new table must not reintroduce that.
--
-- Both roles: the admin portals use Supabase Auth (authenticated), while the
-- employee portal authenticates against employee_portal_accounts at the
-- application layer and is therefore anonymous to Postgres.
grant select, insert, update, delete on public.employee_children to anon, authenticated;

alter table public.employee_children enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'employee_children'
      and policyname = 'employee_children_portal_access'
  ) then
    create policy employee_children_portal_access
      on public.employee_children
      for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end $$;
