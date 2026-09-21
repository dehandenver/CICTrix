-- Fix: admin login fails with "No role assigned. Contact the admin." on any
-- cloned Supabase project (first hit on the HR demo, hydqhmtppkghqaatdgwx).
--
-- LoginPage.tsx reads public.user_roles after signInWithPassword to resolve
-- which admin portal to route to:
--
--     .from('user_roles').select('role').eq('user_id', user.id).single()
--
-- public.user_roles was created by hand in the Supabase dashboard on production
-- and never captured in a migration, so neither the table nor its grants travel
-- with the schema. On a clone the rows get restored by scripts/restore-database
-- but `authenticated` holds no SELECT privilege, so that read fails with
--
--     42501  permission denied for table user_roles
--
-- LoginPage treats any error from the lookup as "no role", discards the session
-- and shows "No role assigned" — so a correctly provisioned admin with a valid
-- user_roles row still cannot log in. Auth succeeds; only the role read fails.
--
-- Idempotent and a no-op on production, where the grant already exists.

grant select on public.user_roles to authenticated;

-- If RLS is enabled on the table, the grant alone still yields zero rows and
-- .single() errors out to the same message. Add a self-read policy, but only
-- when RLS is actually on and nothing already grants SELECT — this must not
-- loosen a project that has deliberately stricter policies.
do $$
begin
  if exists (
    select 1
    from pg_tables
    where schemaname = 'public'
      and tablename  = 'user_roles'
      and rowsecurity
  ) and not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename  = 'user_roles'
      and cmd in ('SELECT', 'ALL')
  ) then
    create policy user_roles_select_own
      on public.user_roles
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;
