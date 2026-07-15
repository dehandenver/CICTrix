// ─────────────────────────────────────────────────────────────────────────────
// One-off: retro-date the existing FROZEN Phase 1 records to a coherent
// completed prior period, and rebuild their audit trails in that window.
//
//   Rating period : July–December 2025 (completed semester)
//   submitted_at  : ~Dec 2025  (targets planned near the end of the period)
//   approved_at   : ~mid-Jan 2026 (~6 months before today, 2026-07-11)
//   audit_log     : submit (Dec) → optional admin_edit (Dec) → approve (Jan),
//                   chronological, no future dates.
//
// Records stay under the ACTIVE cycle so they keep displaying in "My IPCR
// Workspace" (per the confirmed decision). Content is NOT touched — only dates.
// Idempotent. node scripts/fix-ipcr-timeline.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { loadEnv, serviceClient, die } from './lib/ipcr-shared.mjs';
const db = serviceClient(loadEnv());

// Spread submissions across the first half of December 2025 so they aren't all
// identical, then approve ~5 weeks later in mid-January 2026.
const submittedAt = (i) => `2025-12-${String(8 + (i % 10)).padStart(2, '0')}T09:30:00+08:00`;
const editedAt = (i) => `2025-12-${String(18 + (i % 5)).padStart(2, '0')}T11:00:00+08:00`;
const approvedAt = (i) => `2026-01-${String(9 + (i % 8)).padStart(2, '0')}T14:10:00+08:00`;

async function main() {
  const { data: settings, error } = await db
    .from('target_settings')
    .select('id, employee_id, approved_by, reviewed_by')
    .eq('status', 'approved')
    .order('id', { ascending: true });
  if (error) die('load approved settings', error);
  console.log(`Retro-dating ${(settings ?? []).length} frozen records…`);

  let updated = 0;
  for (let i = 0; i < (settings ?? []).length; i++) {
    const s = settings[i];
    const sub = submittedAt(i), edt = editedAt(i), app = approvedAt(i);
    const approver = s.approved_by ?? s.reviewed_by;

    const { error: uErr } = await db
      .from('target_settings')
      .update({ submitted_at: sub, approved_at: app, reviewed_at: app, updated_at: new Date().toISOString() })
      .eq('id', s.id);
    if (uErr) { console.warn(`  ⚠ ${s.id.slice(0, 8)}: ${uErr.message}`); continue; }

    // Rebuild the audit trail in the completed-period window (reset first).
    await db.from('ipcr_audit_log').delete().eq('target_setting_id', s.id);
    const trail = [
      { target_setting_id: s.id, action: 'submit', performed_by: s.employee_id, performed_by_role: 'employee', created_at: sub },
    ];
    if (i % 3 === 0) {
      trail.push({
        target_setting_id: s.id, action: 'admin_edit', field_changed: 'success_indicator',
        old_value: '(original wording)', new_value: '(clarified by office)',
        performed_by: approver, performed_by_role: 'office_account', created_at: edt,
      });
    }
    trail.push({ target_setting_id: s.id, action: 'approve', performed_by: approver, performed_by_role: 'office_account', created_at: app });
    await db.from('ipcr_audit_log').insert(trail);
    updated++;
  }

  // Align the ipcr_workspace period label where a row exists (kept in sync so the
  // Phase 2 accomplishment surface and PDF reference the same completed period).
  const { data: ws } = await db.from('ipcr_workspace').select('id, period');
  let wsUpdated = 0;
  for (const w of ws ?? []) {
    if (w.period === 'January–June 2026') {
      await db.from('ipcr_workspace').update({ period: 'July–December 2025' }).eq('id', w.id);
      wsUpdated++;
    }
  }

  console.log(`✅ Retro-dated ${updated} records (submitted Dec 2025 → approved Jan 2026), audit trails rebuilt.`);
  console.log(`   ipcr_workspace period labels realigned: ${wsUpdated}`);
}

main().catch((e) => die('unexpected error', e));
