// ─────────────────────────────────────────────────────────────────────────────
// Generate a synthetic, GLOBAL-CYCLE IPCR dataset for an LGU and write it to a
// multi-sheet Excel workbook. Standalone (invented employees) — for design,
// demo, and validation of the cycle-based timeline. Reference date: 2026-07-15.
//
//   node scripts/generate-ipcr-synthetic-dataset.mjs
//   → data/ipcr_synthetic_dataset.xlsx  (sheets: RatingPeriods, Employees,
//     IPCR_Records, Flags_Summary, Business_Rules)
//
// The timeline is ONE org-wide config (RATING_PERIODS). Every IPCR record
// references a cycle_id and inherits open/closed eligibility from that config —
// no per-employee open/closed state is hardcoded.
// ─────────────────────────────────────────────────────────────────────────────
import * as XLSX from 'xlsx';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TODAY = '2026-07-15';

// ── Deterministic PRNG so the dataset is reproducible ────────────────────────
function hash(s) { let h = 2166136261; for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = hash(seed) >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp15 = (v) => Math.max(1, Math.min(5, Math.round(v)));

// ── The 12 canonical LGU competencies ────────────────────────────────────────
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
// Leadership-adjacent competencies used by the succession rule.
const LEADERSHIP_ADJACENT = [
  'Project Management in a Public Setting',
  'Ethical Conduct and Public Service Standards',
  'Public Communication Skills',
];

// ── CSC-style adjectival bands on a 1–5 scale ─────────────────────────────────
function adjectival(score) {
  if (score == null) return null;
  if (score >= 4.5) return 'Outstanding';
  if (score >= 3.5) return 'Very Satisfactory';
  if (score >= 2.5) return 'Satisfactory';
  if (score >= 1.5) return 'Unsatisfactory';
  return 'Poor';
}

// ── Global cycle timeline (§2) ────────────────────────────────────────────────
// phase: TARGET_SETTING | RATING | CLOSED. window = when that phase's action is
// permitted. The 3 CLOSED cycles are the "historical" set used for flags.
const RATING_PERIODS = [
  { cycle_id: 'H2-2024', period_start: '2024-07-01', period_end: '2024-12-31', phase: 'CLOSED',         window_start: '2024-12-16', window_end: '2025-01-15' },
  { cycle_id: 'H1-2025', period_start: '2025-01-01', period_end: '2025-06-30', phase: 'CLOSED',         window_start: '2025-06-16', window_end: '2025-07-15' },
  { cycle_id: 'H2-2025', period_start: '2025-07-01', period_end: '2025-12-31', phase: 'CLOSED',         window_start: '2025-12-16', window_end: '2026-01-15' },
  { cycle_id: 'H1-2026', period_start: '2026-01-01', period_end: '2026-06-30', phase: 'RATING',         window_start: '2026-06-25', window_end: '2026-07-20' },
  { cycle_id: 'H2-2026', period_start: '2026-07-01', period_end: '2026-12-31', phase: 'TARGET_SETTING', window_start: '2026-07-01', window_end: '2026-08-15' },
];
const CYCLE = Object.fromEntries(RATING_PERIODS.map((c) => [c.cycle_id, c]));
const HISTORICAL = ['H2-2024', 'H1-2025', 'H2-2025'];
const withinWindow = (c) => TODAY >= c.window_start && TODAY <= c.window_end;

// ── Employee population (§1) ──────────────────────────────────────────────────
// archetype: normal | high | declining | onleave | overdue | newhire
const DEPT_SUP = {
  "Office of the City Mayor": 'Atty. Gerardo M. Villanueva',
  "City Human Resource Management Office": 'Ms. Corazon L. Bautista',
  "City Accounting Office": 'Mr. Alfonso R. Delos Reyes',
  "City Budget Office": 'Ms. Teresita V. Mangahas',
  "City Planning and Development Office": 'Arch. Benigno S. Cordero',
  "City Engineering Office": 'Engr. Rodolfo P. Macaraig',
  "City DRRM Office": 'Mr. Danilo T. Espinosa',
  "Information & Communications Technology Office": 'Engr. Marissa D. Yulo',
  "City Health Office": 'Dr. Lourdes A. Sarmiento',
  "General Services & Records Office": 'Mr. Federico G. Ilagan',
};

const EMPLOYEES = [
  // 2 HIGH performers (succession) — leadership-adjacent strength, all-Outstanding history.
  { id: 'EMP-0001', name: 'Isabela R. Montenegro', position: 'City Government Department Head I', dept: 'City Planning and Development Office', hired: '2011-08-01', status: 'Regular', archetype: 'high' },
  { id: 'EMP-0002', name: 'Rafael D. Concepcion',  position: 'Project Development Officer IV',   dept: 'Office of the City Mayor',            hired: '2013-02-16', status: 'Regular', archetype: 'high' },
  // 1 DECLINING (training needs)
  { id: 'EMP-0003', name: 'Nestor A. Palomares',   position: 'Administrative Officer III',       dept: 'General Services & Records Office',    hired: '2015-06-01', status: 'Regular', archetype: 'declining' },
  // 1 ON LEAVE during H1-2026 (record exists, deferred/not rated)
  { id: 'EMP-0004', name: 'Marilou C. Fabregas',   position: 'Administrative Officer II',        dept: 'City Human Resource Management Office',hired: '2016-03-15', status: 'Regular', archetype: 'onleave' },
  // 1 OVERDUE target-setting for H2-2026
  { id: 'EMP-0005', name: 'Joselito B. Ranada',    position: 'Administrative Aide VI',           dept: 'City Engineering Office',             hired: '2014-09-01', status: 'Regular', archetype: 'overdue' },
  // 11 plain regulars (full history)
  { id: 'EMP-0006', name: 'Aurora M. Villaflor',   position: 'Accountant II',                    dept: 'City Accounting Office',              hired: '2012-11-05', status: 'Regular', archetype: 'normal' },
  { id: 'EMP-0007', name: 'Enrico T. Salcedo',     position: 'Budget Officer II',                dept: 'City Budget Office',                  hired: '2013-07-01', status: 'Regular', archetype: 'normal' },
  { id: 'EMP-0008', name: 'Cristina P. Alvarado',  position: 'Information Technology Officer I',  dept: 'Information & Communications Technology Office', hired: '2017-01-16', status: 'Regular', archetype: 'normal' },
  { id: 'EMP-0009', name: 'Dominador L. Reyes',    position: 'Engineer II',                      dept: 'City Engineering Office',             hired: '2010-05-03', status: 'Regular', archetype: 'normal' },
  { id: 'EMP-0010', name: 'Perlita G. Ocampo',     position: 'Nurse II',                         dept: 'City Health Office',                  hired: '2015-02-02', status: 'Regular', archetype: 'normal' },
  { id: 'EMP-0011', name: 'Ferdinand S. Buenaflor',position: 'Planning Officer II',              dept: 'City Planning and Development Office', hired: '2016-08-16', status: 'Regular', archetype: 'normal' },
  { id: 'EMP-0012', name: 'Lorna V. Maglaya',      position: 'Administrative Officer IV',        dept: 'City Human Resource Management Office',hired: '2009-10-01', status: 'Regular', archetype: 'normal' },
  { id: 'EMP-0013', name: 'Reynaldo C. Batongbakal',position:'Disaster Risk Reduction Officer II',dept: 'City DRRM Office',                    hired: '2018-04-02', status: 'Regular', archetype: 'normal' },
  { id: 'EMP-0014', name: 'Editha M. Sarreal',     position: 'Records Officer II',               dept: 'General Services & Records Office',    hired: '2012-01-09', status: 'Regular', archetype: 'normal' },
  { id: 'EMP-0015', name: 'Gregorio A. Panganiban',position: 'Administrative Officer I',         dept: 'City Accounting Office',              hired: '2019-06-17', status: 'Regular', archetype: 'normal' },
  { id: 'EMP-0016', name: 'Vilma R. Dizon',        position: 'Community Affairs Officer II',      dept: 'Office of the City Mayor',            hired: '2014-03-03', status: 'Regular', archetype: 'normal' },
  // 2 NEW HIRES (Mar–May 2026) — only H1-2026 (prorated) + H2-2026
  { id: 'EMP-0017', name: 'Kim Andrei L. Fuentes', position: 'Administrative Aide IV',           dept: 'Information & Communications Technology Office', hired: '2026-03-16', status: 'Contractual', archetype: 'newhire' },
  { id: 'EMP-0018', name: 'Shaira Mae T. Bacani',  position: 'Administrative Aide IV',           dept: 'City Health Office',                  hired: '2026-05-04', status: 'Contractual', archetype: 'newhire' },
];

// ── Sample KRAs / targets per department (3–5 each) ──────────────────────────
const KRA_LIBRARY = {
  "City Accounting Office": [
    'Process disbursement vouchers within 3 working days with zero computation errors',
    'Reconcile monthly financial reports against the general ledger by the 5th working day',
    'Submit complete supporting documents to COA within 2 working days of request',
    'Prepare quarterly financial statements with 100% accuracy',
  ],
  "City Budget Office": [
    'Prepare and submit the annual budget proposal on or before the LGU deadline',
    'Monitor budget utilization and issue quarterly obligation reports with 100% accuracy',
    'Review and act on budget realignment requests within 5 working days',
  ],
  "Information & Communications Technology Office": [
    'Resolve 90% of helpdesk tickets within the same working day',
    'Maintain 99% uptime of core LGU systems across the period',
    'Complete scheduled backups and security patching with zero missed cycles',
    'Deliver one e-government service enhancement that removes a manual workflow',
  ],
  "City Engineering Office": [
    'Complete technical inspections within the committed schedule for 95% of projects',
    'Ensure project documentation and as-built plans are complete at turnover',
    'Respond to facility maintenance requests within 1 working day',
  ],
  "City Health Office": [
    'Serve all clients within the service standard at ≥90% satisfaction',
    'Maintain complete, accurate patient records with zero data-privacy findings',
    'Achieve ≥90% coverage for assigned public-health programs',
  ],
  "City Planning and Development Office": [
    'Prepare assigned plans and studies with complete data on or before deadline',
    'Maintain a validated dataset for the assigned program area',
    'Submit accurate quarterly monitoring reports with zero data errors',
    'Deliver one policy brief adopted by management during the period',
  ],
  "City Human Resource Management Office": [
    'Process HR transactions (leave, service records) within 3 working days',
    'Keep 201 files of supervised staff complete with zero missing documents',
    'Roll out a capacity-building activity addressing an identified competency gap',
  ],
  "City DRRM Office": [
    'Conduct hazard mapping and update the community risk registry',
    'Achieve 100% readiness of response equipment across the period',
    'Facilitate at least 2 barangay disaster-preparedness drills',
  ],
  "General Services & Records Office": [
    'Classify, encode, and file 100% of incoming documents within 1 working day',
    'Maintain the records inventory with zero misfiled documents at period-end',
    'Digitize at least 80% of active records for electronic retrieval',
  ],
  "Office of the City Mayor": [
    'Coordinate flagship program implementation with partner offices on schedule',
    'Prepare executive reports and briefers on or before every deadline',
    'Facilitate at least 2 stakeholder consultations and document the results',
  ],
};
const kraFor = (dept, n) => (KRA_LIBRARY[dept] ?? KRA_LIBRARY['Office of the City Mayor']).slice(0, n);

// ── Per-cycle competency scores by archetype ─────────────────────────────────
// Returns { comp: {name:score}, overall, adjectival } for a CLOSED cycle.
function scoreClosedCycle(emp, cycleId) {
  const idx = HISTORICAL.indexOf(cycleId); // 0,1,2 oldest→newest
  const r = rng(`${emp.id}|${cycleId}`);
  let base;
  if (emp.archetype === 'high') base = 4.7;                          // Outstanding throughout
  else if (emp.archetype === 'declining') base = [4.2, 3.4, 2.5][idx]; // clear downward trend
  // Normals span Satisfactory→Very Satisfactory (2.80–4.29) so the succession
  // flag stays selective — only genuinely strong records clear "all-3 VS+".
  else base = 2.8 + (hash(emp.id) % 150) / 100;

  const comp = {};
  for (const name of COMPETENCIES) {
    let v = base + (r() - 0.5) * 0.8; // ±0.4 jitter
    if (emp.archetype === 'high' && LEADERSHIP_ADJACENT.includes(name)) v = 5;   // leadership strength
    if (emp.archetype === 'declining' && cycleId === 'H2-2025' && name === 'Digital Literacy for Government Services') v = 2; // ≤2 in latest
    comp[name] = clamp15(v);
  }
  const overall = Number((Object.values(comp).reduce((a, b) => a + b, 0) / COMPETENCIES.length).toFixed(2));
  return { comp, overall, adjectival: adjectival(overall) };
}

// ── Which cycles apply to an employee (new hires: none before hire) ──────────
function cyclesFor(emp) {
  return RATING_PERIODS.filter((c) => emp.hired <= c.period_end).map((c) => c.cycle_id);
}

// ── Status for an (employee, cycle), derived from the global phase + archetype ─
function statusFor(emp, cycleId) {
  const phase = CYCLE[cycleId].phase;
  if (phase === 'CLOSED') return 'Finalized';
  if (phase === 'RATING') {
    if (emp.archetype === 'onleave') return 'Deferred';
    return 'Rating Open / Pending Submission';
  }
  // TARGET_SETTING (H2-2026)
  if (emp.archetype === 'overdue') return 'Overdue';
  return 'Draft (Target Setting)';
}

// ── Build the record rows ────────────────────────────────────────────────────
const iso = (d) => d; // dates already ISO strings
function buildRecords() {
  const rows = [];
  for (const emp of EMPLOYEES) {
    for (const cycleId of cyclesFor(emp)) {
      const c = CYCLE[cycleId];
      const status = statusFor(emp, cycleId);
      const isClosed = c.phase === 'CLOSED';
      const isDeferred = status === 'Deferred';
      const isOverdue = status === 'Overdue';
      const prorated = emp.archetype === 'newhire' && cycleId === 'H1-2026';

      // Targets: populated for open/closed cycles, EXCEPT overdue (none set = why it's overdue).
      const nKra = 3 + (hash(emp.id + cycleId) % 3); // 3–5
      const targets = isOverdue ? '' : kraFor(emp.dept, nKra).map((t, i) => `${i + 1}. ${t}`).join(' | ');

      // Competency ratings + overall only for CLOSED (rated) cycles.
      let scored = null;
      if (isClosed) scored = scoreClosedCycle(emp, cycleId);

      // Submission dates only for Rating/Finalized cycles.
      let selfDate = null, supDate = null;
      if (isClosed) {
        selfDate = addDays(c.window_start, 1 + (hash(emp.id) % 4));
        supDate = addDays(c.window_start, 6 + (hash(emp.id + 'sup') % 5));
      } else if (c.phase === 'RATING' && !isDeferred) {
        // Rating window is open: ~60% have submitted their self-assessment; supervisor pending.
        if ((hash(emp.id) % 5) < 3) selfDate = addDays(c.window_start, 2 + (hash(emp.id) % 6));
      }

      const row = {
        'IPCR Record ID': `IPCR-${emp.id.slice(-4)}-${cycleId}`,
        'Employee ID': emp.id,
        'Cycle ID': cycleId,
        'Cycle Phase': c.phase,
        'Status': status + (prorated ? ' (Prorated)' : ''),
        'Targets/KRAs': targets,
      };
      for (const name of COMPETENCIES) row[name] = scored ? scored.comp[name] : '';
      row['Overall Numerical Rating'] = scored ? scored.overall : '';
      row['Adjectival Rating'] = scored ? scored.adjectival : '';
      row['Self-Assessment Submitted'] = selfDate ?? '';
      row['Supervisor Rating Submitted'] = supDate ?? '';
      row['Rater/Supervisor Name'] = DEPT_SUP[emp.dept] ?? '';
      row['Notes'] = isDeferred ? 'On official leave during the H1-2026 rating window — not rated'
        : isOverdue ? 'Target-setting not submitted within the H2-2026 window'
        : prorated ? `Prorated — hired ${emp.hired}, mid-period`
        : '';
      rows.push(row);
    }
  }
  return rows;
}

function addDays(isoDate, days) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Derived flags (§4) — computed from the 3 historical closed cycles ────────
function computeFlags(records) {
  const byEmp = new Map();
  for (const r of records) {
    if (!byEmp.has(r['Employee ID'])) byEmp.set(r['Employee ID'], {});
    byEmp.get(r['Employee ID'])[r['Cycle ID']] = r;
  }
  const out = [];
  for (const emp of EMPLOYEES) {
    const recs = byEmp.get(emp.id) ?? {};
    const hist = HISTORICAL.map((cid) => recs[cid]).filter(Boolean);
    const base = {
      'Employee ID': emp.id, 'Full Name': emp.name, 'Position': emp.position, 'Department': emp.dept,
      'H2-2024 Overall': recs['H2-2024']?.['Overall Numerical Rating'] ?? '',
      'H1-2025 Overall': recs['H1-2025']?.['Overall Numerical Rating'] ?? '',
      'H2-2025 Overall': recs['H2-2025']?.['Overall Numerical Rating'] ?? '',
    };
    if (hist.length < 3) {
      out.push({ ...base, 'Trend': 'N/A', 'Training Needs Flag': 'N/A (insufficient history)', 'Training Reason': `New hire (${emp.hired}) — no 3 historical cycles`, 'Succession Flag': 'N/A (insufficient history)', 'Succession Reason': '' });
      continue;
    }
    const overalls = hist.map((r) => r['Overall Numerical Rating']);
    const latest = recs['H2-2025'];
    const anyLow = COMPETENCIES.some((c) => Number(latest[c]) <= 2);
    const declining = overalls[0] > overalls[1] && overalls[1] > overalls[2];
    const trainNeed = anyLow || declining;
    const trainReason = [
      anyLow ? `≥1 competency ≤2 in latest cycle (${COMPETENCIES.filter((c) => Number(latest[c]) <= 2).join(', ')})` : '',
      declining ? `declining overall trend ${overalls.join(' → ')}` : '',
    ].filter(Boolean).join('; ') || 'no risk indicators';

    const allGood = hist.every((r) => ['Outstanding', 'Very Satisfactory'].includes(r['Adjectival Rating']));
    const leadAvg = (name) => hist.reduce((a, r) => a + Number(r[name]), 0) / hist.length;
    const strongLead = LEADERSHIP_ADJACENT.filter((name) => leadAvg(name) >= 4);
    const succession = allGood && strongLead.length > 0;
    const succReason = succession
      ? `All 3 cycles Outstanding/Very Satisfactory; strong (≥4 avg) in ${strongLead.join(', ')}`
      : (!allGood ? 'not Outstanding/VS in all 3 historical cycles' : 'no leadership-adjacent competency ≥4');

    out.push({
      ...base,
      'Trend': overalls[0] < overalls[2] ? 'Improving' : overalls[0] > overalls[2] ? 'Declining' : 'Stable',
      'Training Needs Flag': trainNeed ? 'TRUE' : 'FALSE', 'Training Reason': trainReason,
      'Succession Flag': succession ? 'TRUE' : 'FALSE', 'Succession Reason': succReason,
    });
  }
  return out;
}

// ── Business-rules documentation sheet (§5) ──────────────────────────────────
const BUSINESS_RULES = [
  { Rule: 'Rating submission only within the cycle rating window', Enforcement: 'A record is submittable only if TODAY ∈ [window_start, window_end] AND phase = RATING. Today=2026-07-15 falls in H1-2026 (Jun 25–Jul 20).', 'Cycles affected': 'H1-2026 (open)' },
  { Rule: 'Target-setting editable only while phase = TARGET_SETTING', Enforcement: 'KRAs are editable only for H2-2026 (window Jul 1–Aug 15). Other cycles are read-only for targets.', 'Cycles affected': 'H2-2026 (open)' },
  { Rule: 'Finalized cycles are fully read-only', Enforcement: 'All CLOSED cycles have Status=Finalized; competency ratings, overall, and dates are frozen.', 'Cycles affected': 'H2-2024, H1-2025, H2-2025' },
  { Rule: 'New hires cannot have cycles before Date Hired', Enforcement: 'cyclesFor(emp) filters cycles whose period_end < hire date. EMP-0017/0018 (hired 2026) have only H1-2026 + H2-2026.', 'Cycles affected': 'per-employee' },
  { Rule: 'Historical cycles must not be open/editable', Enforcement: 'Only Finalized status is emitted for CLOSED cycles — never Draft/Rating.', 'Cycles affected': 'H2-2024, H1-2025, H2-2025' },
  { Rule: 'Open/closed state is global, not per-employee', Enforcement: 'Every record derives Status from RATING_PERIODS[cycle].phase; no per-employee open/closed is hardcoded.', 'Cycles affected': 'all' },
];

// ── Assemble the workbook ─────────────────────────────────────────────────────
function main() {
  const records = buildRecords();
  const flags = computeFlags(records);

  const employeesSheet = EMPLOYEES.map((e) => ({
    'Employee ID': e.id, 'Full Name': e.name, 'Position/Designation': e.position,
    'Department/Office': e.dept, 'Date Hired': e.hired, 'Employment Status': e.status,
    'Profile': { high: 'High performer (succession candidate)', declining: 'Declining trend (training need)', onleave: 'On leave during H1-2026 (deferred)', overdue: 'Overdue H2-2026 target-setting', newhire: 'New hire (partial history)', normal: 'Regular' }[e.archetype],
  }));

  const periodsSheet = RATING_PERIODS.map((c) => ({
    'Cycle ID': c.cycle_id, 'Period Start': c.period_start, 'Period End': c.period_end,
    'Phase (as of 2026-07-15)': c.phase, 'Window Start': c.window_start, 'Window End': c.window_end,
    'Open Today?': withinWindow(c) && c.phase !== 'CLOSED' ? 'YES' : 'no',
    'Status Label': c.phase === 'CLOSED' ? 'Finalized/Rated' : c.phase === 'RATING' ? 'Rating Open / Pending Submission' : 'Target Setting / Draft',
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(periodsSheet), 'RatingPeriods');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(employeesSheet), 'Employees');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(records), 'IPCR_Records');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flags), 'Flags_Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(BUSINESS_RULES), 'Business_Rules');

  mkdirSync(resolve(ROOT, 'data'), { recursive: true });
  const out = resolve(ROOT, 'data', 'ipcr_synthetic_dataset.xlsx');
  XLSX.writeFile(wb, out);

  // Console summary
  console.log(`✓ Wrote ${out}`);
  console.log(`  Employees: ${employeesSheet.length} | IPCR records: ${records.length} | Cycles: ${RATING_PERIODS.length}`);
  const tn = flags.filter((f) => f['Training Needs Flag'] === 'TRUE');
  const sp = flags.filter((f) => f['Succession Flag'] === 'TRUE');
  console.log(`  Training-need flagged: ${tn.map((f) => f['Employee ID']).join(', ') || 'none'}`);
  console.log(`  Succession flagged:    ${sp.map((f) => f['Employee ID']).join(', ') || 'none'}`);
  return { records, flags };
}

main();
