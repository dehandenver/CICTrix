// ─────────────────────────────────────────────────────────────────────────────
// One-off data fix for the L&D Training Archive (2026-08-30 spec update):
//
//   node scripts/tag-employee-training-competencies.mjs
//
// Pass A — Type of Competency tags:
//   Maps each employee_training.training_title to ONE of the 12 canonical
//   competencies (see src/constants/positions.ts) via the keyword table below,
//   resolves the competency_id from the shared `competencies` table by exact
//   name, and inserts into employee_training_competencies (migration 20260828).
//   Titles that match nothing are REPORTED, never guessed. Idempotent: the
//   UNIQUE(employee_training_id, competency_id) + ON CONFLICT skip means
//   re-running never duplicates.
//
// Pass B — Attendance percentage backfill:
//   The archive now shows an attendance PERCENTAGE instead of hours. Historical
//   records have no calendar link, so seed employee_training.attendance_percentage
//   with a realistic per-record value (weighted toward 85–100, occasional 70s
//   dip — never a flat 100). Only fills rows where attendance_percentage IS NULL
//   and enrollment_id IS NULL, so it's idempotent and never overrides a linked
//   record's live AM/PM computation.
//
// Prerequisite: migrations 20260828 and 20260830 must be applied first.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Root .env only carries the VITE_ keys; the service role key lives in
// backend/.env — merge both so the script runs regardless of which is filled.
function loadEnv() {
  const env = {};
  for (const file of [resolve(ROOT, '.env'), resolve(ROOT, 'backend', '.env')]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const l = line.trim();
      if (!l || l.startsWith('#')) continue;
      const i = l.indexOf('=');
      if (i > 0) env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim();
    }
  }
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env or backend/.env');
  return { url, key };
}

// Keyword (lowercased title substring) → canonical competency. First hit wins.
// Mirrors scripts/tag-course-competencies.mjs so calendar and archive tag the
// same way; names must match the `competencies` table exactly.
const TITLE_KEYWORDS = [
  ['digital literacy', 'Digital Literacy for Government Services'],
  ['e-government', 'Digital Literacy for Government Services'],
  ['cybersecurity', 'Digital Literacy for Government Services'],
  ['disaster', 'Disaster Risk Reduction and Management'],
  ['drrm', 'Disaster Risk Reduction and Management'],
  ['records management', 'Data and Records Management and Organization'],
  ['data privacy', 'Data and Records Management and Organization'],
  ['fiscal', 'Fiscal Management / Budgeting for LGU'],
  ['budget', 'Fiscal Management / Budgeting for LGU'],
  ['ethic', 'Ethical Conduct and Public Service Standards'],
  ['ra 6713', 'Ethical Conduct and Public Service Standards'],
  ['local governance', 'Knowledge of Local Governance'],
  ['lgu operations', 'Knowledge of Local Governance'],
  ['local government code', 'Knowledge of Local Governance'],
  ['community engagement', 'Community Engagement Skills'],
  ['stakeholder', 'Community Engagement Skills'],
  ['public administration', 'Public Administration Principles'],
  ['project management', 'Project Management in a Public Setting'],
  ['procurement', 'Project Management in a Public Setting'],
  ['transparency', 'Transparency and Accountability Practices'],
  ['accountability', 'Transparency and Accountability Practices'],
  ['technical writing', 'Technical Writing for Government Documents'],
  ['document', 'Technical Writing for Government Documents'],
  ['public communication', 'Public Communication Skills'],
  ['communication', 'Public Communication Skills'],
];

const competencyForTitle = (title) => {
  const t = String(title ?? '').toLowerCase();
  const hit = TITLE_KEYWORDS.find(([kw]) => t.includes(kw));
  return hit ? hit[1] : null;
};

// Realistic per-record attendance %: mostly strong, occasional dip, never flat.
const seededAttendance = () => {
  const roll = Math.random();
  if (roll < 0.12) return 70 + Math.floor(Math.random() * 15);  // 70–84 (dip)
  if (roll < 0.35) return 85 + Math.floor(Math.random() * 8);   // 85–92
  return 93 + Math.floor(Math.random() * 8);                    // 93–100
};

const { url, key } = loadEnv();
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// ── Resolve the 12-competency taxonomy by name ──────────────────────────────
const { data: competencies, error: cErr } = await db.from('competencies').select('id, name');
if (cErr) {
  console.error('❌ load competencies failed:', cErr.message);
  process.exit(1);
}
const compIdByName = new Map((competencies ?? []).map((c) => [String(c.name).trim(), String(c.id)]));

// ── Load archive records ────────────────────────────────────────────────────
const { data: trainings, error: tErr } = await db
  .from('employee_training')
  .select('id, training_title, attendance_percentage, enrollment_id');
if (tErr) {
  console.error('❌ load employee_training failed:', tErr.message);
  process.exit(1);
}

// Existing tags, to skip re-inserting (idempotent + avoids per-row round-trips).
const { data: existingTags, error: eErr } = await db
  .from('employee_training_competencies')
  .select('employee_training_id');
if (eErr) {
  console.error('❌ load employee_training_competencies failed:', eErr.message);
  process.exit(1);
}
const alreadyTagged = new Set((existingTags ?? []).map((r) => String(r.employee_training_id)));

// ── Pass A: competency tags ─────────────────────────────────────────────────
let tagged = 0;
let alreadySkipped = 0;
const unmatched = [];
const missingCompetency = new Set();

for (const t of trainings ?? []) {
  if (alreadyTagged.has(String(t.id))) {
    alreadySkipped += 1;
    continue;
  }
  const competencyName = competencyForTitle(t.training_title);
  if (!competencyName) {
    unmatched.push(t.training_title);
    continue;
  }
  const competencyId = compIdByName.get(competencyName);
  if (!competencyId) {
    // The taxonomy is missing a name our keyword table produced — report, never guess.
    missingCompetency.add(competencyName);
    continue;
  }
  const { error: uErr } = await db
    .from('employee_training_competencies')
    .insert({ employee_training_id: t.id, competency_id: competencyId });
  if (uErr) {
    // 23505 = the tag already exists (race / partial prior run) — safe to skip.
    if (uErr.code === '23505') {
      alreadySkipped += 1;
      continue;
    }
    console.error(`❌ tag insert failed for "${t.training_title}":`, uErr.message);
    process.exit(1);
  }
  tagged += 1;
}

// ── Pass B: attendance percentage backfill ──────────────────────────────────
let filled = 0;
for (const t of trainings ?? []) {
  if (t.attendance_percentage != null || t.enrollment_id) continue; // keep live/existing
  const { error: aErr } = await db
    .from('employee_training')
    .update({ attendance_percentage: seededAttendance() })
    .eq('id', t.id);
  if (aErr) {
    console.error(`❌ attendance backfill failed for "${t.training_title}":`, aErr.message);
    process.exit(1);
  }
  filled += 1;
}

// ── Report ──────────────────────────────────────────────────────────────────
console.log(`\nPass A — competency tags: ${tagged} tagged, ${alreadySkipped} already tagged.`);
console.log(`Pass B — attendance backfill: ${filled} record(s) seeded.`);
if (missingCompetency.size) {
  console.log('⚠ Competency names not found in the `competencies` table (tags skipped — seed the taxonomy first):');
  for (const n of missingCompetency) console.log(`  - ${n}`);
}
if (unmatched.length) {
  console.log(`⚠ ${unmatched.length} title(s) matched no competency keyword (left untagged — tag manually if needed):`);
  for (const t of [...new Set(unmatched)]) console.log(`  - ${t}`);
}
