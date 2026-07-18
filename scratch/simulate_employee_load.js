const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').split('\n').reduce((acc, line) => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    acc[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/['"]/g, '');
  }
  return acc;
}, {});

const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5emRmZ3hhYW93anpianB3cmlpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY5NTcwNywiZXhwIjoyMDg1MjcxNzA3fQ.ZK7i_oUHgJj2cEmDy5UDhLp50BaD_4xo6TJlLJ_iX60';
const supabase = createClient(env.VITE_SUPABASE_URL, key);

function isPhaseScheduleOpen(row) {
  if (!row) return false;
  if (row.mode === 'Open') return true;
  if (row.mode === 'Closed') return false;
  const today = new Date().toISOString().slice(0, 10);
  if (!row.start_date || !row.deadline_date) return false;
  return today >= row.start_date && today <= row.deadline_date;
}

async function run() {
  const { data: emp } = await supabase.from('employees').select('*').eq('first_name', 'Benjamin').single();
  console.log('Employee:', emp.first_name, emp.last_name);
  console.log('employment_status:', emp.employment_status);
  console.log('date_hired:', emp.date_hired);

  let activeProbationarySchedule = null;
  if (emp.employment_status === 'Probationary' && emp.date_hired) {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const hireMonth = monthNames[new Date(emp.date_hired).getMonth()];
    const { data: schedData } = await supabase
      .from('probationary_ipcr_schedules')
      .select('*')
      .eq('hired_month', hireMonth)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (schedData) {
      activeProbationarySchedule = schedData;
    }
  }
  console.log('activeProbationarySchedule:', activeProbationarySchedule);

  let systemSchedules = { target: null, rating: null };
  if (!activeProbationarySchedule) {
    const { data: schedRows } = await supabase
      .from('phase_schedules')
      .select('*')
      .eq('scope', 'system');
    const rows = Array.isArray(schedRows) ? schedRows : [];
    systemSchedules = {
      target: rows.find((r) => r.phase === 'target_setting') ?? null,
      rating: rows.find((r) => r.phase === 'rating') ?? null,
    };
  }
  console.log('systemSchedules:', systemSchedules);

  const systemOpen = isPhaseScheduleOpen(systemSchedules.target);
  let isTargetSettingActive = systemOpen;
  if (activeProbationarySchedule) {
    const nowStr = new Date().toISOString().slice(0, 10);
    const probOpen = nowStr >= activeProbationarySchedule.target_start && nowStr <= activeProbationarySchedule.target_end;
    isTargetSettingActive = systemOpen || probOpen;
  }
  console.log('isTargetSettingActive:', isTargetSettingActive);

  const { data: activeCycle } = await supabase.from('performance_cycles').select('*').eq('status', 'Active').maybeSingle();
  console.log('Active Cycle:', activeCycle);

  const { data: settings } = await supabase
    .from('target_settings')
    .select('*')
    .eq('employee_id', emp.id)
    .eq('cycle_id', activeCycle.id)
    .limit(1);
  const setting = settings?.[0] || null;
  console.log('Target Setting for Cycle:', setting);

  const targetStatus = setting?.status ?? 'draft';
  const targetsLocked = targetStatus === 'submitted_for_approval' || targetStatus === 'approved';
  console.log('targetStatus:', targetStatus);
  console.log('targetsLocked:', targetsLocked);

  let resolvedPeriod = activeProbationarySchedule ? activeProbationarySchedule.period_label : 'July–December 2026';
  const { data: ws } = await supabase.from('ipcr_workspace').select('*').eq('employee_id', emp.id).eq('period', resolvedPeriod).maybeSingle();
  console.log('Workspace row status:', ws?.status);
  const ipcrApproved = ws ? ws.status !== 'Draft Targets' : false;
  console.log('ipcrApproved:', ipcrApproved);

  const readOnly = targetsLocked || ipcrApproved || !isTargetSettingActive;
  console.log('READ ONLY?:', readOnly);
}
run();
