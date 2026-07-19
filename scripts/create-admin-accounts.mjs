/**
 * Create real PM Admin / L&D Admin accounts in Supabase Auth.
 *
 * Why: before this, those two portals had no database credentials at all. They
 * authenticated against a MOCK_USERS table hardcoded in LoginPage.tsx, which is
 * compiled into the public JS bundle — `pm123` and `lnd123` were readable by
 * anyone who opened devtools on the deployed site. This creates the accounts
 * that replace that path, so the mock entries can be removed in the same
 * deploy rather than leaving a window where neither works.
 *
 * These accounts are also what lets backend-gated endpoints work at all: the
 * weighting-config route checks a role, and `get_authenticated_user` validates
 * Supabase tokens server-side. No Supabase account meant no token to check.
 *
 * Passwords are randomly generated and printed ONCE. They are not stored in the
 * repo — record them from the output.
 *
 * Idempotent: an existing account has its password rotated and role re-asserted
 * rather than erroring.
 *
 * Run:  node scripts/create-admin-accounts.mjs
 * Needs SUPABASE_SERVICE_ROLE_KEY in .env or backend/.env.
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function loadEnv(path) {
  if (!fs.existsSync(path)) return {};
  return fs.readFileSync(path, 'utf8').split('\n').reduce((acc, line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return acc;
    const i = t.indexOf('=');
    if (i < 0) return acc;
    acc[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    return acc;
  }, {});
}
const env = { ...loadEnv('.env'), ...loadEnv('backend/.env') };
const URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY;
if (!URL || !SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env / backend/.env).');
  process.exit(1);
}
const supabase = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });

/**
 * The two admin portals that reach backend-gated endpoints. `role` is stored as
 * written; LoginPage's normalizeAdminRole lowercases it to match its Role union.
 */
const ADMINS = [
  { email: 'pm@cictrix.gov.ph',  role: 'PM',  name: 'PM Admin',  label: 'PM Admin (Performance Management)' },
  { email: 'lnd@cictrix.gov.ph', role: 'LND', name: 'L&D Admin', label: 'L&D Admin (Learning & Development)' },
];

/** Strong random password — no ambiguous characters, mixed classes. */
function generatePassword(length = 20) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*-_=+';
  const all = upper + lower + digits + symbols;
  const pick = (set) => set[crypto.randomInt(0, set.length)];
  // Guarantee one of each class, then fill and shuffle.
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

async function main() {
  const { data: existing, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) throw listErr;
  const byEmail = new Map((existing?.users ?? []).map((u) => [String(u.email).toLowerCase(), u]));

  const results = [];

  for (const admin of ADMINS) {
    const password = generatePassword();
    const found = byEmail.get(admin.email.toLowerCase());
    let userId;

    if (found) {
      const { data, error } = await supabase.auth.admin.updateUserById(found.id, {
        password,
        email_confirm: true,
        app_metadata: { role: admin.role },
      });
      if (error) { console.error(`  ! ${admin.email} update:`, error.message); continue; }
      userId = data.user.id;
      console.log(`  ~ ${admin.email} existed — password rotated`);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: admin.email,
        password,
        email_confirm: true,               // no inbox round-trip for a service account
        app_metadata: { role: admin.role },
      });
      if (error) { console.error(`  ! ${admin.email} create:`, error.message); continue; }
      userId = data.user.id;
      console.log(`  + ${admin.email} created`);
    }

    // LoginPage reads the role from user_roles after signInWithPassword, so the
    // account is unusable without this row even though auth succeeds.
    const { data: existingRole } = await supabase
      .from('user_roles').select('id').eq('user_id', userId).maybeSingle();

    const rolePayload = {
      user_id: userId,
      email: admin.email,
      role: admin.role,
      name: admin.name,
      is_active: true,
    };
    const { error: roleErr } = existingRole
      ? await supabase.from('user_roles').update(rolePayload).eq('id', existingRole.id)
      : await supabase.from('user_roles').insert(rolePayload);
    if (roleErr) { console.error(`  ! ${admin.email} user_roles:`, roleErr.message); continue; }

    results.push({ ...admin, password, userId });
  }

  console.log('\n' + '='.repeat(72));
  console.log('ADMIN CREDENTIALS — shown once, not stored in the repo. Record them now.');
  console.log('='.repeat(72));
  for (const r of results) {
    console.log(`\n  ${r.label}`);
    console.log(`    Email    : ${r.email}`);
    console.log(`    Password : ${r.password}`);
    console.log(`    Role     : ${r.role}`);
  }
  console.log('\n' + '='.repeat(72));
  console.log(`${results.length} of ${ADMINS.length} accounts ready.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
