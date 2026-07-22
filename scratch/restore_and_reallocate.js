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

async function run() {
  console.log("=== STEP A: Remove duplicate Kristine Joy Salamanca employee record ===");
  // Delete EMP-F351BFE3 employee record
  const { error: delEmpErr } = await supabase
    .from('employees')
    .delete()
    .eq('employee_number', 'EMP-F351BFE3');
  
  if (delEmpErr) {
    console.error("Error deleting duplicate Kristine employee record:", delEmpErr);
  } else {
    console.log("Successfully deleted duplicate Kristine employee record (EMP-F351BFE3).");
  }

  // Update Kristine Joy Salamanca's applicant record to point to EMP-2026-9992
  const { error: updAppErr } = await supabase
    .from('applicants')
    .update({ employee_id: 'EMP-2026-9992' })
    .eq('email', 'kristine@gmail.com');

  if (updAppErr) {
    console.error("Error updating Kristine applicant record:", updAppErr);
  } else {
    console.log("Successfully updated Kristine applicant record to point to EMP-2026-9992.");
  }

  console.log("\n=== STEP B: Restore canonical employee positions and departments ===");
  const canonicalUpdates = [
    {
      empNum: 'EMP-7FA5BA9A',
      updates: {
        first_name: 'Cristina',
        middle_name: 'Reyes',
        last_name: 'Alonzo',
        email: 'cristina.alonzo@company.com.ph',
        position: 'Procurement Officer',
        department: 'Finance and Accounting'
      }
    },
    {
      empNum: 'EMP-2026-002',
      updates: {
        first_name: 'Antonio',
        middle_name: 'Cruz',
        last_name: 'Delgado',
        email: 'antonio.delgado@company.com.ph',
        position: 'Executive Secretary',
        department: 'Finance and Accounting'
      }
    },
    {
      empNum: 'EMP-09CC4879',
      updates: {
        first_name: 'Rogelio',
        middle_name: 'Castro',
        last_name: 'Mationg',
        email: 'rogelio.mationg@company.com.ph',
        position: 'Finance Analyst',
        department: 'Operations'
      }
    },
    {
      empNum: 'EMP-F0156D31',
      updates: {
        first_name: 'Remedios',
        middle_name: 'Cruz',
        last_name: 'Valdez',
        email: 'remedios.valdez@company.com.ph',
        position: 'Administrative Assistant',
        department: 'Administration'
      }
    },
    {
      empNum: 'EMP-2238FD0D',
      updates: {
        first_name: 'Benjamin',
        middle_name: 'Ocampo',
        last_name: 'Zamora',
        email: 'benjamin.zamora@company.com.ph',
        position: 'Operations Supervisor',
        department: 'Procurement'
      }
    }
  ];

  for (const item of canonicalUpdates) {
    const { error: updErr } = await supabase
      .from('employees')
      .update(item.updates)
      .eq('employee_number', item.empNum);

    if (updErr) {
      console.error(`Error restoring employee ${item.empNum}:`, updErr);
    } else {
      console.log(`Successfully restored ${item.updates.first_name} ${item.updates.last_name} (${item.empNum}).`);
    }
  }

  console.log("\n=== STEP C: Reallocate the 5 clashing hired applicants ===");
  const clashingApplicants = [
    {
      email: 'm@gmail.com',
      newEmpNum: 'EMP-NH-CHLOE',
      firstName: 'Chloe',
      lastName: 'FFfff',
      position: 'Computer Science Specialist',
      department: 'Information Technology',
      gender: 'Female'
    },
    {
      email: 'rodrigodutae@gmail.com',
      newEmpNum: 'EMP-NH-RODRIGO', // Assign a distinct ID for the Admin Officer III record
      firstName: 'Rodrigo',
      lastName: 'Duterte',
      position: 'Admin Officer III',
      department: 'Operations',
      gender: 'Male'
    },
    {
      email: 'skyedenver@gmail.com',
      newEmpNum: 'EMP-NH-SKYE',
      firstName: 'Skye Denver',
      lastName: 'Celeste',
      position: 'Information Technology Officer II',
      department: 'Information Technology',
      gender: 'Male'
    },
    {
      email: 'dscsd@mail.com',
      newEmpNum: 'EMP-NH-AD',
      firstName: 'ad',
      lastName: 'adc',
      position: 'Admin Officer III',
      department: 'Customer Support',
      gender: 'Other'
    },
    {
      email: 'chrispbacon.onlyfans@gmail.com',
      newEmpNum: 'EMP-NH-CHRIS',
      firstName: 'Chris',
      lastName: 'Bacon',
      position: 'Janitor',
      department: 'City Health Office',
      gender: 'Male'
    }
  ];

  // Fetch departments map
  const { data: depts } = await supabase.from('departments').select('id, name');
  const deptMap = new Map(depts.map(d => [d.name.toLowerCase().trim(), d.id]));

  for (const app of clashingApplicants) {
    // 1. Fetch applicant row by email and matching position to get specific details
    const { data: applicantRows } = await supabase
      .from('applicants')
      .select('*')
      .eq('email', app.email);

    const matchRow = (applicantRows || []).find(r => r.position === app.position) || (applicantRows || [])[0];
    if (!matchRow) {
      console.warn(`No applicant row found for ${app.firstName} ${app.lastName} (${app.email})`);
      continue;
    }

    // Double check email uniqueness constraint in employees table.
    // If the email is already in the employees table under a different ID, we must disambiguate it.
    const { data: existingEmailEmps } = await supabase
      .from('employees')
      .select('employee_number, email')
      .eq('email', app.email);

    let finalEmail = app.email;
    if (existingEmailEmps && existingEmailEmps.length > 0) {
      // Disambiguate email if it belongs to a different employee number
      const isAlreadyInUse = existingEmailEmps.some(e => e.employee_number !== app.newEmpNum);
      if (isAlreadyInUse) {
        const parts = app.email.split('@');
        finalEmail = `${parts[0]}.2@${parts[1]}`;
        console.log(`Email ${app.email} is already in use by another employee record. Using disambiguated email: ${finalEmail}`);
      }
    }

    const resolvedDeptName = app.department === 'City Health Office' ? 'Operations' : app.department;
    const deptId = deptMap.get(resolvedDeptName.toLowerCase().trim()) || null;

    const insertData = {
      employee_number: app.newEmpNum,
      first_name: matchRow.first_name || app.firstName,
      middle_name: matchRow.middle_name || '',
      last_name: matchRow.last_name || app.lastName,
      email: finalEmail,
      phone: matchRow.contact_number || null,
      current_address_street: matchRow.address || null,
      permanent_address_street: matchRow.address || null,
      sex: matchRow.gender || app.gender,
      position: app.position,
      department: resolvedDeptName,
      department_id: deptId,
      employment_status: 'Regular',
      date_hired: String(matchRow.updated_at || new Date().toISOString()).split('T')[0],
      status: 'Active',
      user_account_id: null
    };

    // Remove department_id to avoid schema cash issue if the column does not exist
    delete insertData.department_id;

    // Use insert instead of upsert for safety
    const { data: inserted, error: insErr } = await supabase
      .from('employees')
      .insert(insertData)
      .select();

    if (insErr) {
      console.error(`Error inserting reallocated employee ${app.newEmpNum}:`, insErr);
    } else {
      console.log(`Successfully inserted reallocated employee ${app.newEmpNum} for ${app.firstName} ${app.lastName}.`);
      
      // Update applicant record's employee_id to point to the new employee number
      const { error: updAppIdErr } = await supabase
        .from('applicants')
        .update({ employee_id: app.newEmpNum })
        .eq('id', matchRow.id);

      if (updAppIdErr) {
        console.error(`Error updating applicant employee_id link for ${app.newEmpNum}:`, updAppIdErr);
      } else {
        console.log(`Successfully linked applicant ID ${matchRow.id} to new employee ID ${app.newEmpNum}.`);
      }
    }
  }

  console.log("\nRestoration and reallocation completed successfully.");
}

run();
