// ─────────────────────────────────────────────────────────────────────────────
// Seed: synthetic COMPLETED Phase 2 IPCR scores for existing employees.
//
// Why: Succession Planning ranks candidates by their latest completed IPCR
// overall score. The historical seeder (seed-ipcr-historical.mjs) leaves every
// employee's Phase 2 rating shell EMPTY (Q/E/T null, phase2_status not_started),
// so with a fresh DB every candidate would fall into "Not yet rated" and the
// ranking would be blank. This script fills those existing shells with realistic,
// self-consistent Q/E/T scores and marks the record phase2_status = 'completed',
// so the drill-down has real, sortable data to rank — using the employees already
// in the system (no fictional people).
//
// What it touches:
//   * success_indicator_ratings — fills quality/efficiency/timeliness (1–5) for
//     indicators of APPROVED target_settings that aren't completed yet.
//   * target_settings           — flips phase2_status → 'completed' + timestamp.
//
// It does NOT invent employees, positions, or targets. Ranking is still derived
// LIVE from these ratings at query time (src/lib/api/succession.ts) — this only
// provides the underlying scores. Deterministic per employee, so re-runs are
// stable. Idempotent: records already 'completed' are left untouched.
//
// Run order (fresh DB):
//   node scripts/sync-rsp-portals.mjs
//   node scripts/seed-ipcr-historical.mjs
//   node scripts/seed-ipcr-scores.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { loadEnv, serviceClient, die } from './lib/ipcr-shared.mjs';

const env = loadEnv();
const db = serviceClient(env);

// ── Deterministic pseudo-random from a string, so scores are stable across runs.
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp15 = (v) => Math.max(1, Math.min(5, Math.round(v)));

async function main() {
  console.log('▶ Loading approved IPCR records…');
  const { data: settings, error: sErr } = await db
    .from('target_settings')
    .select('id, employee_id, phase2_status')
    .eq('status', 'approved');
  if (sErr) die('load target_settings failed', sErr);

  const pending = (settings ?? []).filter((s) => s.phase2_status !== 'completed');
  if (!pending.length) {
    console.log('✓ Nothing to do — every approved record is already completed.');
    return;
  }
  console.log(`  ${pending.length} approved record(s) not yet completed.`);

  const settingIds = pending.map((s) => s.id);

  // mfos → success_indicators for these settings, in one pass each.
  const { data: mfoRows } = await db
    .from('mfos')
    .select('id, target_setting_id')
    .in('target_setting_id', settingIds);
  const settingByMfo = new Map((mfoRows ?? []).map((m) => [m.id, m.target_setting_id]));
  const mfoIds = (mfoRows ?? []).map((m) => m.id);

  const siByMfo = new Map();
  if (mfoIds.length) {
    // Chunk to stay well under URL length limits on large rosters.
    for (let i = 0; i < mfoIds.length; i += 200) {
      const chunk = mfoIds.slice(i, i + 200);
      const { data: sis } = await db.from('success_indicators').select('id, mfo_id').in('mfo_id', chunk);
      for (const si of sis ?? []) {
        const list = siByMfo.get(si.mfo_id) ?? [];
        list.push(si.id);
        siByMfo.set(si.mfo_id, list);
      }
    }
  }

  // Group success-indicator ids per setting.
  const sisBySetting = new Map();
  for (const [mfoId, siIds] of siByMfo) {
    const settingId = settingByMfo.get(mfoId);
    if (!settingId) continue;
    const list = sisBySetting.get(settingId) ?? [];
    list.push(...siIds);
    sisBySetting.set(settingId, list);
  }

  const nowIso = new Date().toISOString();
  let completed = 0, skippedNoIndicators = 0;
  const ratingRows = [];
  const completedSettingIds = [];

  for (const s of pending) {
    const siIds = sisBySetting.get(s.id) ?? [];
    if (!siIds.length) { skippedNoIndicators++; continue; }

    // Employee-level base score spread across 3.4–4.9 so adjectival buckets vary
    // (Satisfactory <4.0, Very Satisfactory 4.0–4.74, Outstanding ≥4.75).
    const base = 3.4 + (hashString(String(s.employee_id)) % 155) / 100; // 3.40 … 4.94
    const rand = mulberry32(hashString(String(s.id)));
    for (const siId of siIds) {
      const jitter = () => (rand() - 0.5) * 0.9; // ±0.45
      ratingRows.push({
        success_indicator_id: siId,
        quality: clamp15(base + jitter()),
        efficiency: clamp15(base + jitter()),
        timeliness: clamp15(base + jitter()),
        updated_at: nowIso,
      });
    }
    completedSettingIds.push(s.id);
    completed++;
  }

  // Upsert ratings in chunks (preserves rated_by on existing shells).
  console.log(`▶ Writing ${ratingRows.length} indicator score(s)…`);
  for (let i = 0; i < ratingRows.length; i += 500) {
    const chunk = ratingRows.slice(i, i + 500);
    const { error } = await db
      .from('success_indicator_ratings')
      .upsert(chunk, { onConflict: 'success_indicator_id' });
    if (error) console.warn(`  ⚠ ratings chunk ${i}: ${error.message}`);
  }

  // Flip records to completed in chunks.
  console.log(`▶ Marking ${completedSettingIds.length} record(s) completed…`);
  for (let i = 0; i < completedSettingIds.length; i += 200) {
    const chunk = completedSettingIds.slice(i, i + 200);
    const { error } = await db
      .from('target_settings')
      .update({ phase2_status: 'completed', phase2_completed_at: nowIso, updated_at: nowIso })
      .in('id', chunk);
    if (error) console.warn(`  ⚠ complete chunk ${i}: ${error.message}`);
  }

  console.log(
    `\n✓ Done. ${completed} record(s) now completed with synthetic scores.` +
    (skippedNoIndicators ? ` ${skippedNoIndicators} skipped (no success indicators).` : ''),
  );
}

main().catch((e) => die('seed-ipcr-scores failed', e));
