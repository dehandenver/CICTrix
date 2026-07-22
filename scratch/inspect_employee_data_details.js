const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    acc[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/['"]/g, '');
  }
  return acc;
}, {});

const serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5emRmZ3hhYW93anpianB3cmlpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY5NTcwNywiZXhwIjoyMDg1MjcxNzA3fQ.ZK7i_oUHgJj2cEmDy5UDhLp50BaD_4xo6TJlLJ_iX60";
const supabase = createClient(env.VITE_SUPABASE_URL, serviceKey);

async function inspect() {
  const { data: emps, error } = await supabase
    .from('employees')
    .select('*');

  if (error) {
    console.error("Error fetching employees:", error);
    return;
  }

  console.log(`Total employees in DB: ${emps.length}`);

  const sample = emps.slice(0, 5);
  console.log("\nSample employee records (first 5):");
  sample.forEach(e => {
    console.log(`- ${e.first_name} ${e.last_name} (${e.employee_number}):`);
    console.log(`  dob: ${e.date_of_birth} | pob: ${e.place_of_birth}`);
    console.log(`  phone: ${e.phone} | email: ${e.email}`);
    console.log(`  address: ${e.current_address_street}`);
    console.log(`  sss: ${e.sss_number} | tin: ${e.tin_number} | philhealth: ${e.philhealth_number}`);
    console.log(`  emergency: ${e.emergency_contact_name} (${e.emergency_contact_relationship}): ${e.emergency_contact_phone}`);
  });

  // Count empty columns
  let emptyDob = 0;
  let emptyPob = 0;
  let emptyPhone = 0;
  let emptyAddress = 0;
  let emptySss = 0;
  let emptyTin = 0;
  let emptyPhilhealth = 0;
  let emptyPagibig = 0;
  let emptyEmergency = 0;

  emps.forEach(e => {
    if (!e.date_of_birth) emptyDob++;
    if (!e.place_of_birth) emptyPob++;
    if (!e.phone) emptyPhone++;
    if (!e.current_address_street) emptyAddress++;
    if (!e.sss_number) emptySss++;
    if (!e.tin_number) emptyTin++;
    if (!e.philhealth_number) emptyPhilhealth++;
    if (!e.pagibig_number) emptyPagibig++;
    if (!e.emergency_contact_name) emptyEmergency++;
  });

  console.log("\nStatistics of empty/missing fields across all employees:");
  console.log(`- Missing Date of Birth: ${emptyDob}/${emps.length}`);
  console.log(`- Missing Place of Birth: ${emptyPob}/${emps.length}`);
  console.log(`- Missing Phone: ${emptyPhone}/${emps.length}`);
  console.log(`- Missing Current Address Street: ${emptyAddress}/${emps.length}`);
  console.log(`- Missing SSS Number: ${emptySss}/${emps.length}`);
  console.log(`- Missing TIN Number: ${emptyTin}/${emps.length}`);
  console.log(`- Missing PhilHealth Number: ${emptyPhilhealth}/${emps.length}`);
  console.log(`- Missing Pag-IBIG Number: ${emptyPagibig}/${emps.length}`);
  console.log(`- Missing Emergency Contact Name: ${emptyEmergency}/${emps.length}`);
}

inspect();
