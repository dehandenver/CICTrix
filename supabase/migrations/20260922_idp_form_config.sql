-- ─────────────────────────────────────────────────────────────────────────────
-- Individual Development Plan — form link and its own open/close window
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The IDP is filled in through a Google Form, and L&D wants it reachable only
-- during a scheduled window rather than all year round.
--
-- Deliberately its own table, not a new phase key on phase_schedules. That
-- table drives the IPCR Target-Setting and Rating phases, which are a different
-- cycle owned by Performance Management: bolting the IDP onto it would mean
-- L&D and PM editing the same rows, and an IPCR phase change silently moving
-- the IDP window. The two schedules have no reason to move together.
--
-- The form and responses URLs live in the database rather than in the bundle so
-- L&D can point the portal at a new form each cycle without a redeploy — a form
-- link is not something that should require an engineer.

create table if not exists public.idp_form_config (
  id            uuid        primary key default gen_random_uuid(),

  -- 'system' is the single active configuration. The column exists so a later
  -- per-office window can be added without reshaping the table.
  scope         text        not null default 'system',

  -- The employee-facing Google Form, and the responses spreadsheet L&D reads.
  -- The responses sheet is never shown to employees; it is recorded here so the
  -- pair stays together and nobody has to go hunting for which sheet belongs to
  -- which form.
  form_url      text,
  responses_url text,

  -- Shown above the form. Somewhere for L&D to say what this round is for.
  instructions  text,

  -- 'Auto' derives open/closed from the dates below; 'Open' and 'Closed' force
  -- it regardless, which is what you want when a deadline slips.
  mode          text        not null default 'Closed'
                            check (mode in ('Auto', 'Open', 'Closed')),
  opens_at      date,
  closes_at     date,

  updated_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint idp_form_config_scope_unique unique (scope)
);

-- Seed the single system row so the L&D screen has something to edit and the
-- employee page has something to read. Closed by default: a window that opens
-- itself the moment the migration lands is not what anyone wants.
insert into public.idp_form_config (scope, mode, instructions)
values (
  'system',
  'Closed',
  'Complete your Individual Development Plan for this cycle.'
)
on conflict (scope) do nothing;

-- ── Access ──────────────────────────────────────────────────────────────────
-- Both roles: the L&D admin screens use Supabase Auth (authenticated), while
-- the employee portal authenticates against employee_portal_accounts at the
-- application layer and is anonymous to Postgres.
--
-- Granted explicitly because a clone of this project came up with tables
-- restored but no grants, which made every read fail with 42501 and left the
-- portal blank behind a working login.
grant select, insert, update, delete on public.idp_form_config to anon, authenticated;

alter table public.idp_form_config enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'idp_form_config'
      and policyname = 'idp_form_config_portal_access'
  ) then
    create policy idp_form_config_portal_access
      on public.idp_form_config
      for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end $$;
