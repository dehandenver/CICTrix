// Generates one self-contained, transactional SQL script from dataset.json.
//   node scripts/seed/generate.mjs  ->  scripts/seed/dataset_reset.sql
// The script: (1) additively creates new tables + nullable columns, (2) wipes
// all data (TRUNCATE ... CASCADE), (3) reloads the PDF dataset. All in one
// transaction. Existing app code is untouched; new columns are nullable.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, 'dataset.json'), 'utf8'));

// The large 150-row tables live in their own files (built in batches). If a
// file is present it overrides the (empty) placeholder array in dataset.json.
for (const key of ['applicants', 'applicant_scores', 'exam_interview_schedules']) {
  const p = join(here, `${key}.json`);
  if (existsSync(p)) data[key] = JSON.parse(readFileSync(p, 'utf8'));
}

// ── helpers ──────────────────────────────────────────────────────────────────
const q = (v) => (v === null || v === undefined || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const n = (v) => (v === null || v === undefined || v === '' || v === '-' || v === '—' ? 'NULL' : String(v));
const bool = (v) => (v ? 'TRUE' : 'FALSE');

const MONTHS = { January: '01', February: '02', March: '03', April: '04', May: '05', June: '06', July: '07', August: '08', September: '09', October: '10', November: '11', December: '12' };
// "May 11, 2026" -> '2026-05-11'  (returns NULL literal when blank)
function dateLit(s) {
  if (!s || s === '—' || s === '-') return 'NULL';
  const m = String(s).trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return 'NULL';
  const mm = MONTHS[m[1]];
  if (!mm) return 'NULL';
  return `'${m[3]}-${mm}-${String(m[2]).padStart(2, '0')}'`;
}
// "Barangay Bolo, Roxas City, Capiz" -> { barangay, city, province }
function splitAddress(a) {
  const parts = String(a || '').split(',').map((p) => p.trim()).filter(Boolean);
  return {
    barangay: (parts[0] || '').replace(/^Barangay\s+/i, '') || null,
    city: parts[1] || null,
    province: parts[2] || null,
  };
}

const out = [];
const w = (s = '') => out.push(s);

// ── 1) additive DDL ──────────────────────────────────────────────────────────
w('-- ============================================================================');
w('-- CICTrix full data reset from RSP HRMO Dataset Report (generated).');
w('-- Additive schema only (new tables + NULLABLE columns) — no existing');
w('-- table/column is dropped or altered destructively, so app code keeps working.');
w('-- Then TRUNCATE ... CASCADE wipes ALL data and reloads the dataset.');
w('-- Run this once in the Supabase SQL Editor. Back up first — this is destructive.');
w('-- ============================================================================');
w('');
w('-- New reference tables (natural text IDs, no FK remap needed).');
w(`CREATE TABLE IF NOT EXISTS divisions (
  id            text PRIMARY KEY,
  department_id text,
  department    text,
  division_name text
);`);
w(`CREATE TABLE IF NOT EXISTS archives (
  id              text PRIMARY KEY,
  record_type     text,
  name            text,
  gender          text,
  related_position text,
  department      text,
  final_status    text,
  date_archived   date
);`);
w(`CREATE TABLE IF NOT EXISTS applicant_scores (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_ref    text,
  job_ref          text,
  applicant_name   text,
  exam_schedule    text,
  interview_schedule text,
  educ             integer,
  exp              integer,
  perf             integer,
  written          integer,
  potential        integer,
  pcpt             integer,
  oral             integer,
  overall_rating   numeric(4,2),
  status           text
);`);
w(`CREATE TABLE IF NOT EXISTS exam_interview_schedules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_ref        text,
  applicant_ref  text,
  applicant_name text,
  schedule_type  text,
  sched_date     date,
  sched_time     text,
  venue          text
);`);
w('');
w('-- Nullable columns added to existing tables to fit the dataset.');
w("ALTER TABLE departments  ADD COLUMN IF NOT EXISTS department_head_name text;");
w("ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS division text;");
w("ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS supervisor text;");
w("ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS salary_grade text;");
w("ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS employment_status text;");
w("ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS no_of_vacancies integer;");
w("ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS date_posted date;");
w("ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS application_deadline date;");
w("ALTER TABLE applicants   ADD COLUMN IF NOT EXISTS applicant_ref text;");
w("ALTER TABLE applicants   ADD COLUMN IF NOT EXISTS additional_months integer;");
w("ALTER TABLE employees    ADD COLUMN IF NOT EXISTS division text;");
w("ALTER TABLE employees    ADD COLUMN IF NOT EXISTS highest_educational_attainment text;");
w("ALTER TABLE employees    ADD COLUMN IF NOT EXISTS eligibility text;");
w('');
w('-- Frontend anon client access for the new tables (matches existing pattern).');
for (const t of ['divisions', 'archives', 'applicant_scores', 'exam_interview_schedules']) {
  w(`ALTER TABLE ${t} DISABLE ROW LEVEL SECURITY;`);
  w(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${t} TO authenticated, anon;`);
}
w('');

// ── 2) wipe everything ───────────────────────────────────────────────────────
const TRUNCATE = [
  'access_change_audit', 'applicant_attachments', 'applicant_scores', 'applicants', 'archives', 'assignments',
  'competencies', 'competency_change_log', 'competency_dictionary', 'competency_requirement_proposals',
  'cycle_compilations', 'departments', 'departments_backfill_audit', 'divisions', 'employee_competencies',
  'employee_documents', 'employee_education', 'employee_eligibility', 'employee_history', 'employee_leave_balances',
  'employee_portal_accounts', 'employee_settings', 'employee_training', 'employee_work_experience', 'employees',
  'evaluation_cycles', 'evaluations', 'exam_interview_schedules', 'ipcr_notifications', 'ipcr_performance',
  'ipcr_submissions', 'job_postings', 'jobs', 'locked_targets', 'new_entrant_onboarding', 'newly_hired',
  'office_cycle_closeouts', 'office_role_assignments', 'performance_cycles', 'performance_evaluations',
  'phase_schedules', 'pm_lnd_reports', 'policy_audit', 'position_competency_requirements', 'qualification_standards',
  'raters', 'supervisor_password_resets', 'supervisors', 'training_enrollments', 'training_programs',
  'training_requests', 'training_sessions', 'trainings', 'user_roles',
];
w('BEGIN;');
w('');
w('-- Full reset: wipe every data table (CASCADE clears dependents too).');
w(`TRUNCATE ${TRUNCATE.join(', ')} RESTART IDENTITY CASCADE;`);
w('');

// ── 3) inserts ───────────────────────────────────────────────────────────────
function insert(table, cols, rows, toValues) {
  if (!rows || rows.length === 0) return;
  w(`-- ${table} (${rows.length})`);
  w(`INSERT INTO ${table} (${cols.join(', ')}) VALUES`);
  const lines = rows.map((r, i) => `  (${toValues(r).join(', ')})${i === rows.length - 1 ? ';' : ','}`);
  w(lines.join('\n'));
  w('');
}

insert('departments', ['code', 'name', 'department_head_name', 'is_active'], data.departments,
  (d) => [q(d.abbreviation), q(d.name), q(d.head), bool(true)]);

insert('divisions', ['id', 'department_id', 'department', 'division_name'], data.divisions,
  (d) => [q(d.id), q(d.department_id), q(d.department), q(d.division_name)]);

insert('job_postings',
  ['item_number', 'title', 'department', 'office', 'division', 'supervisor', 'salary_grade', 'employment_status', 'no_of_vacancies', 'date_posted', 'application_deadline', 'status'],
  data.job_postings,
  (j) => [q(j.id), q(j.position_title), q(j.department), q(j.department), q(j.division), q(j.supervisor), q(j.salary_grade), q(j.employment_status), n(j.no_of_vacancies), dateLit(j.date_posted), dateLit(j.application_deadline), q(j.posting_status)]);

insert('employees',
  ['employee_number', 'first_name', 'middle_name', 'last_name', 'sex', 'position', 'department', 'division', 'employment_status', 'date_hired', 'email', 'phone', 'current_address_barangay', 'current_address_city', 'current_address_province', 'civil_status', 'highest_educational_attainment', 'eligibility', 'status'],
  data.employees,
  (e) => {
    const a = splitAddress(e.address);
    return [q(e.id), q(e.first_name), q(e.middle_name), q(e.last_name), q(e.gender), q(e.position_title), q(e.department), q(e.division), q(e.employment_status), dateLit(e.date_hired), q(e.email), q(e.contact_number), q(a.barangay), q(a.city), q(a.province), q(e.civil_status ?? null), q(e.highest_educational_attainment ?? null), q(e.eligibility ?? null), q('Active')];
  });

insert('archives',
  ['id', 'record_type', 'name', 'gender', 'related_position', 'department', 'final_status', 'date_archived'],
  data.archives,
  (a) => [q(a.id), q(a.record_type), q(a.name), q(a.gender), q(a.related_position), q(a.department), q(a.final_status), dateLit(a.date_archived)]);

// Status per applicant comes from the scores dataset.
const statusByRef = new Map((data.applicant_scores || []).map((s) => [s.applicant_ref, s.status]));

insert('applicants',
  ['applicant_ref', 'first_name', 'middle_name', 'last_name', 'gender', 'email', 'contact_number', 'address', 'position', 'item_number', 'office', 'education_level', 'years_of_experience', 'additional_months', 'status'],
  data.applicants,
  (a) => [q(a.id), q(a.first_name), q(a.middle_name), q(a.last_name), q(a.gender), q(a.email), q(a.contact_number), q(a.address), q(a.position_applied_for), q(a.job_id), q(a.department), q(a.education), n(a.experience_years), n(a.additional_months), q(statusByRef.get(a.id) ?? 'For Initial Review')]);

insert('applicant_scores',
  ['applicant_ref', 'job_ref', 'applicant_name', 'exam_schedule', 'interview_schedule', 'educ', 'exp', 'perf', 'written', 'potential', 'pcpt', 'oral', 'overall_rating', 'status'],
  data.applicant_scores,
  (s) => [q(s.applicant_ref), q(s.job_ref), q(s.applicant_name), q(s.exam_schedule), q(s.interview_schedule), n(s.educ), n(s.exp), n(s.perf), n(s.written), n(s.potential), n(s.pcpt), n(s.oral), n(s.overall_rating), q(s.status)]);

insert('exam_interview_schedules',
  ['job_ref', 'applicant_ref', 'applicant_name', 'schedule_type', 'sched_date', 'sched_time', 'venue'],
  data.exam_interview_schedules,
  (s) => [q(s.job_ref), q(s.applicant_ref), q(s.applicant_name), q(s.schedule_type), dateLit(s.date), q(s.time), q(s.venue)]);

w('COMMIT;');
w('');

const sql = out.join('\n');
writeFileSync(join(here, 'dataset_reset.sql'), sql, 'utf8');
const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]));
console.log('Wrote dataset_reset.sql');
console.log('Row counts:', JSON.stringify(counts));
