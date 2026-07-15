// ─────────────────────────────────────────────────────────────────────────────
// Seed: IPCR → L&D TRAINING RECOMMENDATIONS.
//
//   node scripts/seed-training-recommendations.mjs
//
// (Re)generates training_recommendations from the latest FINALIZED IPCR data,
// using the same development-gap model as the roster seeder:
//
//   pool(C)  = employees whose IPCR targets map to competency C
//              ├─ authoritative: ipcr_competency_matches (AI matcher output)
//              └─ fallback:      job-role→competency heuristic (table empty)
//   gap      = employee's latest finalized overall IPCR score <= 3.5
//   courses  = training_sessions tagged competency C, status Scheduled/Ongoing
//   upsert   = one row per (employee, session, source_cycle_id)  [idempotent]
//
// Mirrors src/lib/api/trainingRecommendations.ts so the demo data matches what
// the in-app "Regenerate" button would produce. Writes with the service role;
// the browser sees these rows via the anon-open posture in migration
// 20260724_ipcr_training_recommendations.sql (which must be applied first).
// ─────────────────────────────────────────────────────────────────────────────
import { loadEnv, serviceClient, die } from './lib/ipcr-shared.mjs';

const env = loadEnv();
const db = serviceClient(env);
const nowIso = () => new Date().toISOString();

const GAP_THRESHOLD = 4.0; // keep in sync with src/lib/api/trainingRecommendations.ts
const MAX_GAPS_PER_EMPLOYEE = 3;

const COMPETENCIES = [
  'Knowledge of Local Governance',
  'Public Administration Principles',
  'Community Engagement Skills',
  'Project Management in a Public Setting',
  'Fiscal Management / Budgeting for LGU',
  'Transparency and Accountability Practices',
  'Disaster Risk Reduction and Management',
  'Digital Literacy for Government Services',
  'Ethical Conduct and Public Service Standards',
  'Technical Writing for Government Documents',
  'Data and Records Management and Organization',
  'Public Communication Skills',
];

// Fallback job-role → competency relevance (identical to the roster seeder), used
// only when ipcr_competency_matches is empty/undeployed. null = applies to all.
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

const bucket = (s) => (s >= 4.75 ? 'Outstanding' : s >= 4.0 ? 'Very Satisfactory' : s >= 3.0 ? 'Satisfactory' : s >= 2.0 ? 'Unsatisfactory' : 'Poor');
const scoreLabel = (s) => (s == null ? '—' : `${Number(s).toFixed(s % 1 === 0 ? 0 : 1)}/5`);
const priorityFor = (s) => (s <= 2 ? 'HIGH' : s <= 3 ? 'MEDIUM' : 'LOW');

// ── Latest finalized overall score + cycle per employee (live roll-up) ───────
async function loadScores() {
  const { data: ts } = await db
    .from('target_settings')
    .select('id, employee_id, cycle_id, approved_at')
    .eq('status', 'approved').eq('phase2_status', 'completed')
    .order('approved_at', { ascending: false });
  const latest = new Map(); // employee_id -> { id, cycle_id }
  for (const t of ts ?? []) if (!latest.has(String(t.employee_id))) latest.set(String(t.employee_id), t);

  const cycleTitles = new Map();
  const cycleIds = [...new Set([...latest.values()].map((t) => t.cycle_id).filter((n) => n != null))];
  if (cycleIds.length) {
    const { data: cy } = await db.from('performance_cycles').select('id, title').in('id', cycleIds);
    for (const c of cy ?? []) cycleTitles.set(c.id, c.title);
  }

  const scores = new Map(); // employee_id -> { overall, cycleId, period }
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
    scores.set(empId, {
      overall: Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)),
      cycleId: t.cycle_id ?? null,
      period: cycleTitles.get(t.cycle_id) ?? null,
    });
  }
  return scores;
}

// ── Employee → competencies from the AI matcher (authoritative), keyed per
//    employee. Returns an empty Map when the table is empty/undeployed. ────────
async function loadMatchedCompetencies() {
  const { data, error } = await db
    .from('ipcr_competency_matches')
    .select('employee_id, competency')
    .not('employee_id', 'is', null)
    .not('competency', 'is', null);
  const byEmp = new Map();
  if (error || !data) return byEmp;
  for (const r of data) {
    const set = byEmp.get(String(r.employee_id)) ?? new Set();
    set.add(r.competency);
    byEmp.set(String(r.employee_id), set);
  }
  return byEmp;
}

function competencyOf(session) {
  if (session.competency) return session.competency;
  const line = (session.objectives ?? []).find((o) => o.startsWith('Competency: '));
  return line ? line.slice('Competency: '.length).trim() : null;
}

async function main() {
  // 1) Active competency-tagged courses, grouped by competency.
  const { data: sessions, error: sErr } = await db
    .from('training_sessions')
    .select('id, status, objectives')
    .in('status', ['Scheduled', 'Ongoing']);
  if (sErr) die('load training_sessions failed', sErr);

  const coursesByComp = new Map();
  for (const s of sessions ?? []) {
    const comp = competencyOf(s);
    if (!comp || !COMPETENCIES.includes(comp)) continue;
    const list = coursesByComp.get(comp) ?? [];
    list.push(String(s.id));
    coursesByComp.set(comp, list);
  }
  if (!coursesByComp.size) die('No competency-tagged Scheduled/Ongoing courses found. Run the calendar seeder first.');
  console.log(`▶ ${[...coursesByComp.values()].reduce((a, l) => a + l.length, 0)} course(s) across ${coursesByComp.size} competencies.`);

  // 2) Scores + competency links.
  const scores = await loadScores();
  console.log(`▶ ${scores.size} employee(s) with a finalized IPCR score.`);

  // Per employee: AI matches win where they exist; the job-role heuristic fills
  // only the employees the matcher has no rows for (matches are never overridden).
  const byEmp = await loadMatchedCompetencies();
  const matchedCount = byEmp.size;
  const { data: emps } = await db.from('employees').select('*').eq('status', 'Active');
  let heuristicCount = 0;
  for (const e of emps ?? []) {
    const id = String(e.id);
    if (byEmp.has(id)) continue; // matcher already covers this employee
    const pos = String(e.position ?? e.current_position ?? '').toLowerCase();
    const set = new Set();
    for (const comp of COMPETENCIES) {
      const kws = ROLE_KEYWORDS[comp];
      if (kws === null || kws.some((k) => pos.includes(k))) set.add(comp);
    }
    if (set.size) { byEmp.set(id, set); heuristicCount++; }
  }
  console.log(matchedCount
    ? `▶ Competency link: ${matchedCount} employee(s) from ipcr_competency_matches (AUTHORITATIVE), ${heuristicCount} from job-role heuristic.`
    : `⚠ ipcr_competency_matches empty → ${heuristicCount} employee(s) via job-role HEURISTIC fallback.`);

  // 3) Build gap rows.
  const now = nowIso();
  const rows = [];
  let considered = 0;
  for (const [empId, score] of scores) {
    if (score.overall > GAP_THRESHOLD) continue;
    const comps = [...(byEmp.get(empId) ?? [])].filter((c) => coursesByComp.has(c)).sort().slice(0, MAX_GAPS_PER_EMPLOYEE);
    if (!comps.length) continue;
    considered += 1;
    const priority = priorityFor(score.overall);
    for (const comp of comps) {
      const detail = `Latest IPCR overall ${scoreLabel(score.overall)} (${bucket(score.overall)}${score.period ? `, ${score.period}` : ''}); IPCR targets map to ${comp}, a development area.`;
      for (const sessionId of coursesByComp.get(comp)) {
        rows.push({
          employee_id: empId, session_id: sessionId, competency: comp,
          source_cycle_id: score.cycleId, trigger_score: score.overall,
          gap_type: 'LOW_SCORE', gap_detail: detail, priority,
          generated_at: now, updated_at: now,
        });
      }
    }
  }

  if (!rows.length) {
    console.log('\n✓ No development gaps to recommend (all finalized employees above threshold or unmatched).');
    return;
  }

  // 4) Upsert (idempotent; preserves ENROLLED/DISMISSED decisions by omitting status).
  const { error } = await db
    .from('training_recommendations')
    .upsert(rows, { onConflict: 'employee_id,session_id,source_cycle_id', ignoreDuplicates: false });
  if (error) die('upsert training_recommendations failed', error);

  const byPriority = rows.reduce((a, r) => ((a[r.priority] = (a[r.priority] ?? 0) + 1), a), {});
  console.log(`\n✓ Upserted ${rows.length} recommendation(s) for ${considered} employee(s) with development gaps.`);
  console.log(`  Priority: HIGH ${byPriority.HIGH ?? 0} · MEDIUM ${byPriority.MEDIUM ?? 0} · LOW ${byPriority.LOW ?? 0}`);
  console.log('  View in the app: L&D → Training Calendar → open a course → Recommended Employees.\n');
}

main().catch((e) => die('seed-training-recommendations failed', e));
