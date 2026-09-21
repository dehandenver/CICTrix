/**
 * Apply a .sql file to a Supabase Postgres database over a direct connection.
 *
 * Why this exists: DDL — GRANT, CREATE POLICY, CREATE TABLE, ALTER — cannot go
 * through PostgREST, which only speaks table reads and writes. Until now every
 * migration in this repo had to be pasted into the dashboard SQL Editor by hand,
 * against whichever project the dashboard happened to have open. That is exactly
 * how the HR demo came up missing grants that production has: the schema was
 * applied, the grants were not, and nothing failed loudly enough to notice.
 *
 * Usage:
 *   npm install pg          # not yet in package.json — see note below
 *   node scripts/apply-sql.mjs --target-env .env.demo supabase/migrations/foo.sql
 *
 * NOTE: `pg` is intentionally not added to package.json in this commit, because
 * package.json had unrelated uncommitted work in it at the time. Add it as a
 * devDependency alongside that work: `npm install --save-dev pg`.
 *
 * Needs DATABASE_URL in the target env file (Supabase → Project Settings →
 * Database → Connection string → URI).
 *
 * Runs the whole file in one transaction: a failure part-way leaves the database
 * untouched rather than half-migrated.
 *
 * Refuses to touch production unless --allow-prod is passed explicitly, because
 * the default target of every other script in this repo is production and that
 * default has already caused one near-miss.
 */

import fs from 'node:fs';
import pg from 'pg';

const PROD_REF = 'fyzdfgxaaowjzbjpwrii';

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

const argv = process.argv.slice(2);
const flagIdx = argv.indexOf('--target-env');
const envFile = flagIdx > -1 ? argv[flagIdx + 1] : '.env';
const allowProd = argv.includes('--allow-prod');
const sqlFile = argv.find((a, i) =>
  a.endsWith('.sql') && argv[i - 1] !== '--target-env');

if (!sqlFile) {
  console.error('Usage: node scripts/apply-sql.mjs [--target-env <file>] <file.sql>');
  process.exit(1);
}
if (!fs.existsSync(sqlFile)) {
  console.error(`SQL file not found: ${sqlFile}`);
  process.exit(1);
}

const env = loadEnv(envFile);
const url = env.DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error(`Missing DATABASE_URL in ${envFile}.`);
  console.error('Supabase → Project Settings → Database → Connection string → URI');
  process.exit(1);
}

const host = (() => {
  try { return new URL(url).host; } catch { return '<unparseable>'; }
})();

// Match the ref anywhere in the URL, not just the host. A direct connection puts
// the ref in the host (db.<ref>.supabase.co), but a pooler URI puts it in the
// USERNAME instead (postgres.<ref>@aws-0-<region>.pooler.supabase.com) and
// shares one host across every project in a region. Checking only the host would
// wave a production pooler string straight through.
if (url.includes(PROD_REF) && !allowProd) {
  console.error(`REFUSING: this connection string targets the production project (${PROD_REF}).`);
  console.error(`  host: ${host}`);
  console.error('Pass --allow-prod if that is genuinely intended.');
  process.exit(1);
}

const sql = fs.readFileSync(sqlFile, 'utf8');

console.log(`Target host : ${host}`);
console.log(`Env source  : ${envFile}`);
console.log(`SQL file    : ${sqlFile} (${sql.split('\n').length} lines)\n`);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const who = await client.query('select current_database() db, current_user usr, version() v');
  console.log(`Connected   : ${who.rows[0].db} as ${who.rows[0].usr}`);
  console.log(`Server      : ${who.rows[0].v.split(' ').slice(0, 2).join(' ')}\n`);

  await client.query('begin');
  await client.query(sql);
  await client.query('commit');
  console.log('✓ Applied and committed.');
} catch (err) {
  try { await client.query('rollback'); } catch { /* connection may already be gone */ }
  console.error(`\n✗ Failed — rolled back, database unchanged.`);
  console.error(`  ${err.code ? err.code + ': ' : ''}${err.message}`);
  if (err.hint) console.error(`  hint: ${err.hint}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
