/**
 * Seed 4 semesters of COMPLETE, RATED historical IPCR data.
 *
 * Why: the Summary of Ratings, competency gap analysis and training-needs
 * assessment all read `ipcr_performance` (via v_competency_gap_analysis). Only
 * ~25 employees had any history, so most of the org produced empty/low results.
 * This gives every non-department-head employee a real baseline to assess.
 *
 * What it writes — one `ipcr_performance` row per (employee, semester, function):
 *   rating_period      the semester, e.g. "Jan 1-Jun 30 2024"
 *   function_type      CORE / STRATEGIC / SUPPORT (only those applicable to the role)
 *   target_text        a specific, measurable target in the LGU IPCR style
 *   accomplishment_text the actual result against that target
 *   q/e/t/ave_rating   Quality / Efficiency / Timeliness + average (1-5)
 *   competency_id + mapped_competency_standard  one of the 12 canonical competencies
 *
 * Targets grow year over year, so history trends upward into the current cycle.
 * Ratings are realistic and varied (mostly 4-5, occasional 3) — deliberately NOT
 * maxed out, and never uniformly low, so summaries read as genuine performance.
 *
 * Department heads are EXCLUDED (they hold Office Accounts and don't file their
 * own IPCR here).
 *
 * Idempotent: skips any (employee, semester) that already has rows.
 *
 * Run:  node scripts/seed-ipcr-historical-4sem.mjs
 * Needs SUPABASE_SERVICE_ROLE_KEY in .env or backend/.env.
 */

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// ── env ──────────────────────────────────────────────────────────────────────
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

// ── the 4 historical semesters (most recent last) ────────────────────────────
const SEMESTERS = [
  { period: 'Jan 1-Jun 30 2024', year: 2024, half: 'A' },
  { period: 'Jul 1-Dec 31 2024', year: 2024, half: 'B' },
  { period: 'Jan 1-Jun 30 2025', year: 2025, half: 'A' },
  { period: 'Jul 1-Dec 31 2025', year: 2025, half: 'B' },
];

// ── competency ids (must match ipcr_performance.competency_id 1-12) ──────────
const C = {
  LOCAL_GOV: [1, 'Knowledge of Local Governance'],
  PUBLIC_ADMIN: [2, 'Public Administration Principles'],
  COMMUNITY: [3, 'Community Engagement Skills'],
  PROJECT_MGMT: [4, 'Project Management in a Public Setting'],
  FISCAL: [5, 'Fiscal Management/Budgeting for LGU'],
  TRANSPARENCY: [6, 'Transparency and Accountability Practices'],
  DRRM: [7, 'Disaster Risk Reduction and Management'],
  DIGITAL: [8, 'Digital Literacy for Government Services'],
  ETHICS: [9, 'Ethical Conduct and Public Service Standards'],
  TECH_WRITING: [10, 'Technical Writing for Government Documents'],
  RECORDS: [11, 'Data and Records Management and Organization'],
  COMMS: [12, 'Public Communication Skills'],
};

/**
 * Role-relevant functions per office. Only the functions that genuinely apply to
 * a role are included — not every employee carries all three.
 * `base` is the semester-1 quantity; it grows each semester (see growth()).
 */
const OFFICE_FUNCTIONS = {
  'Information Technology': [
    { fn: 'CORE', base: 120, comp: C.DIGITAL,
      target: (n) => `To resolve ${n} IT helpdesk and end-user support requests within 24 hours each, with minimal repeat incidents, in 6 months`,
      actual: (n, e) => `${e} support requests resolved within an average of 16 hours each, with no unresolved backlog at period end` },
    { fn: 'STRATEGIC', base: 3, comp: C.PROJECT_MGMT,
      target: (n) => `To deploy ${n} e-government service modules/system upgrades with zero unplanned downtime, in 6 months`,
      actual: (n, e) => `${e} modules deployed and turned over, all within schedule and with zero unplanned downtime` },
    { fn: 'SUPPORT', base: 24, comp: C.RECORDS,
      target: (n) => `To perform ${n} scheduled system backups and integrity checks, weekly, in 6 months`,
      actual: (n, e) => `${e} backups completed and verified with 100% data integrity; all restore tests passed` },
  ],
  'Office of The City Accountant': [
    { fn: 'CORE', base: 240, comp: C.FISCAL,
      target: (n) => `To process and verify ${n} disbursement vouchers within 3 working days each, in 6 months`,
      actual: (n, e) => `${e} vouchers processed within an average of 2 working days, with no disallowed transactions` },
    { fn: 'STRATEGIC', base: 6, comp: C.TRANSPARENCY,
      target: (n) => `To prepare and submit ${n} financial and trial balance reports on or before the prescribed deadline, in 6 months`,
      actual: (n, e) => `${e} reports submitted ahead of deadline, all accepted by COA without material findings` },
    { fn: 'SUPPORT', base: 300, comp: C.RECORDS,
      target: (n) => `To file and maintain ${n} accounting records with complete supporting documents, in 6 months`,
      actual: (n, e) => `${e} records filed and indexed with complete attachments; 100% retrievable on request` },
  ],
  'Office of The City Health Officer': [
    { fn: 'CORE', base: 60, comp: C.COMMUNITY,
      target: (n) => `To provide quality health services to ${n} clients within 15 minutes per case with minimal complaints, in 6 months`,
      actual: (n, e) => `${e} clients served within an average of 11 minutes per case, with no recorded complaints` },
    { fn: 'STRATEGIC', base: 4, comp: C.DRRM,
      target: (n) => `To conduct ${n} barangay health and disaster-preparedness orientations, in 6 months`,
      actual: (n, e) => `${e} orientations conducted across barangays with full attendance documentation` },
    { fn: 'SUPPORT', base: 200, comp: C.RECORDS,
      target: (n) => `To encode and update ${n} patient and immunization records with 100% accuracy, in 6 months`,
      actual: (n, e) => `${e} records encoded and validated; accuracy check returned no data errors` },
  ],
  Legal: [
    { fn: 'CORE', base: 40, comp: C.TECH_WRITING,
      target: (n) => `To review and draft ${n} legal opinions, contracts and ordinances within 5 working days each, in 6 months`,
      actual: (n, e) => `${e} legal documents reviewed/drafted within an average of 4 working days, all approved without major revision` },
    { fn: 'STRATEGIC', base: 8, comp: C.PUBLIC_ADMIN,
      target: (n) => `To represent the LGU in ${n} hearings/administrative cases with complete documentation, in 6 months`,
      actual: (n, e) => `${e} hearings attended with complete records; no case dismissed due to documentary lapses` },
    { fn: 'SUPPORT', base: 150, comp: C.TRANSPARENCY,
      target: (n) => `To index and maintain ${n} case files and legal records for audit readiness, in 6 months`,
      actual: (n, e) => `${e} case files indexed and audit-ready; all requests for records served within the day` },
  ],
  'Office of The City Engineer': [
    { fn: 'CORE', base: 30, comp: C.PROJECT_MGMT,
      target: (n) => `To inspect and certify ${n} infrastructure projects in accordance with approved plans and specifications, in 6 months`,
      actual: (n, e) => `${e} projects inspected and certified; all conformed to specifications with no rework orders` },
    { fn: 'STRATEGIC', base: 10, comp: C.LOCAL_GOV,
      target: (n) => `To prepare ${n} programs of work and detailed cost estimates approved without major revision, in 6 months`,
      actual: (n, e) => `${e} programs of work prepared and approved; none returned for major revision` },
    { fn: 'SUPPORT', base: 90, comp: C.RECORDS,
      target: (n) => `To update and file ${n} as-built plans and project documents, in 6 months`,
      actual: (n, e) => `${e} as-built plans filed and digitized; complete and retrievable within the day` },
  ],
};

/** Administrative/clerical roles carry a lighter, records-oriented set. */
const ADMIN_FUNCTIONS = [
  { fn: 'CORE', base: 33, comp: C.RECORDS,
    target: (n) => `To sort ${n} documents, file and check the masterlist, daily, in 6 months`,
    actual: (n, e) => `${e} documents sorted, organized, filed and masterlisted with 100% accuracy` },
  { fn: 'SUPPORT', base: 250, comp: C.COMMS,
    target: (n) => `To record and answer ${n} messages, direct calls and inquiries, daily, in 6 months`,
    actual: (n, e) => `${e} messages and inquiries recorded and acted upon; all routed to the proper office same-day` },
];

const isAdminRole = (position) =>
  /aide|clerk|encoder|assistant|janitor|driver|utility|security/i.test(String(position || ''));

/** Semester-over-semester growth: each period targets ~10% more than the last. */
const growth = (base, idx) => Math.round(base * Math.pow(1.1, idx));

/** Deterministic pseudo-random in [0,1) so re-runs produce the same ratings. */
function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Realistic, varied Q/E/T. Mostly 4-5 with an occasional 3 — never uniformly
 * maxed, never uniformly low, and trending gently upward across semesters.
 */
function ratings(key, semIdx) {
  const r = seeded(key);
  const lift = semIdx * 0.15; // slight improvement over time
  const pick = (o) => {
    const v = 3 + (r * 10 + o + lift) % 2.2; // ~3.0 - 5.0
    return Math.min(5, Math.max(3, Math.round(v * 2) / 2));
  };
  const q = pick(0.9), e = pick(0.3), t = pick(0.6);
  return { q, e, t, ave: Math.round(((q + e + t) / 3) * 100) / 100 };
}

async function main() {
  // 1. Roster: active employees, minus department heads.
  const { data: emps, error: empErr } = await supabase
    .from('employees_with_department')
    .select('id, employee_id, first_name, last_name, current_position, department, status')
    .eq('status', 'Active');
  if (empErr) throw empErr;

  const { data: heads, error: headErr } = await supabase
    .from('office_role_assignments')
    .select('employee_id')
    .eq('role', 'DeptHead')
    .eq('status', 'Active');
  if (headErr) throw headErr;
  const headIds = new Set((heads ?? []).map((h) => String(h.employee_id)));

  const roster = (emps ?? []).filter((e) => e.employee_id && !headIds.has(String(e.id)));
  console.log(`Roster: ${roster.length} employees (excluded ${headIds.size} department heads)`);

  // 2. Skip (employee, semester) pairs that already have history.
  const { data: existing, error: exErr } = await supabase
    .from('ipcr_performance')
    .select('employee_num, rating_period');
  if (exErr) throw exErr;
  const already = new Set((existing ?? []).map((r) => `${r.employee_num}|${r.rating_period}`));

  // 3. ipcr_performance.id has no usable default — assign explicitly.
  const { data: maxRow } = await supabase
    .from('ipcr_performance').select('id').order('id', { ascending: false }).limit(1);
  let nextId = ((maxRow?.[0]?.id ?? 0) | 0) + 1;

  const rows = [];
  for (const emp of roster) {
    const empNum = emp.employee_id;
    const position = emp.current_position || 'Employee';
    const fns = isAdminRole(position)
      ? ADMIN_FUNCTIONS
      : (OFFICE_FUNCTIONS[emp.department] ?? ADMIN_FUNCTIONS);

    SEMESTERS.forEach((sem, semIdx) => {
      if (already.has(`${empNum}|${sem.period}`)) return;
      fns.forEach((f, fi) => {
        const target = growth(f.base, semIdx);
        const actual = target + Math.max(1, Math.round(target * 0.06)); // modest over-delivery
        const { q, e, t, ave } = ratings(`${empNum}|${sem.period}|${f.fn}`, semIdx);
        rows.push({
          id: nextId++,
          ipcr_id: `IPCR-${sem.year}-${sem.half}-${empNum}`,
          ipcr_row_id: `ROW-${String(fi + 1).padStart(4, '0')}`,
          employee_num: empNum,
          position,
          rating_period: sem.period,
          function_type: f.fn,
          target_text: `"${f.target(target)}"`,
          accomplishment_text: `"${f.actual(target, actual)}"`,
          q_rating: q, e_rating: e, t_rating: t, ave_rating: ave,
          competency_id: f.comp[0],
          mapped_competency_standard: f.comp[1],
        });
      });
    });
  }

  if (!rows.length) {
    console.log('Nothing to seed — every employee already has all 4 semesters.');
    return;
  }
  console.log(`Inserting ${rows.length} IPCR rows (${SEMESTERS.length} semesters x role-relevant functions)…`);

  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const { error } = await supabase.from('ipcr_performance').insert(batch);
    if (error) { console.error(`Batch ${i / 200 + 1} failed:`, error.message); process.exit(1); }
    console.log(`  ✓ ${Math.min(i + 200, rows.length)}/${rows.length}`);
  }

  // 4. Report
  const { data: after } = await supabase.from('ipcr_performance').select('employee_num, ave_rating');
  const distinct = new Set((after ?? []).map((r) => r.employee_num)).size;
  const avg = (after ?? []).reduce((s, r) => s + Number(r.ave_rating || 0), 0) / Math.max(1, (after ?? []).length);
  console.log(`\nDone. ipcr_performance now covers ${distinct} employees; overall average rating ${avg.toFixed(2)} / 5.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
