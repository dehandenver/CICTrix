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

const scriptContent = fs.readFileSync('scratch/update_employees.js', 'utf8');
const rawDataMatch = scriptContent.match(/const rawData = `([\s\S]*?)`;/);
if (!rawDataMatch) {
  console.error("Could not parse rawData from update_employees.js");
  process.exit(1);
}

const referenceEmployees = rawDataMatch[1]
  .split('\n')
  .map(line => line.trim())
  .filter(Boolean)
  .map(line => {
    const parts = line.split('\t');
    return {
      fullName: parts[1],
      email: parts[2],
      phone: parts[3],
      address: parts[4],
      dob: parts[5],
      pob: parts[6],
      age: parts[7],
      sex: parts[8],
      civilStatus: parts[9],
      employeeNumber: parts[10],
      position: parts[11],
      department: parts[12],
      dateHired: parts[13],
      status: parts[14]
    };
  });

async function inspect() {
  const { data: employees, error } = await supabase
    .from('employees')
    .select('*');

  if (error) {
    console.error("Error fetching employees:", error);
    return;
  }

  const dbEmpByNum = new Map(employees.map(e => [e.employee_number, e]));

  console.log("Comparing canonical employees with current database records:\n");

  let overwritesCount = 0;
  for (const ref of referenceEmployees) {
    const dbEmp = dbEmpByNum.get(ref.employeeNumber);
    if (!dbEmp) {
      console.log(`❌ Canonical employee ${ref.fullName} (${ref.employeeNumber}) is MISSING from database!`);
      continue;
    }

    const dbFullName = `${dbEmp.first_name} ${dbEmp.middle_name ? dbEmp.middle_name + ' ' : ''}${dbEmp.last_name}`.trim().replace(/\s+/g, ' ');
    const refFullName = ref.fullName.trim().replace(/\s+/g, ' ');

    if (
      dbFullName.toLowerCase() !== refFullName.toLowerCase() ||
      dbEmp.position !== ref.position ||
      dbEmp.department !== ref.department
    ) {
      console.log(`⚠️  MISMATCH/OVERWRITE DETECTED for ${ref.employeeNumber}:`);
      console.log(`   Canonical: ${refFullName} | Position: ${ref.position} | Dept: ${ref.department}`);
      console.log(`   Current:   ${dbFullName} | Position: ${dbEmp.position} | Dept: ${dbEmp.department} | Email: ${dbEmp.email}`);
      console.log();
      overwritesCount++;
    }
  }

  console.log(`Total overwrites/mismatches found: ${overwritesCount}`);
}

inspect();
