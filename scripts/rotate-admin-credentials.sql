-- Rotate admin emails and passwords in Supabase Auth.
--
-- WHY SQL IS OK HERE: this only UPDATEs accounts that already exist. Do not
-- adapt it to INSERT new auth users -- creating a user requires a dozen
-- internal GoTrue columns, and a row that looks fine in the table can still
-- fail to authenticate. To create accounts, use scripts/create-admin-accounts.mjs.
--
-- THE EMAIL GOTCHA: Supabase keeps the email in TWO places --
--   auth.users.email
--   auth.identities.provider_id AND identity_data->>'email'
-- Updating only auth.users leaves the identity stale, and login fails or the
-- old address resurfaces. This script updates all of them together.
--
-- HOW TO RUN
--   1. Copy this file to  scripts/rotate-admin-credentials.local.sql
--      ( *.local is gitignored -- real passwords must never be committed )
--   2. Fill in the VALUES block below.
--   3. Paste into Supabase Dashboard -> SQL Editor -> Run.
--
-- Passwords set here are stored bcrypt-hashed, exactly as Supabase's own
-- signup path stores them. They are NOT in the JS bundle. Weak passwords are
-- still guessable by anyone who reaches the login page, so if this deployment
-- is public, pick something non-obvious.

begin;

-- new_email may be left the same as old_email if you only want a password change.
with new_creds (old_email, new_email, new_password) as (
  values
    ('admin@cictrix.gov.ph', 'REPLACE_ME@cictrix.gov.ph', 'REPLACE_ME'),
    ('rsp@cictrix.gov.ph',   'REPLACE_ME@cictrix.gov.ph', 'REPLACE_ME'),
    ('pm@cictrix.gov.ph',    'REPLACE_ME@cictrix.gov.ph', 'REPLACE_ME'),
    ('lnd@cictrix.gov.ph',   'REPLACE_ME@cictrix.gov.ph', 'REPLACE_ME')
),
targets as (
  select u.id as user_id, c.new_email, c.new_password
  from new_creds c
  join auth.users u on lower(u.email) = lower(c.old_email)
),

-- 1. Password + email on the auth user.
--    gen_salt('bf') is bcrypt, which is what GoTrue expects.
upd_users as (
  update auth.users u
     set email              = t.new_email,
         encrypted_password = extensions.crypt(t.new_password, extensions.gen_salt('bf')),
         email_confirmed_at = coalesce(u.email_confirmed_at, now()),
         updated_at         = now()
    from targets t
   where u.id = t.user_id
  returning u.id
),

-- 2. The identity row, or the change silently half-applies.
upd_identities as (
  update auth.identities i
     set provider_id   = t.new_email,
         identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(t.new_email), true),
         updated_at    = now()
    from targets t
   where i.user_id = t.user_id
     and i.provider = 'email'
  returning i.user_id
),

-- 3. Keep the app's own role table consistent. Role lookup is by user_id, so
--    this is cosmetic for auth -- but a stale email here is what makes the next
--    person think the account is wrong.
upd_roles as (
  update public.user_roles r
     set email = t.new_email
    from targets t
   where r.user_id = t.user_id
  returning r.user_id
)

select
  (select count(*) from upd_users)      as users_updated,
  (select count(*) from upd_identities) as identities_updated,
  (select count(*) from upd_roles)      as roles_updated;

-- Expect 4 / 4 / 4. Anything less means an old_email above did not match a real
-- account -- inspect before committing:
--     select email from auth.users order by email;
-- If the counts are wrong, run  rollback;  instead of  commit;

commit;

-- Existing sessions survive a password change. To force everyone to sign in
-- again with the new credentials, also run:
--     delete from auth.refresh_tokens where user_id in (select id from auth.users);
