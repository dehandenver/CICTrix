// ─────────────────────────────────────────────────────────────────────────────
// Seed: attendee ROSTERS for the 12 July-2026 LGU training courses, using
// EXISTING employees, selected by the "development-gap" model.
//
//   node scripts/seed-lnd-training-rosters-july2026.mjs
//
// For each course (tagged with one of the 12 canonical competencies), we enroll
// the employees who most NEED that competency:
//
//   pool(C)  = employees whose IPCR targets map to competency C
//              ├─ authoritative: ipcr_competency_matches (the AI matcher output)
//              └─ fallback:      a deterministic job-role→competency heuristic,
//                                used only while that table is empty/undeployed.
//   ranking  = ascending IPCR overall score (lowest performer = biggest gap),
//              computed live from success_indicator_ratings — the same Q/E/T
//              roll-up Succession Planning uses.
//   roster   = the lowest-scoring slice of pool(C) (the gap cohort).
//
// Attendance is written to match each course's lifecycle:
//   Completed → attendance marked (mostly Present, a few Absent/Excused)
//   Ongoing   → attendance partially marked (session still running)
//   Scheduled → enrolled, roster left un-finalized (still being built)
//
// Depends on scripts/seed-lnd-training-calendar-july2026.mjs having run (it finds
// the 12 courses by their Course ID marker). Deterministic + idempotent: re-running
// rebuilds the same rosters. Writes with the service role, so RLS is bypassed —
// but the browser only SEES these rosters after the anon-open migration
// (20260722_training_calendar_anon_open.sql) is applied.
// ─────────────────────────────────────────────────────────────────────────────
import { loadEnv, serviceClient, die } from './lib/ipcr-shared.mjs';

const env = loadEnv();
const db = serviceClient(env);
const nowIso = () => new Date().toISOString();

// ── Deterministic PRNG (stable rosters/attendance across runs) ───────────────
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Fallback: job-role → competency relevance (used only if the AI match table
//    is empty). Keyword tested against employees.position (lower-cased). `null`
//    means "applies to everyone" (foundational governance/ethics competencies). ──
const ROLE_KEYWORDS = {
  'Knowledge of Local Governance': null,
  'Public Administration Principles': ['admin', 'officer', 'supervis', 'head', 'manager'],
  'Community Engagement Skills': ['health', 'midwife', 'dentist', 'social', 'admin', 'security'],
  'Project Management in a Public Setting': ['project', 'manager', 'engineer', 'coordinat'],
  'Fiscal Management / Budgeting for LGU': ['account', 'budget', 'treasur', 'finance'],
  'Transparency and Accountability Practices': ['account', 'admin', 'legal', 'officer', 'budget'],
  'Disaster Risk Reduction and Management': ['engineer', 'security', 'health', 'midwife', 'guard'],
  'Digital Literacy for Government Services': ['it ', 'information technology', 'computer', 'data', 'analyst', 'admin'],
  'Ethical Conduct and Public Service Standards': null,
  'Technical Writing for Government Documents': ['admin', 'officer', 'legal', 'human resource', 'account'],
  'Data and Records Management and Organization': ['it ', 'information technology', 'computer', 'data', 'admin', 'record', 'officer'],
  'Public Communication Skills': ['admin', 'human resource', 'information', 'officer', 'supervis'],
};

const bucket = (s) => (s >= 4.75 ? 'Outstanding' : s >= 4.0 ? 'Very Satisfactory' : 'Satisfactory');

// ── IPCR overall score per employee (live, from ratings) ─────────────────────
async function loadOverallScores() {
  const { data: ts } = await db
    .from('target_settings')
    .select('id, employee_id, approved_at')
    .eq('status', 'approved').eq('phase2_status', 'completed')
    .order('approved_at', { ascending: false });
  // Latest completed record per employee.
  const latest = new Map();
  for (const t of ts ?? []) if (!latest.has(String(t.employee_id))) latest.set(String(t.employee_id), t);

  const scores = new Map(); // employee_id -> overall (number)
  for (const [empId, t] of latest) {
    const { data: mfos } = await db.from('mfos').select('id').eq('target_setting_id', t.id);
    const mfoIds = (mfos ?? []).map((m) => m.id);
    if (!mfoIds.length) continue;
    const { data: sis } = await db.from('success_indicators').select('id').in('mfo_id', mfoIds);
    const siIds = (sis ?? []).map((s) => s.id);
    if (!siIds.length) continue;
    const { data: rt } = await db.from('success_indicator_ratings')
      .select('quality, efficiency, timeliness').in('success_indicator_id', siIds);
    const vals = (rt ?? [])
      .map((r) => ((r.quality || 0) + (r.efficiency || 0) + (r.timeliness || 0)) / 3)
      .filter((v) => v > 0);
    if (!vals.length) continue;
    scores.set(empId, Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)));
  }
  return scores;
}

// ── Authoritative competency link, if the AI-match table is present + populated ─
async function loadCompetencyMatches() {
  const { data, error } = await db.from('ipcr_competency_matches').select('employee_id, competency');
  if (error || !data) return null; // table undeployed → signal fallback
  const byComp = new Map();
  for (const r of data) {
    if (!r.competency || !r.employee_id) continue;
    const set = byComp.get(r.competency) ?? new Set();
    set.add(String(r.employee_id));
    byComp.set(r.competency, set);
  }
  return byComp.size ? byComp : null;
}

async function main() {
  // 1) The 12 seeded courses, found by their Course ID marker in objectives.
  const { data: sessions, error: sErr } = await db
    .from('training_sessions')
    .select('id, title, status, capacity, objectives, source_draft_id')
    .gte('scheduled_date', new Date(Date.UTC(2026, 6, 1, 0, 0, 0)).toISOString())
    .lt('scheduled_date', new Date(Date.UTC(2026, 7, 1, 0, 0, 0)).toISOString());
  if (sErr) die('load July-2026 sessions failed', sErr);
  const courses = (sessions ?? [])
    .map((s) => {
      const objs = s.objectives ?? [];
      const compLine = objs.find((o) => o.startsWith('Competency: '));
      const idLine = objs.find((o) => o.startsWith('Course ID: '));
      if (!compLine || !idLine) return null;
      return { ...s, competency: compLine.slice('Competency: '.length).trim(),
               courseId: idLine.slice('Course ID: '.length).trim() };
    })
    .filter(Boolean);
  if (!courses.length) die('No seeded July-2026 courses found. Run seed-lnd-training-calendar-july2026.mjs first.');
  console.log(`▶ ${courses.length} seeded course(s) found.`);

  // 2) Rated employees + scores + org median.
  const scores = await loadOverallScores();
  const { data: emps } = await db.from('employees').select('id, first_name, last_name, position').eq('status', 'Active');
  const empById = new Map((emps ?? []).map((e) => [String(e.id), e]));
  const ratedIds = [...scores.keys()].filter((id) => empById.has(id));
  const sortedScores = ratedIds.map((id) => scores.get(id)).sort((a, b) => a - b);
  const median = sortedScores[Math.floor(sortedScores.length / 2)] ?? 4;
  console.log(`▶ ${ratedIds.length} rated employee(s). Org median IPCR = ${median}.`);

  // 3) Competency link source.
  const matches = await loadCompetencyMatches();
  console.log(matches
    ? '▶ Competency link: ipcr_competency_matches (AUTHORITATIVE / AI matcher).'
    : '⚠ Competency link: ipcr_competency_matches empty/undeployed → using job-role HEURISTIC fallback.\n' +
      '  Re-run after applying migration 20260721 + running the AI matcher to upgrade to authoritative.');

  const poolFor = (competency) => {
    if (matches) {
      const set = matches.get(competency) ?? new Set();
      return ratedIds.filter((id) => set.has(id));
    }
    const kws = ROLE_KEYWORDS[competency];
    if (kws === null) return [...ratedIds];               // foundational → everyone
    return ratedIds.filter((id) => {
      const pos = String(empById.get(id)?.position ?? '').toLowerCase();
      return kws.some((k) => pos.includes(k));
    });
  };

  // 4) Build + write each roster.
  const sessionIds = courses.map((c) => c.id);
  // Idempotency: clear prior rosters for these (direct, non-draft) sessions.
  const { error: delErr } = await db.from('training_enrollments').delete().in('session_id', sessionIds);
  if (delErr) die('clear prior rosters failed', delErr);

  let totalEnrolled = 0;
  const finalizeStatuses = new Set(['Completed', 'Ongoing']);
  const summary = [];

  for (const c of courses) {
    // Gap cohort: lowest scorers in the relevant pool.
    let pool = poolFor(c.competency).sort((a, b) => scores.get(a) - scores.get(b));
    // Prefer below-median (the actual gap); top up from the rest of the pool to a floor.
    const belowMedian = pool.filter((id) => scores.get(id) < median);
    const capSeats = c.capacity && c.capacity > 0 ? c.capacity : 12;
    const target = Math.min(pool.length, capSeats, Math.max(4, Math.round(pool.length * 0.6)), 12);
    let roster = (belowMedian.length >= target ? belowMedian : pool).slice(0, target);
    if (!roster.length) roster = pool.slice(0, Math.min(4, pool.length));

    const rand = mulberry32(hashString(c.id));
    const rows = roster.map((empId) => {
      let attendance = null;
      if (c.status === 'Completed') {
        const r = rand();
        attendance = r < 0.8 ? 'Present' : r < 0.92 ? 'Absent' : 'Excused';
      } else if (c.status === 'Ongoing') {
        attendance = rand() < 0.5 ? 'Present' : null; // partially marked so far
      }
      return {
        employee_id: empId,
        session_id: c.id,
        status: 'Enrolled',
        enrollment_status: 'Confirmed',
        attendance_status: attendance,
        added_by: 'seed-rosters-july2026',
        added_by_role: 'LND',
        is_active: true,
      };
    });

    if (rows.length) {
      const { error } = await db.from('training_enrollments').insert(rows);
      if (error) die(`insert roster for "${c.title}" failed`, error);
    }
    if (finalizeStatuses.has(c.status)) {
      await db.from('training_sessions').update({ roster_finalized_at: nowIso() }).eq('id', c.id);
    }
    totalEnrolled += rows.length;
    summary.push({ course: c.title, competency: c.competency, status: c.status,
                   n: rows.length, seats: c.capacity,
                   avg: rows.length ? Number((roster.reduce((a, id) => a + scores.get(id), 0) / roster.length).toFixed(2)) : null });
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log(`\n✓ Seeded ${totalEnrolled} enrollment(s) across ${courses.length} courses.\n`);
  for (const s of summary) {
    console.log(`  [${s.status.padEnd(9)}] ${String(s.n).padStart(2)}/${String(s.seats).padStart(2)} seats  avg IPCR ${s.avg ?? '—'} (${s.avg ? bucket(s.avg) : 'n/a'})  ${s.course}`);
  }
  console.log('\nRoster finalized for Completed + Ongoing courses (attendees show in the calendar detail panel).');
  console.log('Reminder: apply 20260722_training_calendar_anon_open.sql so the browser can read these rosters.\n');
}

main().catch((e) => die('seed-lnd-training-rosters-july2026 failed', e));
