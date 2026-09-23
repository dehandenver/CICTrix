-- ─────────────────────────────────────────────────────────────────────────────
-- user_roles — maps a Supabase Auth user to an admin portal role
-- ─────────────────────────────────────────────────────────────────────────────
--
-- This table existed only in production, created by hand in the dashboard and
-- captured in no migration. Two failures followed from that, both hit on the
-- HR demo clone:
--
--   * The clone had the table but no grant to `authenticated`, so the role
--     lookup failed with 42501 and every admin saw "No role assigned. Contact
--     the admin." while Supabase Auth was happily returning a valid session.
--   * Rebuilding the clone's schema dropped the table outright, and nothing in
--     the repo could recreate it — the same lockout, with no way back except
--     hand-writing the DDL again.
--
-- Capturing it here means a fresh project gets a working admin login from the
-- migrations alone.
--
-- LoginPage.tsx reads this immediately after signInWithPassword:
--   .from('user_roles').select('role').eq('user_id', user.id).single()
-- and treats any error as "no role", so a missing grant and a missing row are
-- indistinguishable to the person trying to sign in.

create table if not exists public.user_roles (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  email      text,
  name       text,
  -- Stored as written by scripts/create-admin-accounts.mjs (ADMIN, RSP, LND,
  -- PM); LoginPage normalises it, so no CHECK constraint here that would have
  -- to be kept in step with the front end.
  role       text        not null,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_roles_user_id_unique unique (user_id)
);

create index if not exists user_roles_user_id_idx on public.user_roles (user_id);

-- ── Access ──────────────────────────────────────────────────────────────────
-- Explicit, because the absence of exactly this grant is what broke admin
-- login on the clone. `authenticated` is the role that matters: the admin
-- portals sign in through Supabase Auth, so the lookup runs as that role.
grant select, insert, update, delete on public.user_roles to authenticated;
grant select on public.user_roles to anon;

alter table public.user_roles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'user_roles'
      and policyname = 'user_roles_self_read'
  ) then
    -- A signed-in user reads their own role row. That is all LoginPage needs,
    -- and it keeps one admin from enumerating the others.
    create policy user_roles_self_read
      on public.user_roles
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

end $$;
