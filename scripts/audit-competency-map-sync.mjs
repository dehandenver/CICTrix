// ─────────────────────────────────────────────────────────────────────────────
// READ-ONLY audit: reconcile the Summary of Ratings gap analysis against the
// PM Competency Map (the intended single source of truth).
//
// It answers three questions with live data — writes NOTHING:
//   1. Which (position, competency) pairs appear in v_competency_gap_analysis
//      but have NO corresponding row in position_competency_requirements?
//   2. Which positions used in the gap view don't match any Competency-Map /
//      employee position at all ("unmatched position")?
//   3. What required_proficiency does the view currently emit, and does it agree
//      with the Map's Basic/Intermediate/Advanced level?
//
//   node scripts/audit-competency-map-sync.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { loadEnv, serviceClient } from './lib/ipcr-shared.mjs';

const db = serviceClient(loadEnv());
const norm = (s) => String(s ?? '').trim();
const lc = (s) => norm(s).toLowerCase();

async function main() {
  // ── pull the three surfaces ───────────────────────────────────────────────
  const { data: gap, error: gapErr } = await db
    .from('v_competency_gap_analysis')
    .select('*');
  if (gapErr) throw gapErr;

  const { data: standards, error: stdErr } = await db
    .from('competency_standards')
    .select('id, competency_name, training_stream')
    .order('id');
  if (stdErr) throw stdErr;

  const { data: reqs, error: reqErr } = await db
    .from('position_competency_requirements')
    .select('position_title, competency_id, proficiency_level');
  if (reqErr) throw reqErr;

  const { data: emps, error: empErr } = await db
    .from('employees_with_department')
    .select('current_position, department');
  if (empErr) throw empErr;

  // ── indexes ───────────────────────────────────────────────────────────────
  const stdById = new Map(standards.map((s) => [s.id, s]));
  const stdIdByName = new Map(standards.map((s) => [lc(s.competency_name), s.id]));

  // Map coverage: position(lc) -> Set(competency_id), plus level lookup
  const mapCompByPos = new Map();
  const mapLevel = new Map(); // `${pos_lc}|${competency_id}` -> level
  for (const r of reqs) {
    const p = lc(r.position_title);
    if (!mapCompByPos.has(p)) mapCompByPos.set(p, new Set());
    mapCompByPos.get(p).add(r.competency_id);
    mapLevel.set(`${p}|${r.competency_id}`, r.proficiency_level);
  }

  // Known positions: anything in the Map or held by an employee.
  const knownPositions = new Set();
  reqs.forEach((r) => knownPositions.add(lc(r.position_title)));
  emps.forEach((e) => e.current_position && knownPositions.add(lc(e.current_position)));

  // ── walk the gap view ─────────────────────────────────────────────────────
  // Distinct (position, competency-name) pairs actually shown in gap analysis,
  // with the required value(s) the view emits for them.
  const pairs = new Map(); // `${pos_lc}|${comp_lc}` -> {position, competency, requiredVals:Set, count}
  for (const row of gap) {
    const position = norm(row.position);
    const competency = norm(row.mapped_competency_standard);
    if (!position || !competency) continue;
    const key = `${lc(position)}|${lc(competency)}`;
    if (!pairs.has(key)) {
      pairs.set(key, { position, competency, requiredVals: new Set(), count: 0 });
    }
    const p = pairs.get(key);
    p.requiredVals.add(Number(row.required_proficiency));
    p.count++;
  }

  // ── classify each pair ────────────────────────────────────────────────────
  const missingFromMap = []; // pair exists, position known, but no Map row
  const unmatchedPosition = []; // position not in Map nor employees
  const unmatchedCompetency = []; // competency name not among the 12 standards
  const covered = [];

  for (const { position, competency, requiredVals, count } of pairs.values()) {
    const posLc = lc(position);
    const compId = stdIdByName.get(lc(competency));
    const reqList = [...requiredVals].sort((a, b) => a - b).join('/');

    if (compId === undefined) {
      unmatchedCompetency.push({ position, competency, reqList, count });
      continue;
    }
    if (!knownPositions.has(posLc)) {
      unmatchedPosition.push({ position, competency, compId, reqList, count });
      continue;
    }
    const hasMapRow = mapCompByPos.get(posLc)?.has(compId);
    if (hasMapRow) {
      covered.push({
        position, competency, compId, reqList, count,
        level: mapLevel.get(`${posLc}|${compId}`),
      });
    } else {
      missingFromMap.push({ position, competency, compId, reqList, count });
    }
  }

  // ── report ────────────────────────────────────────────────────────────────
  const line = '─'.repeat(78);
  console.log(`\n${line}\nCOMPETENCY MAP ⇄ SUMMARY OF RATINGS RECONCILIATION (read-only)\n${line}`);
  console.log(`gap-view rows:                 ${gap.length}`);
  console.log(`distinct (position,competency): ${pairs.size}`);
  console.log(`competency_standards:          ${standards.length}`);
  console.log(`position_competency_requirements rows: ${reqs.length}`);
  console.log(`positions in Map: ${mapCompByPos.size} · known positions (Map∪employees): ${knownPositions.size}`);

  const section = (title, rows, fmt) => {
    console.log(`\n${line}\n${title}: ${rows.length}\n${line}`);
    if (rows.length === 0) { console.log('  (none)'); return; }
    rows
      .sort((a, b) => a.position.localeCompare(b.position) || a.competency.localeCompare(b.competency))
      .forEach((r) => console.log('  ' + fmt(r)));
  };

  section('❌ MISSING FROM MAP (backfill targets)', missingFromMap,
    (r) => `[${String(r.compId).padStart(2)}] ${r.position}  ⟵  ${r.competency}  (view required=${r.reqList}, ${r.count} rows)`);

  section('⚠️  UNMATCHED POSITION (flag, do not backfill)', unmatchedPosition,
    (r) => `${r.position}  ⟵  ${r.competency}  (view required=${r.reqList}, ${r.count} rows)`);

  section('⚠️  UNMATCHED COMPETENCY NAME (not among the 12 standards)', unmatchedCompetency,
    (r) => `${r.position}  ⟵  "${r.competency}"  (view required=${r.reqList}, ${r.count} rows)`);

  section('✅ ALREADY COVERED BY MAP', covered,
    (r) => `${r.position}  ⟵  ${r.competency}  [Map=${r.level}, view required=${r.reqList}]`);

  // Machine-readable backfill payload (dedup by position+compId).
  const backfillMap = new Map();
  for (const r of missingFromMap) {
    const k = `${lc(r.position)}|${r.compId}`;
    if (!backfillMap.has(k)) {
      // Map the numeric required the view uses to the closest B/I/A tier.
      const maxReq = Math.max(...r.reqList.split('/').map(Number));
      const level = maxReq >= 4.5 ? 'Advanced' : maxReq >= 3.5 ? 'Intermediate' : 'Basic';
      backfillMap.set(k, { position_title: r.position, competency_id: r.compId, proficiency_level: level });
    }
  }
  console.log(`\n${line}\nPROPOSED BACKFILL (${backfillMap.size} rows) — JSON below\n${line}`);
  console.log(JSON.stringify([...backfillMap.values()], null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
