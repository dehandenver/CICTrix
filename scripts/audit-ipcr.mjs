// ─────────────────────────────────────────────────────────────────────────────
// Audit: row-by-row content check of every FROZEN (approved) Phase 1 IPCR.
//
// Flags MFO titles / Success Indicator descriptions that are null, empty,
// whitespace-only, or placeholder-looking ("e.g." or a known UI sample string).
// Cross-checks active RSP employees against Phase 1 record coverage, and checks
// that every Success Indicator has exactly one Phase 2 rating row.
//
// Read-only. Run before and after a backfill (Step 0 / Step 4):
//   node scripts/audit-ipcr.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { loadEnv, serviceClient, empFullName, empNumber, empPosition, empDepartmentName } from './lib/ipcr-shared.mjs';
const db = serviceClient(loadEnv());

// Placeholder text is the UI's grayed-out example ("e.g. …") — a real record
// must never store that. We only treat a value as placeholder when it actually
// carries the "e.g." marker; legitimate titles like "Competency Development"
// (which happens to match a UI sample MINUS the "e.g.") are NOT placeholders.
const isBlank = (s) => !s || String(s).trim() === '';
const isPlaceholder = (s) => /\be\.?g\.?\b/i.test(String(s ?? ''));
const bad = (s) => isBlank(s) || isPlaceholder(s);

const PERIOD_START = new Date('2025-07-01');

async function main() {
  const { data: emps } = await db.from('employees')
    .select('id, employee_number, first_name, middle_name, last_name, department, position, date_hired, status')
    .eq('status', 'Active');
  const { data: settings } = await db.from('target_settings')
    .select('id, employee_id, cycle_id, status, submitted_at, approved_at, approved_by')
    .eq('status', 'approved');
  const { data: mfos } = await db.from('mfos').select('id, target_setting_id, function_type, title');
  const { data: sis } = await db.from('success_indicators').select('id, mfo_id, description');
  const { data: ratings } = await db.from('success_indicator_ratings').select('success_indicator_id');

  const tsByEmp = new Map((settings ?? []).map((t) => [String(t.employee_id), t]));
  const mfosByTs = new Map();
  for (const m of mfos ?? []) { const a = mfosByTs.get(m.target_setting_id) ?? []; a.push(m); mfosByTs.set(m.target_setting_id, a); }
  const sisByMfo = new Map();
  for (const s of sis ?? []) { const a = sisByMfo.get(s.mfo_id) ?? []; a.push(s); sisByMfo.set(s.mfo_id, a); }
  const ratingCount = new Map();
  for (const r of ratings ?? []) ratingCount.set(r.success_indicator_id, (ratingCount.get(r.success_indicator_id) ?? 0) + 1);

  const noRecord = [], emptyFields = [], populated = [], hiredAfter = [];

  for (const e of emps ?? []) {
    const ts = tsByEmp.get(String(e.id));
    const label = `${empNumber(e)} · ${empFullName(e)} · ${empPosition(e) ?? '—'} / ${empDepartmentName(e) ?? '—'}`;
    const hiredLate = e.date_hired && new Date(e.date_hired) > PERIOD_START;

    if (!ts) {
      (hiredLate ? hiredAfter : noRecord).push({ label, hired: e.date_hired });
      continue;
    }
    const tsMfos = mfosByTs.get(ts.id) ?? [];
    const problems = [];
    if (tsMfos.length === 0) problems.push('no MFOs at all');
    for (const m of tsMfos) {
      if (bad(m.title)) problems.push(`MFO ${m.id.slice(0, 8)} [${m.function_type}] title="${m.title ?? ''}"`);
      const mSis = sisByMfo.get(m.id) ?? [];
      if (mSis.length === 0) problems.push(`MFO ${m.id.slice(0, 8)} [${m.function_type}] has NO success indicators`);
      for (const s of mSis) {
        if (bad(s.description)) problems.push(`SI ${s.id.slice(0, 8)} (mfo ${m.id.slice(0, 8)}) desc="${s.description ?? ''}"`);
      }
    }
    if (problems.length) emptyFields.push({ label, problems });
    else populated.push({ label });
  }

  // Phase 2 shell integrity: every SI in an approved record → exactly 1 rating row.
  const approvedTsIds = new Set((settings ?? []).map((t) => t.id));
  const approvedMfoIds = new Set((mfos ?? []).filter((m) => approvedTsIds.has(m.target_setting_id)).map((m) => m.id));
  const approvedSis = (sis ?? []).filter((s) => approvedMfoIds.has(s.mfo_id));
  const siNoRating = approvedSis.filter((s) => (ratingCount.get(s.id) ?? 0) === 0);
  const siDupRating = approvedSis.filter((s) => (ratingCount.get(s.id) ?? 0) > 1);

  console.log('════════ STEP 0 — IPCR CONTENT AUDIT ════════\n');
  console.log(`Active employees (RSP directory): ${(emps ?? []).length}`);
  console.log(`Approved/frozen Phase 1 records  : ${(settings ?? []).length}\n`);

  console.log(`(a) Active employees with NO IPCR record : ${noRecord.length}`);
  for (const x of noRecord) console.log(`      ✗ ${x.label}`);
  console.log(`\n    …of which hired AFTER 2025-07-01 (flag, don't seed): ${hiredAfter.length}`);
  for (const x of hiredAfter) console.log(`      ⚑ ${x.label}  (hired ${x.hired})`);

  console.log(`\n(b) Records with EMPTY/placeholder MFO or SI fields: ${emptyFields.length}`);
  for (const x of emptyFields) {
    console.log(`      ✗ ${x.label}`);
    for (const p of x.problems) console.log(`          - ${p}`);
  }

  console.log(`\n(c) Fully populated records: ${populated.length}`);
  for (const x of populated) console.log(`      ✓ ${x.label}`);

  console.log(`\nPhase 2 shells: ${approvedSis.length} SIs in frozen records · ${siNoRating.length} missing a rating row · ${siDupRating.length} with duplicates`);
  console.log('\n════════ END AUDIT ════════');
}

main().catch((e) => { console.error(e); process.exit(1); });
