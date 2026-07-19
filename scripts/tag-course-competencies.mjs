// ─────────────────────────────────────────────────────────────────────────────
// One-off data fix: tag Scheduled/Ongoing training sessions with the
// "Competency: <name>" objective line the recommendation engine matches on
// (src/lib/api/trainingCalendar.ts competencyFromObjectives and the backend's
// competency_from_objectives both look for exactly this prefix).
//
//   node scripts/tag-course-competencies.mjs
//
// Verified 2026-07-19: none of the 9 scheduled August 2026 sessions carries the
// line, so generateRecommendations always maps 0 courses to competencies and
// upserts nothing. Titles are mapped to the 12 canonical competencies (see
// src/constants/positions.ts) via the keyword table below; titles that match
// nothing are REPORTED, never guessed. Idempotent: sessions that already have a
// "Competency: " objective line are skipped.
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
const TITLE_KEYWORDS = [
  ['digital literacy', 'Digital Literacy for Government Services'],
  ['disaster', 'Disaster Risk Reduction and Management'],
  ['records management', 'Data and Records Management and Organization'],
  ['fiscal', 'Fiscal Management / Budgeting for LGU'],
  ['budget', 'Fiscal Management / Budgeting for LGU'],
  ['ethic', 'Ethical Conduct and Public Service Standards'],
  ['local governance', 'Knowledge of Local Governance'],
  ['lgu operations', 'Knowledge of Local Governance'],
  ['community engagement', 'Community Engagement Skills'],
  ['public administration', 'Public Administration Principles'],
  ['project management', 'Project Management in a Public Setting'],
  ['transparency', 'Transparency and Accountability Practices'],
  ['accountability', 'Transparency and Accountability Practices'],
  ['technical writing', 'Technical Writing for Government Documents'],
  ['public communication', 'Public Communication Skills'],
];

const competencyForTitle = (title) => {
  const t = String(title ?? '').toLowerCase();
  const hit = TITLE_KEYWORDS.find(([kw]) => t.includes(kw));
  return hit ? hit[1] : null;
};

const { url, key } = loadEnv();
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: sessions, error } = await db
  .from('training_sessions')
  .select('id, title, status, scheduled_date, objectives')
  .in('status', ['Scheduled', 'Ongoing'])
  .order('scheduled_date');
if (error) {
  console.error('❌ load training_sessions failed:', error.message);
  process.exit(1);
}

let tagged = 0;
const skipped = [];
const unmatched = [];

for (const s of sessions ?? []) {
  const objectives = Array.isArray(s.objectives) ? s.objectives : [];
  if (objectives.some((o) => typeof o === 'string' && o.startsWith('Competency: '))) {
    skipped.push(s.title);
    continue;
  }
  const competency = competencyForTitle(s.title);
  if (!competency) {
    unmatched.push(s.title);
    continue;
  }
  const { error: uErr } = await db
    .from('training_sessions')
    .update({ objectives: [...objectives, `Competency: ${competency}`] })
    .eq('id', s.id);
  if (uErr) {
    console.error(`❌ update failed for "${s.title}":`, uErr.message);
    process.exit(1);
  }
  console.log(`✔ ${s.title} → Competency: ${competency}`);
  tagged += 1;
}

console.log(`\nTagged ${tagged} session(s); ${skipped.length} already tagged.`);
if (unmatched.length) {
  console.log('⚠ No competency match (left untouched — tag manually if needed):');
  for (const t of unmatched) console.log(`  - ${t}`);
}
