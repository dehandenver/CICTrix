/**
 * Apply supabase/migrations/*.sql to a database, in filename order, each in its
 * own transaction, recording what has already been applied.
 *
 * Why this exists: migrations in this project have been pasted into the
 * dashboard SQL Editor by hand, against whichever project was open, with
 * nothing recording what ran where. That is how the HR demo ended up with a
 * schema that matches neither production nor supabase/full_schema.sql, and why
 * full_schema.sql — which is written for a fresh project — cannot reconcile it.
 *
 * Each migration runs in its own transaction, so one failure does not roll back
 * the ones that already succeeded, and the run continues by default rather than
 * stopping at the first divergence. That matters when repairing a drifted
 * project: the useful output is the full list of what fails, not just the first.
 *
 * Applied migrations are recorded in public.schema_migrations along with a
 * checksum, so a second run skips them and an edited migration is reported
 * rather than silently re-run.
 *
 * Usage:
 *   node scripts/apply-migrations.mjs --target-env .env.demo [--dry-run]
 *                                     [--stop-on-error] [--retry-failed]
 *
 * Needs DATABASE_URL in the target env file. Refuses production unless
 * --allow-prod is passed.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const PROD_REF = 'fyzdfgxaaowjzbjpwrii';
const MIGRATIONS_DIR = 'supabase/migrations';

function loadEnv(p) {
  if (!fs.existsSync(p)) return {};
  return fs.readFileSync(p, 'utf8').split('\n').reduce((acc, line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return acc;
    const i = t.indexOf('=');
    if (i < 0) return acc;
    acc[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    return acc;
  }, {});
}

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const valueOf = (name) => {
  const i = argv.indexOf(name);
  return i > -1 ? argv[i + 1] : undefined;
};

const envFile = valueOf('--target-env') ?? '.env';
const dryRun = flag('--dry-run');
const stopOnError = flag('--stop-on-error');
const retryFailed = flag('--retry-failed');
const allowProd = flag('--allow-prod');

const env = loadEnv(envFile);
const url = env.DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error(`Missing DATABASE_URL in ${envFile}.`);
  process.exit(1);
}
if (/\[[^\]]*\]/.test(url)) {
  console.error('DATABASE_URL still contains a placeholder — it was pasted unedited.');
  process.exit(1);
}
if (url.includes(PROD_REF) && !allowProd) {
  console.error(`REFUSING: this connection string targets production (${PROD_REF}).`);
  process.exit(1);
}

const host = (() => { try { return new URL(url).host; } catch { return '<unparseable>'; } })();

const files = fs.readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

/**
 * Migrations in this repo were written to build a database from nothing, not to
 * be replayed onto a live one. 20260510_create_employees_table.sql opens with
 * `DROP TABLE IF EXISTS employees CASCADE`, so replaying the set against an
 * existing project destroys the employees table and everything depending on it.
 * That has already happened once, on the HR demo.
 *
 * So destructive statements are refused by default. --allow-destructive is the
 * deliberate opt-in for the one case where it is correct: an empty database
 * being built from scratch.
 */
const DESTRUCTIVE = /^\s*(drop\s+(table|schema|database|view|materialized\s+view)|truncate)\b/im;

const destructive = files
  .map((f) => ({ file: f, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8') }))
  .filter(({ sql }) => DESTRUCTIVE.test(sql))
  .map(({ file }) => file);

if (destructive.length && !flag('--allow-destructive')) {
  console.error(`REFUSING: ${destructive.length} migration(s) contain DROP or TRUNCATE:\n`);
  for (const f of destructive) console.error(`  ${f}`);
  console.error(`
Replaying these onto a database that already has data will destroy it. They are
safe only against an empty database being built from scratch.

Pass --allow-destructive if that is genuinely what this is, or --dry-run to see
what would run without touching anything.`);
  process.exit(1);
}

console.log(`Target host : ${host}`);
console.log(`Env source  : ${envFile}`);
console.log(`Migrations  : ${files.length} in ${MIGRATIONS_DIR}`);
if (dryRun) console.log(`Mode        : DRY RUN — nothing will be written`);
console.log('');

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

await client.query(`
  create table if not exists public.schema_migrations (
    filename   text primary key,
    checksum   text        not null,
    status     text        not null,
    error      text,
    applied_at timestamptz not null default now()
  )
`);

const prior = new Map(
  (await client.query('select filename, checksum, status from public.schema_migrations')).rows
    .map((r) => [r.filename, r]),
);

const results = { applied: [], skipped: [], failed: [], changed: [] };

for (const file of files) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  const checksum = crypto.createHash('sha256').update(sql).digest('hex').slice(0, 16);
  const was = prior.get(file);

  if (was && was.status === 'applied') {
    if (was.checksum !== checksum) {
      results.changed.push(file);
      console.log(`~ CHANGED SINCE APPLIED  ${file}`);
    } else {
      results.skipped.push(file);
    }
    continue;
  }
  if (was && was.status === 'failed' && !retryFailed) {
    results.skipped.push(file);
    continue;
  }
  if (dryRun) {
    console.log(`  would apply            ${file}`);
    results.applied.push(file);
    continue;
  }

  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
    await client.query(
      `insert into public.schema_migrations (filename, checksum, status, error)
       values ($1, $2, 'applied', null)
       on conflict (filename) do update
         set checksum = excluded.checksum, status = 'applied',
             error = null, applied_at = now()`,
      [file, checksum],
    );
    results.applied.push(file);
    console.log(`✓ ${file}`);
  } catch (err) {
    try { await client.query('rollback'); } catch { /* already gone */ }
    const msg = `${err.code ?? ''} ${err.message}`.trim();
    results.failed.push({ file, msg });
    console.log(`✗ ${file}\n    ${msg}`);
    await client.query(
      `insert into public.schema_migrations (filename, checksum, status, error)
       values ($1, $2, 'failed', $3)
       on conflict (filename) do update
         set checksum = excluded.checksum, status = 'failed',
             error = excluded.error, applied_at = now()`,
      [file, checksum, msg],
    );
    if (stopOnError) break;
  }
}

await client.end();

console.log(`\n──────── summary ────────`);
console.log(`  applied : ${results.applied.length}`);
console.log(`  skipped : ${results.skipped.length} (already applied)`);
console.log(`  changed : ${results.changed.length} (edited since they were applied)`);
console.log(`  failed  : ${results.failed.length}`);
if (results.failed.length) {
  console.log(`\nfailures:`);
  for (const f of results.failed) console.log(`  ${f.file}\n    ${f.msg}`);
  process.exitCode = 1;
}
