// ─────────────────────────────────────────────────────────────────────────────
// Seed a realistic HISTORICAL training record set for the L&D Archive.
//
//   node scripts/seed-employee-training-history.mjs
//
// For every active employee, generates 2–3 trainings PER YEAR from their hire
// year through the current year — so the archive reads like a real training
// history that deepens with tenure, not a sparse one-off seed. Each record gets:
//   • a Type of Competency (one of the 12 canonical competencies), written to
//     employee_training_competencies (the join the archive/succession read)
//   • a realistic attendance_percentage (mostly 85–100, occasional dip)
//   • number_of_hours (still used by succession scoring) + a valid training_type
//   • a certificate number in the observed format {DEPTCODE}-{last5 empno}-NN
//
// Idempotent & clean: each employee's existing employee_training rows are deleted
// first (their competency tags cascade away), then the fresh history is inserted.
//
// Prerequisites: migrations 20260828 (employee_training_competencies) and 20260830
// (attendance_percentage) applied; SUPABASE_SERVICE_ROLE_KEY in .env/backend/.env.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CURRENT = new Date('2026-07-27'); // project "today" (see currentDate)

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

// ── Training catalog: 2 courses per competency, each with a provider, a valid
//    training_type (Orientation/Technical/Leadership/Compliance/Other), and a
//    typical duration in hours. Competency names must match the `competencies`
//    table exactly. ──────────────────────────────────────────────────────────
const CATALOG = [
  // Knowledge of Local Governance
  { title: 'Local Governance and the Local Government Code', competency: 'Knowledge of Local Governance', provider: 'Local Government Academy (DILG-LGA)', type: 'Leadership', hours: 24 },
  { title: 'LGU Operations and Mandates Seminar', competency: 'Knowledge of Local Governance', provider: 'Department of the Interior and Local Government (DILG)', type: 'Leadership', hours: 16 },
  // Public Administration Principles
  { title: 'Foundations of Public Administration', competency: 'Public Administration Principles', provider: 'UP National College of Public Administration and Governance', type: 'Leadership', hours: 40 },
  { title: 'Public Sector Management Workshop', competency: 'Public Administration Principles', provider: 'Development Academy of the Philippines (DAP)', type: 'Leadership', hours: 24 },
  // Community Engagement Skills
  { title: 'Community Engagement and Participatory Governance', competency: 'Community Engagement Skills', provider: 'Department of the Interior and Local Government (DILG)', type: 'Other', hours: 16 },
  { title: 'Stakeholder Consultation and Facilitation', competency: 'Community Engagement Skills', provider: 'Local Government Academy (DILG-LGA)', type: 'Other', hours: 8 },
  // Project Management in a Public Setting
  { title: 'Infrastructure Project Management for LGUs', competency: 'Project Management in a Public Setting', provider: 'Philippine Institute of Civil Engineers (PICE)', type: 'Technical', hours: 40 },
  { title: 'Government Project Monitoring and Evaluation', competency: 'Project Management in a Public Setting', provider: 'National Economic and Development Authority (NEDA)', type: 'Technical', hours: 24 },
  // Fiscal Management / Budgeting for LGU
  { title: 'Local Government Budgeting and NTA Utilization', competency: 'Fiscal Management / Budgeting for LGU', provider: 'Department of Budget and Management (DBM)', type: 'Technical', hours: 24 },
  { title: 'Fund Management and COA Compliance', competency: 'Fiscal Management / Budgeting for LGU', provider: 'Commission on Audit (COA)', type: 'Compliance', hours: 16 },
  // Transparency and Accountability Practices
  { title: 'Transparency and Full Disclosure Policy Seminar', competency: 'Transparency and Accountability Practices', provider: 'Department of the Interior and Local Government (DILG)', type: 'Compliance', hours: 8 },
  { title: 'Public Bidding and Procurement Transparency', competency: 'Transparency and Accountability Practices', provider: 'Government Procurement Policy Board (GPPB)', type: 'Compliance', hours: 16 },
  // Disaster Risk Reduction and Management
  { title: 'DRRM Planning and RA 10121 Implementation', competency: 'Disaster Risk Reduction and Management', provider: 'Office of Civil Defense (OCD)', type: 'Technical', hours: 24 },
  { title: 'Emergency Response and Preparedness', competency: 'Disaster Risk Reduction and Management', provider: 'National Disaster Risk Reduction and Management Council', type: 'Technical', hours: 16 },
  // Digital Literacy for Government Services
  { title: 'Digital Literacy for Public Service Delivery', competency: 'Digital Literacy for Government Services', provider: 'Department of Information and Communications Technology (DICT)', type: 'Technical', hours: 16 },
  { title: 'E-Government Systems and Cybersecurity Awareness', competency: 'Digital Literacy for Government Services', provider: 'Department of Information and Communications Technology (DICT)', type: 'Technical', hours: 24 },
  // Ethical Conduct and Public Service Standards
  { title: 'Government Service Values Orientation', competency: 'Ethical Conduct and Public Service Standards', provider: 'Civil Service Commission (CSC)', type: 'Orientation', hours: 8 },
  { title: 'Ethics and RA 6713 Refresher Course', competency: 'Ethical Conduct and Public Service Standards', provider: 'Civil Service Commission (CSC)', type: 'Compliance', hours: 8 },
  // Technical Writing for Government Documents
  { title: 'Technical Writing for Government Documents', competency: 'Technical Writing for Government Documents', provider: 'Civil Service Commission (CSC)', type: 'Technical', hours: 16 },
  { title: 'Drafting Ordinances, Resolutions and Reports', competency: 'Technical Writing for Government Documents', provider: 'Local Government Academy (DILG-LGA)', type: 'Technical', hours: 16 },
  // Data and Records Management and Organization
  { title: 'Records and Archives Management', competency: 'Data and Records Management and Organization', provider: 'National Archives of the Philippines (NAP)', type: 'Technical', hours: 16 },
  { title: 'Data Privacy Act Compliance for Government', competency: 'Data and Records Management and Organization', provider: 'National Privacy Commission (NPC)', type: 'Compliance', hours: 8 },
  // Public Communication Skills
  { title: 'Effective Public Communication and Media Relations', competency: 'Public Communication Skills', provider: 'Philippine Information Agency (PIA)', type: 'Other', hours: 16 },
  { title: 'Public Speaking and Presentation Skills', competency: 'Public Communication Skills', provider: 'Development Academy of the Philippines (DAP)', type: 'Other', hours: 8 },
];

const pad2 = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const durationDays = (hours) => (hours <= 8 ? 1 : hours <= 16 ? 2 : hours <= 24 ? 3 : 5);

const seededAttendance = () => {
  const roll = Math.random();
  if (roll < 0.12) return 70 + Math.floor(Math.random() * 15); // 70–84 dip
  if (roll < 0.35) return 85 + Math.floor(Math.random() * 8);  // 85–92
  return 93 + Math.floor(Math.random() * 8);                   // 93–100
};

const deptCodeFrom = (name, codeMap) => {
  const code = codeMap.get(String(name ?? '').trim());
  if (code) return String(code).toUpperCase();
  // Fallback: initials of significant words (skip Office/of/the).
  const skip = new Set(['office', 'of', 'the', 'and', 'for', 'department']);
  const letters = String(name ?? '')
    .split(/\s+/)
    .filter((w) => w && !skip.has(w.toLowerCase()))
    .map((w) => w[0].toUpperCase())
    .join('');
  return letters.slice(0, 3) || 'OFC';
};

const certSuffix = (employeeNumber) =>
  String(employeeNumber ?? '').replace(/[^A-Za-z0-9]/g, '').slice(-5).toUpperCase() || 'XXXXX';

// ── Main ────────────────────────────────────────────────────────────────────
const { url, key } = loadEnv();
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const [{ data: competencies, error: cErr }, { data: departments, error: dErr }, { data: employees, error: eErr }] =
  await Promise.all([
    db.from('competencies').select('id, name'),
    db.from('departments').select('name, code'),
    db.from('employees').select('id, employee_number, first_name, last_name, department, position, date_hired, status'),
  ]);
if (cErr) { console.error('❌ load competencies:', cErr.message); process.exit(1); }
if (dErr) { console.error('❌ load departments:', dErr.message); process.exit(1); }
if (eErr) { console.error('❌ load employees:', eErr.message); process.exit(1); }

// Normalise for the known spacing variant on "Fiscal Management / Budgeting for
// LGU" (competencies stores one slash-spacing, positions.ts another) so the
// catalog resolves regardless of which form the table holds.
const normComp = (s) => String(s ?? '').toLowerCase().replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
const compIdByName = new Map((competencies ?? []).map((c) => [normComp(c.name), String(c.id)]));
const codeMap = new Map((departments ?? []).map((d) => [String(d.name).trim(), d.code]));
const resolveCompId = (name) => compIdByName.get(normComp(name));

// Every catalog competency must resolve, or its tag can't be written — report and stop.
const missing = [...new Set(CATALOG.map((c) => c.competency))].filter((n) => !resolveCompId(n));
if (missing.length) {
  console.error('❌ These competency names are missing from the `competencies` table:');
  for (const n of missing) console.error(`   - ${n}`);
  process.exit(1);
}

const byCompetency = new Map();
for (const c of CATALOG) {
  if (!byCompetency.has(c.competency)) byCompetency.set(c.competency, []);
  byCompetency.get(c.competency).push(c);
}
const allCompetencies = [...byCompetency.keys()];

const targets = (employees ?? []).filter(
  (e) => String(e.status ?? '').toLowerCase() === 'active' && e.date_hired && e.department,
);

let totalTrainings = 0;
let totalTags = 0;
let employeesSeeded = 0;

for (const e of targets) {
  const hire = new Date(e.date_hired);
  if (Number.isNaN(hire.getTime())) continue;
  const hireYear = hire.getFullYear();
  const endYear = CURRENT.getFullYear();
  if (hireYear > endYear) continue;

  const code = deptCodeFrom(e.department, codeMap);
  const suffix = certSuffix(e.employee_number);

  // Build the chronological list of trainings across all tenure years.
  const planned = []; // { entry, fromDate, toDate }
  for (let year = hireYear; year <= endYear; year++) {
    const perYear = rand(2, 3);
    // Earliest allowed month this year (hire month in hire year; else January).
    const minMonth = year === hireYear ? hire.getMonth() : 0;
    // Latest allowed month (current month in the current year; else December).
    const maxMonth = year === endYear ? CURRENT.getMonth() : 11;
    if (minMonth > maxMonth) continue; // hired after the cutoff in the final year

    // Spread the year's trainings across distinct courses and months.
    const picks = shuffle(CATALOG).slice(0, perYear);
    const usedMonths = new Set();
    for (const entry of picks) {
      let month = rand(minMonth, maxMonth);
      let guard = 0;
      while (usedMonths.has(month) && guard++ < 12) month = rand(minMonth, maxMonth);
      usedMonths.add(month);

      const from = new Date(year, month, rand(1, 20));
      if (from < hire) from.setTime(hire.getTime());
      if (from > CURRENT) continue; // never in the future
      const to = new Date(from);
      to.setDate(to.getDate() + (durationDays(entry.hours) - 1));
      const cappedTo = to > CURRENT ? new Date(CURRENT) : to;
      planned.push({ entry, from, to: cappedTo });
    }
  }

  if (!planned.length) continue;
  planned.sort((a, b) => a.from - b.from);

  // Clean regenerate: drop this employee's existing history (tags cascade).
  const { error: delErr } = await db.from('employee_training').delete().eq('employee_id', e.id);
  if (delErr) { console.error(`❌ delete history for ${e.employee_number}:`, delErr.message); process.exit(1); }

  const rows = planned.map((p, i) => ({
    employee_id: e.id,
    training_title: p.entry.title,
    training_type: p.entry.type,
    conducted_by: p.entry.provider,
    sponsor: null,
    from_date: iso(p.from),
    to_date: iso(p.to),
    number_of_hours: p.entry.hours,
    certificate_number: `${code}-${suffix}-${pad2(i + 1)}`,
    attendance_percentage: seededAttendance(),
  }));

  const { data: inserted, error: insErr } = await db.from('employee_training').insert(rows).select('id');
  if (insErr) { console.error(`❌ insert history for ${e.employee_number}:`, insErr.message); process.exit(1); }

  // Tag each inserted row with its competency (same order as `planned`).
  const tagRows = (inserted ?? []).map((row, i) => ({
    employee_training_id: row.id,
    competency_id: resolveCompId(planned[i].entry.competency),
  }));
  if (tagRows.length) {
    const { error: tagErr } = await db.from('employee_training_competencies').insert(tagRows);
    if (tagErr) { console.error(`❌ tag history for ${e.employee_number}:`, tagErr.message); process.exit(1); }
    totalTags += tagRows.length;
  }

  totalTrainings += rows.length;
  employeesSeeded += 1;
}

console.log(`\n✅ Seeded ${totalTrainings} training record(s) with ${totalTags} competency tag(s) across ${employeesSeeded} employee(s).`);
console.log(`   (competencies used: ${allCompetencies.length}; source "today": ${iso(CURRENT)})`);
