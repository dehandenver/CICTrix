// ─────────────────────────────────────────────────────────────────────────────
// Backfill the PM Competency Map from the Summary of Ratings gap analysis.
//
// The Competency Map (position_competency_requirements) is the single source of
// truth for which competencies apply to a position and at what required level.
// Some (position, competency) pairs appear in v_competency_gap_analysis but have
// no Map row yet. This inserts those missing pairs, tagged source='auto-synced'
// so PM Admins can review them (a PM Save flips a row back to 'manual').
//
// Level = closest B/I/A tier to the numeric required the view currently emits
// for the pair (>=4.5 Advanced, >=3.5 Intermediate, else Basic).
//
// Idempotent: inserts with ON CONFLICT DO NOTHING, so re-runs and any existing
// PM-curated rows are never clobbered. Pair with the read-only auditor:
//   node scripts/audit-competency-map-sync.mjs   # 140 missing → 0 after this
//   node scripts/backfill-competency-map.mjs      # this script
//
// Requires the 20260726_competency_map_source_column.sql migration applied first.
// ─────────────────────────────────────────────────────────────────────────────
import { loadEnv, serviceClient } from './lib/ipcr-shared.mjs';

const db = serviceClient(loadEnv());
const norm = (s) => String(s ?? '').trim();
const lc = (s) => norm(s).toLowerCase();
const DRY = process.argv.includes('--dry');

/** Map the numeric required the view uses to the closest legend tier. */
function tierFor(maxRequired) {
  if (maxRequired >= 4.5) return 'Advanced';
  if (maxRequired >= 3.5) return 'Intermediate';
  return 'Basic';
}

async function main() {
  const { data: gap, error: gapErr } = await db
    .from('v_competency_gap_analysis')
    .select('position, competency_id, mapped_competency_standard, required_proficiency');
  if (gapErr) throw gapErr;

  const { data: standards, error: stdErr } = await db
    .from('competency_standards')
    .select('id');
  if (stdErr) throw stdErr;
  const validCompetencyId = new Set(standards.map((s) => s.id));

  const { data: reqs, error: reqErr } = await db
    .from('position_competency_requirements')
    .select('position_title, competency_id');
  if (reqErr) throw reqErr;

  const { data: emps, error: empErr } = await db
    .from('employees_with_department')
    .select('current_position');
  if (empErr) throw empErr;

  // Existing Map coverage + set of known positions (Map ∪ employees).
  const existing = new Set(reqs.map((r) => `${lc(r.position_title)}|${r.competency_id}`));
  const knownPositions = new Set();
  reqs.forEach((r) => knownPositions.add(lc(r.position_title)));
  emps.forEach((e) => e.current_position && knownPositions.add(lc(e.current_position)));

  // Collect missing pairs with the max numeric required the view emits for them.
  const missing = new Map(); // `${pos_lc}|${cid}` -> { position, competency_id, maxReq }
  const unmatchedPosition = new Set();
  for (const row of gap) {
    const position = norm(row.position);
    const cid = Number(row.competency_id);
    if (!position || !validCompetencyId.has(cid)) continue;

    const key = `${lc(position)}|${cid}`;
    if (existing.has(key)) continue; // already in the Map — leave it alone
    if (!knownPositions.has(lc(position))) {
      unmatchedPosition.add(`${position} · competency ${cid}`);
      continue; // flagged, not backfilled
    }

    const req = Number(row.required_proficiency) || 0;
    const cur = missing.get(key);
    if (!cur) missing.set(key, { position, competency_id: cid, maxReq: req });
    else cur.maxReq = Math.max(cur.maxReq, req);
  }

  const rows = [...missing.values()].map((m) => ({
    position_title: m.position,
    competency_id: m.competency_id,
    proficiency_level: tierFor(m.maxReq),
    source: 'auto-synced',
    updated_by: 'reconciliation:backfill-competency-map',
    updated_at: new Date().toISOString(),
  }));

  const byLevel = rows.reduce((a, r) => ((a[r.proficiency_level] = (a[r.proficiency_level] || 0) + 1), a), {});
  console.log(`Backfill targets: ${rows.length} (${JSON.stringify(byLevel)})`);
  if (unmatchedPosition.size) {
    console.log(`\n⚠️  Flagged unmatched positions (NOT backfilled): ${unmatchedPosition.size}`);
    [...unmatchedPosition].sort().forEach((p) => console.log(`   ${p}`));
  }

  if (rows.length === 0) {
    console.log('\n✅ Nothing to backfill — Map already covers every gap-analysis pair.');
    return;
  }
  if (DRY) {
    console.log('\n--dry: no writes. Rows that would be inserted:');
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  // ON CONFLICT DO NOTHING on the (position_title, competency_id) unique index —
  // never clobbers an existing manual or auto-synced row → idempotent.
  const { data: inserted, error: insErr } = await db
    .from('position_competency_requirements')
    .upsert(rows, { onConflict: 'position_title,competency_id', ignoreDuplicates: true })
    .select('position_title, competency_id');
  if (insErr) throw insErr;

  console.log(`\n✅ Inserted ${inserted?.length ?? 0} new auto-synced row(s).`);
  console.log('   Re-run scripts/audit-competency-map-sync.mjs to confirm 0 missing.');
}

main().catch((e) => { console.error(e); process.exit(1); });
