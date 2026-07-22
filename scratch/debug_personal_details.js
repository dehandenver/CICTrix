const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    acc[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/['"]/g, '');
  }
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const mapEmployeeRow = (row) => ({
  id: String(row?.id ?? ''),
  employeeId: String(row?.employee_id ?? ''),
  name: String(row?.full_name ?? ''),
  firstName: String(row?.first_name ?? ''),
  lastName: String(row?.last_name ?? ''),
  position: String(row?.current_position ?? ''),
  department: String(row?.department ?? row?.current_department ?? ''),
  division: row?.current_division ? String(row.current_division) : undefined,
  startDate: String(row?.hire_date ?? row?.created_at ?? ''),
  positionHistory: Array.isArray(row?.position_history) ? row.position_history : [],
});

async function run() {
  // 1. Get employees from view (getEmployeeRecordsFromSupabase)
  const { data: viewData, error: viewErr } = await supabase
    .from('employees_with_department')
    .select('*')
    .neq('status', 'Separated');
  
  if (viewErr) {
    console.error('viewErr:', viewErr);
    return;
  }
  const supabaseEmployeeRecords = viewData.map(mapEmployeeRow);

  // 2. Load portal accounts
  const { data: portalData, error: portalErr } = await supabase
    .from('employee_portal_accounts')
    .select('*, employee:profile_data'); // wait, let's see how portal accounts are loaded
  
  console.log('portalAccounts fetched:', portalData?.length || 0, portalErr || '');

  // 3. Load employeePersonalByNumber
  const { data: personalData, error: personalErr } = await supabase
    .from('employees')
    .select(
      'employee_number, first_name, middle_name, last_name, suffix, position, department, status, email, phone, current_address_street, date_of_birth, place_of_birth, sex, civil_status, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, date_hired'
    );
  if (personalErr) {
    console.error('personalErr:', personalErr);
    return;
  }
  console.log('personalData count:', personalData.length);

  const employeePersonalByNumber = new Map();
  personalData.forEach((row) => {
    const num = String(row?.employee_number ?? '').trim();
    if (num) employeePersonalByNumber.set(num, row);
  });

  // Construct fallbackEmployeeDirectorySource
  const fallbackEmployeeDirectorySource = [];
  const seenEmployeeIds = new Set();
  supabaseEmployeeRecords.forEach((record) => {
    const employeeId = String(record.employeeId ?? '').trim();
    if (!employeeId) return;
    seenEmployeeIds.add(employeeId);
    
    fallbackEmployeeDirectorySource.push({
      id: employeeId,
      employeeId,
      full_name: record.name,
      first_name: record.firstName,
      last_name: record.lastName,
      email: '',
      contact_number: '',
      position: String(record.position ?? '').trim() || 'Unassigned Position',
      office: String(record.department ?? record.division ?? '').trim() || 'Unassigned Office',
      status: 'Active',
      created_at: record.startDate,
      hire_date: record.startDate
    });
  });

  console.log('fallbackEmployeeDirectorySource count:', fallbackEmployeeDirectorySource.length);

  // Let's inspect some records
  const sampleEmp = fallbackEmployeeDirectorySource[0];
  console.log('Testing employee:', sampleEmp.full_name, 'ID:', sampleEmp.id);
  const inMap = employeePersonalByNumber.has(sampleEmp.id);
  console.log('Is ID in employeePersonalByNumber keys?', inMap);
  if (inMap) {
    const dbRecord = employeePersonalByNumber.get(sampleEmp.id);
    console.log('DB Record email:', dbRecord.email, 'phone:', dbRecord.phone, 'DOB:', dbRecord.date_of_birth);
  }
}

run();
