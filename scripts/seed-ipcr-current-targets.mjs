/**
 * Seed CURRENT-YEAR (2026 cycle) IPCR targets, progressed from real history.
 *
 * Why the progression reads from the database rather than a template: each
 * employee's prior targets already exist in `ipcr_performance` for the four
 * closed semesters. Generating this year's targets from a hardcoded "typical
 * prior target" would produce progression logic that looks right against the
 * current seed and breaks the moment real historical data replaces it. So every
 * target here is derived from that employee's OWN most recent canonical
 * semester text — swap the history and the progression follows it.
 *
 * What it writes, per non-department-head employee:
 *   target_settings     one row for the active cycle
 *   mfos                one per prior function row (title = the output)
 *   success_indicators  the progressed, measurable target text
 *
 * Status follows the office's IPCR phase (§1): Legal is still in Phase 1, so
 * its targets stay `draft` and remain editable. Every other office has closed
 * Phase 1, so theirs are `approved` and locked for rating.
 *
 * Idempotent: an employee who already has MFOs for the cycle is skipped.
 *
 * Run:  node scripts/seed-ipcr-current-targets.mjs
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

/** The semester current-year targets progress from — the latest closed one. */
const BASELINE_PERIOD = 'Jul 1-Dec 31 2025';
/** Offices still in Phase 1 keep editable draft targets. */
const PHASE1_OFFICES = new Set(['Legal']);

// ── target progression ───────────────────────────────────────────────────────
// Numbers in an IPCR target don't all move the same direction, and some must not
// move at all. A count going up is improvement; minutes-per-case going up is
// regression. Ages, dose counts and legal citations are facts, not measures.

const isLawRef = (before) => /\b(RA|R\.A\.|EO|MC|DILG|Sec\.?|Section)\s*$/i.test(before);
const isRangePart = (before, after) => /\d\s*-\s*$/.test(before) || /^\s*-\s*\d/.test(after);
const TIME_UNIT = /^\s*(minutes?|mins?|hours?|hrs?|working days?|days?)\b/i;
const PERIOD_UNIT = /^\s*(months?|years?|weeks?|quarters?|semesters?)\b/i;

/**
 * Progress one target's text into this cycle's version.
 *
 * Percentages all rise (closing part of the remaining gap, capped below 100).
 * The first genuine quantity rises ~10%. The first turnaround time falls ~20%.
 * Limiting quantity/time to one edit each keeps the sentence plausible — bumping
 * every number in "3 doses of PentaHib ... before the age of one year" produces
 * nonsense.
 */
export function progressTargetText(raw) {
  const text = String(raw ?? '').replace(/^"+|"+$/g, '').trim();
  if (!text) return text;

  let bumpedCount = false;
  let loweredTime = false;

  const out = text.replace(/(\d+(?:\.\d+)?)/g, (match, numStr, offset) => {
    const value = Number(numStr);
    const before = text.slice(0, offset);
    const after = text.slice(offset + match.length);

    // Facts, not measures — leave untouched.
    if (isLawRef(before) || isRangePart(before, after)) return match;
    if (value >= 1000) return match;                 // law numbers, budget codes
    // "Two(2) days" — the numeral restates the spelled word; bumping one and
    // not the other contradicts the sentence.
    if (/\($/.test(before) && /^\)/.test(after)) return match;
    if (/\bdoses?\b/i.test(after.slice(0, 12))) return match;
    if (/\bage\b|\bold\b/i.test(after.slice(0, 18))) return match;

    // Percentages: close ~15% of the remaining gap to 100, min +2 points.
    if (/^\s*%/.test(after) || /^\s*percent/i.test(after)) {
      if (value >= 100) return match;
      const next = Math.min(99, value + Math.max(2, Math.round((100 - value) * 0.15)));
      return String(next);
    }

    // Turnaround time: faster is better, so this goes DOWN.
    if (TIME_UNIT.test(after) && !loweredTime) {
      const next = Math.max(1, Math.round(value * 0.8));
      if (next !== value) { loweredTime = true; return String(next); }
      return match;
    }

    // The reporting window ("within 6 months") is the period, not a target.
    if (PERIOD_UNIT.test(after)) return match;

    // A genuine quantity: raise it.
    if (!bumpedCount) {
      const next = Math.max(value + 1, Math.round(value * 1.1));
      bumpedCount = true;
      return String(next);
    }
    return match;
  });

  return out;
}

/**
 * A short output label for the MFO, derived from the target sentence — the
 * existing rows use headings like "Systems Availability", not full sentences.
 */
export function mfoTitleFrom(raw) {
  let t = String(raw ?? '').replace(/^"+|"+$/g, '').trim();
  t = t.split(/\s+(?:to|for|within|through|in)\s+\d/i)[0];
  t = t.split(/[,;.]/)[0];

  // Drop whole measure phrases, not just the digits — removing the number from
  // "0-59 months old" or "45% case detection" strands "- months" and a bare "%".
  t = t
    .replace(/\b\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?\s*\w*\b/g, ' ')   // "0-59 months"
    .replace(/\b\d+(?:\.\d+)?\s*%/g, ' ')                            // "45%"
    .replace(/\b\d+(?:\.\d+)?\b/g, ' ')                              // bare numbers
    .replace(/\(\s*\)/g, ' ')                                        // emptied parens
    .replace(/\s*[-–/]\s*(?=\s|$)/g, ' ')                            // orphaned dashes
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^[^A-Za-z]+/, '');                                     // leading punctuation

  const words = t.split(/\s+/).filter(Boolean).slice(0, 7);
  let title = words.join(' ')
    .replace(/\s+(of|to|the|a|an|and|with|in|for|on|from|at|by)$/i, '')
    .trim();

  // A title that survived as one weak verb says nothing on the form.
  if (!title || title.length < 4) title = 'Assigned Output';
  return title.charAt(0).toUpperCase() + title.slice(1);
}

// ── main ─────────────────────────────────────────────────────────────────────
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
  // 1. Active cycle.
  const { data: cycle, error: cycleErr } = await supabase
    .from('performance_cycles').select('id, title').eq('status', 'Active')
    .order('id', { ascending: false }).limit(1).maybeSingle();
  if (cycleErr) throw cycleErr;
  if (!cycle) { console.error('No Active performance cycle — cannot set targets.'); process.exit(1); }
  console.log(`Cycle: ${cycle.title} (id ${cycle.id})`);

  // 2. Roster: active employees minus department heads.
  const { data: emps, error: empErr } = await supabase
    .from('employees_with_department')
    .select('id, employee_id, first_name, last_name, current_position, department, status')
    .eq('status', 'Active');
  if (empErr) throw empErr;
  const { data: heads, error: headErr } = await supabase
    .from('office_role_assignments').select('employee_id').eq('status', 'Active');
  if (headErr) throw headErr;
  const headIds = new Set((heads ?? []).map((h) => h.employee_id));
  const roster = (emps ?? []).filter((e) => !headIds.has(e.id));
  console.log(`Roster: ${roster.length} employees (excluded ${headIds.size} department heads)`);

  // 3. Baseline history, grouped per employee.
  const history = await pageAll(
    'ipcr_performance',
    'employee_num, function_type, target_text, ave_rating',
    (q) => q.eq('rating_period', BASELINE_PERIOD)
  );
  const byEmp = new Map();
  for (const r of history) {
    if (!byEmp.has(r.employee_num)) byEmp.set(r.employee_num, []);
    byEmp.get(r.employee_num).push(r);
  }
  console.log(`Baseline: ${history.length} rows from "${BASELINE_PERIOD}" across ${byEmp.size} employees`);

  // 4. Existing target settings for this cycle, so the run is idempotent.
  const existing = await pageAll('target_settings', 'id, employee_id', (q) => q.eq('cycle_id', cycle.id));
  const settingByEmp = new Map(existing.map((r) => [r.employee_id, r.id]));
  const withMfos = new Set(
    (await pageAll('mfos', 'target_setting_id')).map((m) => m.target_setting_id)
  );

  let created = 0, skipped = 0, noHistory = 0, mfoCount = 0, siCount = 0;

  for (const emp of roster) {
    const prior = byEmp.get(emp.employee_id) ?? [];
    if (!prior.length) { noHistory++; continue; }

    let settingId = settingByEmp.get(emp.id);
    if (settingId && withMfos.has(settingId)) { skipped++; continue; }

    const phase1 = PHASE1_OFFICES.has(String(emp.department ?? '').trim());
    const status = phase1 ? 'draft' : 'approved';

    // 4a. target_settings. A trigger freezes MFOs once the setting is approved,
    // so the row has to be in `draft` while its targets are written and is only
    // moved to its real status afterwards (step 4c). Existing approved rows are
    // temporarily reopened for the same reason.
    if (!settingId) {
      const { data: ins, error } = await supabase
        .from('target_settings')
        .insert({ employee_id: emp.id, cycle_id: cycle.id, status: 'draft' })
        .select('id').single();
      if (error) { console.error(`  ! ${emp.employee_id} target_settings:`, error.message); continue; }
      settingId = ins.id;
    } else {
      const { error } = await supabase
        .from('target_settings').update({ status: 'draft' }).eq('id', settingId);
      if (error) { console.error(`  ! ${emp.employee_id} reopen:`, error.message); continue; }
    }

    // 4b. One MFO + success indicator per prior function row.
    const order = { CORE: 0, STRATEGIC: 1, SUPPORT: 2 };
    const sorted = [...prior].sort((a, b) => (order[a.function_type] ?? 9) - (order[b.function_type] ?? 9));

    const mfoRows = sorted.map((p, i) => ({
      target_setting_id: settingId,
      function_type: String(p.function_type ?? 'CORE').toLowerCase(),
      title: mfoTitleFrom(p.target_text),
      sort_order: i,
    }));
    const { data: mfosIns, error: mfoErr } = await supabase.from('mfos').insert(mfoRows).select('id');
    if (mfoErr) { console.error(`  ! ${emp.employee_id} mfos:`, mfoErr.message); continue; }
    mfoCount += mfosIns.length;

    const siRows = mfosIns.map((m, i) => ({
      mfo_id: m.id,
      description: progressTargetText(sorted[i].target_text),
      sort_order: 0,
    }));
    const { error: siErr } = await supabase.from('success_indicators').insert(siRows);
    if (siErr) { console.error(`  ! ${emp.employee_id} success_indicators:`, siErr.message); continue; }
    siCount += siRows.length;

    // 4c. Now settle the real status. Legal stays draft (Phase 1 still open);
    // every other office closed Phase 1, so its targets are approved and frozen.
    // The CHECK constraint requires submitted_at once status leaves draft.
    if (!phase1) {
      const { error: apprErr } = await supabase.from('target_settings').update({
        status,
        submitted_at: '2026-01-12T01:30:00+00:00',
        reviewed_at: '2026-01-20T06:10:00+00:00',
        approved_at: '2026-01-20T06:10:00+00:00',
      }).eq('id', settingId);
      if (apprErr) { console.error(`  ! ${emp.employee_id} approve:`, apprErr.message); continue; }
    }

    created++;
    if (created % 10 === 0) console.log(`  ✓ ${created} employees`);
  }

  console.log(
    `\nDone. ${created} employees given ${cycle.title} targets ` +
    `(${mfoCount} MFOs, ${siCount} success indicators).`
  );
  console.log(`Skipped ${skipped} already-populated, ${noHistory} without baseline history.`);
}

// Allow importing the pure helpers without running the seed.
if (process.argv[1] && process.argv[1].endsWith('seed-ipcr-current-targets.mjs')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
