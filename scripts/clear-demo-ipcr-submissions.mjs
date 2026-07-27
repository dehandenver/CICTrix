import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const env = Object.fromEntries(
  readFileSync(resolve('.env'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;

const db = createClient(url, key);

const TARGET_EMP_IDS = [
  '91049d39-0d27-4cfe-968f-97b8ef303323', // John Smith Doe (EMP-F7C22B1E)
  '2d8235d5-b755-4993-a1d4-a83e20277572', // Bayani Jimenez Arao (EMP-A6CFDA8C)
  '95df514a-8731-4e9f-ada7-d053c90bfd94', // Angelika Jungco Ocana (EMP-3A30FD29)
];

const TARGET_SETTING_IDS = [
  '10b36c40-f164-40e9-b660-654c3b785eaf',
  '8f9f9f20-03b5-44e2-8e41-f2e840ce0391',
  '312a8097-5dd9-45cc-b5c2-58bc11f8ad32',
];

async function main() {
  console.log('🚀 Starting IPCR record wipe for 3 demo employees...');
  console.log('Target Employees:', TARGET_EMP_IDS);
  console.log('Target Settings:', TARGET_SETTING_IDS);

  // 1. Fetch MFOs
  const { data: mfos, error: mfoErr } = await db.from('mfos').select('id').in('target_setting_id', TARGET_SETTING_IDS);
  if (mfoErr) console.error('Error fetching MFOs:', mfoErr);
  const mfoIds = (mfos || []).map(m => m.id);
  console.log(`Found ${mfoIds.length} MFOs to delete.`);

  // 2. Fetch Success Indicators
  let siIds = [];
  if (mfoIds.length > 0) {
    const { data: sis, error: siErr } = await db.from('success_indicators').select('id').in('mfo_id', mfoIds);
    if (siErr) console.error('Error fetching Success Indicators:', siErr);
    siIds = (sis || []).map(s => s.id);
  }
  console.log(`Found ${siIds.length} Success Indicators to delete.`);

  // 3. Delete Success Indicator Ratings
  if (siIds.length > 0) {
    const { error: delRatingsErr } = await db.from('success_indicator_ratings').delete().in('success_indicator_id', siIds);
    if (delRatingsErr) console.error('Error deleting success_indicator_ratings:', delRatingsErr);
    else console.log('✅ Deleted success_indicator_ratings.');
  }

  // Also check if any ratings have rated_by matching employee IDs
  const { error: delRatedByErr } = await db.from('success_indicator_ratings').delete().in('rated_by', TARGET_EMP_IDS);
  if (delRatedByErr) console.error('Error deleting ratings by rated_by:', delRatedByErr);

  // 4. Delete Success Indicators
  if (siIds.length > 0) {
    const { error: delSiErr } = await db.from('success_indicators').delete().in('id', siIds);
    if (delSiErr) console.error('Error deleting success_indicators:', delSiErr);
    else console.log('✅ Deleted success_indicators.');
  }

  // 5. Delete MFOs
  if (mfoIds.length > 0) {
    const { error: delMfoErr } = await db.from('mfos').delete().in('id', mfoIds);
    if (delMfoErr) console.error('Error deleting mfos:', delMfoErr);
    else console.log('✅ Deleted mfos.');
  }

  // 6. Delete Target Settings
  const { error: delTsErr } = await db.from('target_settings').delete().in('employee_id', TARGET_EMP_IDS);
  if (delTsErr) console.error('Error deleting target_settings:', delTsErr);
  else console.log('✅ Deleted target_settings.');

  // 7. Delete Tracker Submissions
  const { error: delSubErr } = await db.from('ipcr_submissions').delete().in('employee_id', TARGET_EMP_IDS);
  if (delSubErr) console.error('Error deleting ipcr_submissions:', delSubErr);
  else console.log('✅ Deleted ipcr_submissions.');

  // 8. Delete Workspace rows if any exist
  const { error: delWsErr } = await db.from('ipcr_workspace').delete().in('employee_id', TARGET_EMP_IDS);
  if (delWsErr) console.error('Error deleting ipcr_workspace:', delWsErr);
  else console.log('✅ Checked/Deleted ipcr_workspace.');

  // 9. Delete Demo table rows if any exist
  await db.from('ipcr_schedules').delete().in('employee_id', TARGET_EMP_IDS);
  await db.from('ipcr_targets').delete().in('employee_id', TARGET_EMP_IDS);
  await db.from('ipcr_accomplishments').delete().in('employee_id', TARGET_EMP_IDS);
  await db.from('ipcr_vault').delete().in('employee_id', TARGET_EMP_IDS);
  console.log('✅ Checked/Deleted demo IPCR tables (ipcr_schedules, ipcr_targets, ipcr_accomplishments, ipcr_vault).');

  console.log('\n🎉 Wipe completed successfully!');
}

main().catch(console.error);
