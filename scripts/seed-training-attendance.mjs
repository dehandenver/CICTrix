/**
 * Fill attendance for training days that have already happened.
 *
 * Attendance is taken during the training, so a day in the past should already
 * be marked and a day that has not started should not be. This seeds AM and PM
 * records for every training day strictly BEFORE the cutoff (today by default)
 * and leaves everything from the cutoff onward untouched, so the grid shows the
 * genuine "recorded so far / still to come" split rather than a wall of marks.
 *
 * A training that straddles the cutoff is handled per day, not per training:
 * its earlier days get marked and its later days stay blank.
 *
 * The generated pattern is deliberately not all-Present — roughly 88% Present,
 * with occasional Absent and Excused (excused always carrying a note, which the
 * DB requires). Half-days differ from each other, which is the whole point of
 * recording AM and PM separately: someone can attend the morning and miss the
 * afternoon.
 *
 * Deterministic: the same enrollment/day/session always yields the same status,
 * so re-running does not reshuffle history.
 *
 * Idempotent: existing (enrollment, day, session) rows are left alone.
 *
 * Run:  node scripts/seed-training-attendance.mjs [--cutoff YYYY-MM-DD]
 * Needs SUPABASE_SERVICE_ROLE_KEY in .env or backend/.env, and migration
 * 20260807_training_attendance_am_pm.sql applied.
 */

import fs from 'node:fs';
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

const cutoffArg = process.argv.indexOf('--cutoff');
const CUTOFF = cutoffArg > -1 ? process.argv[cutoffArg + 1] : new Date().toISOString().slice(0, 10);

const EXCUSE_NOTES = [
  'Official business — attended LGU coordination meeting.',
  'Medical appointment, cleared with the office head.',
  'Emergency leave approved by the department head.',
  'Assigned to field work during this session.',
  'Attended a mandatory city hall briefing.',
];

/** Stable 0..1 hash — same inputs always produce the same status. */
function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

const dayKeyOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Local calendar days the training spans, inclusive. */
function trainingDays(start, end) {
  const s = new Date(start);
  const e = end ? new Date(end) : s;
  const cursor = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const last = new Date(e.getFullYear(), e.getMonth(), e.getDate());
  const out = [];
  while (cursor <= last && out.length < 366) {
    out.push(dayKeyOf(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

async function pageAll(table, select, apply) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(select).range(from, from + 999);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

async function main() {
  // Fail loudly if the AM/PM migration has not been applied, rather than
  // writing a half-correct dataset.
  const probe = await supabase.from('training_attendance_days').select('session').limit(1);
  if (probe.error) {
    console.error('Cannot see training_attendance_days.session — apply');
    console.error('supabase/migrations/20260807_training_attendance_am_pm.sql first.');
    console.error(`(${probe.error.message})`);
    process.exit(1);
  }

  console.log(`Cutoff: ${CUTOFF} — days before this are marked, days from it onward are left blank.\n`);

  const sessions = await pageAll('training_sessions', 'id, title, scheduled_date, end_date');
  const enrollments = await pageAll('training_enrollments', 'id, session_id, employee_id, is_active');
  const bySession = new Map();
  for (const e of enrollments) {
    if (e.is_active === false) continue;
    if (!bySession.has(e.session_id)) bySession.set(e.session_id, []);
    bySession.get(e.session_id).push(e);
  }

  const existing = await pageAll('training_attendance_days', 'enrollment_id, day_date, session');
  const have = new Set(existing.map((r) => `${r.enrollment_id}|${String(r.day_date)}|${r.session}`));

  const rows = [];
  let markedTrainings = 0, skippedFuture = 0, partial = 0;

  for (const s of sessions) {
    if (!s.scheduled_date) continue;
    const roster = bySession.get(s.id) ?? [];
    if (!roster.length) continue;

    const days = trainingDays(s.scheduled_date, s.end_date);
    const pastDays = days.filter((d) => d < CUTOFF);
    if (!pastDays.length) { skippedFuture++; continue; }
    if (pastDays.length < days.length) partial++;
    markedTrainings++;

    for (const enr of roster) {
      for (const day of pastDays) {
        for (const half of ['AM', 'PM']) {
          const key = `${enr.id}|${day}|${half}`;
          if (have.has(key)) continue;
          const r = seeded(key);
          // ~88% Present, ~7% Absent, ~5% Excused.
          const status = r < 0.88 ? 'Present' : r < 0.95 ? 'Absent' : 'Excused';
          rows.push({
            enrollment_id: enr.id,
            day_date: day,
            session: half,
            status,
            excuse_note: status === 'Excused'
              ? EXCUSE_NOTES[Math.floor(seeded(key + 'note') * EXCUSE_NOTES.length)]
              : null,
            updated_by: 'LND Admin',
          });
          have.add(key);
        }
      }
    }
  }

  if (!rows.length) {
    console.log('Nothing to fill — every past half-day is already marked.');
    return;
  }

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('training_attendance_days').insert(rows.slice(i, i + 500));
    if (error) { console.error('Batch failed:', error.message); process.exit(1); }
    console.log(`  ✓ ${Math.min(i + 500, rows.length)}/${rows.length}`);
  }

  const counts = rows.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});
  console.log(`\nDone. ${rows.length} half-day records across ${markedTrainings} trainings.`);
  console.log(`  ${JSON.stringify(counts)}`);
  console.log(`  ${skippedFuture} training(s) left entirely unmarked (start on/after the cutoff).`);
  if (partial) console.log(`  ${partial} training(s) straddle the cutoff — earlier days marked, later days blank.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
