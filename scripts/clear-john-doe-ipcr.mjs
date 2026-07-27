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

const JOHN_EMP_ID = '91049d39-0d27-4cfe-968f-97b8ef303323';

async function main() {
  console.log('🚀 Starting IPCR record wipe specifically for John Smith Doe (EMP-F7C22B1E)...');

  // 1. Fetch John's target_settings IDs
  const { data: tsData, error: tsErr } = await db.from('target_settings').select('id').eq('employee_id', JOHN_EMP_ID);
  if (tsErr) console.error('Error fetching target_settings:', tsErr);
  const tsIds = (tsData || []).map(t => t.id);
  console.log(`Found ${tsIds.length} target_settings row(s) for John Smith Doe.`, tsIds);

  // 2. Fetch MFOs
  let mfoIds = [];
  if (tsIds.length > 0) {
    const { data: mfos } = await db.from('mfos').select('id').in('target_setting_id', tsIds);
    mfoIds = (mfos || []).map(m => m.id);
  }
  console.log(`Found ${mfoIds.length} MFOs to delete.`);

  // 3. Fetch Success Indicators
  let siIds = [];
  if (mfoIds.length > 0) {
    const { data: sis } = await db.from('success_indicators').select('id').in('mfo_id', mfoIds);
    siIds = (sis || []).map(s => s.id);
  }
  console.log(`Found ${siIds.length} Success Indicators to delete.`);

  // 4. Delete Success Indicator Ratings
  if (siIds.length > 0) {
    const { error: delRatingsErr } = await db.from('success_indicator_ratings').delete().in('success_indicator_id', siIds);
    if (delRatingsErr) console.error('Error deleting success_indicator_ratings:', delRatingsErr);
    else console.log('✅ Deleted success_indicator_ratings.');
  }

  await db.from('success_indicator_ratings').delete().eq('rated_by', JOHN_EMP_ID);

  // 5. Delete Success Indicators
  if (siIds.length > 0) {
    const { error: delSiErr } = await db.from('success_indicators').delete().in('id', siIds);
    if (delSiErr) console.error('Error deleting success_indicators:', delSiErr);
    else console.log('✅ Deleted success_indicators.');
  }

  // 6. Delete MFOs
  if (mfoIds.length > 0) {
    const { error: delMfoErr } = await db.from('mfos').delete().in('id', mfoIds);
    if (delMfoErr) console.error('Error deleting mfos:', delMfoErr);
    else console.log('✅ Deleted mfos.');
  }

  // 7. Delete Target Settings
  const { error: delTsErr } = await db.from('target_settings').delete().eq('employee_id', JOHN_EMP_ID);
  if (delTsErr) console.error('Error deleting target_settings:', delTsErr);
  else console.log('✅ Deleted target_settings.');

  // 8. Delete Tracker Submissions
  const { error: delSubErr } = await db.from('ipcr_submissions').delete().eq('employee_id', JOHN_EMP_ID);
  if (delSubErr) console.error('Error deleting ipcr_submissions:', delSubErr);
  else console.log('✅ Deleted ipcr_submissions.');

  // 9. Delete Workspace rows if any exist
  const { error: delWsErr } = await db.from('ipcr_workspace').delete().eq('employee_id', JOHN_EMP_ID);
  if (delWsErr) console.error('Error deleting ipcr_workspace:', delWsErr);
  else console.log('✅ Checked/Deleted ipcr_workspace.');

  // 10. Delete Demo table rows if any exist
  await db.from('ipcr_schedules').delete().eq('employee_id', JOHN_EMP_ID);
  await db.from('ipcr_targets').delete().eq('employee_id', JOHN_EMP_ID);
  await db.from('ipcr_accomplishments').delete().eq('employee_id', JOHN_EMP_ID);
  await db.from('ipcr_vault').delete().eq('employee_id', JOHN_EMP_ID);
  console.log('✅ Checked/Deleted demo IPCR tables for John Smith Doe.');

  console.log('\n🎉 Wipe for John Smith Doe completed successfully!');
}

main().catch(console.error);
