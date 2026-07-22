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

async function run() {
  const { data, error } = await supabase
    .from('employees')
    .select('employee_number, first_name, last_name, email, phone, current_address_street, date_of_birth, place_of_birth, sex, civil_status');
  
  if (error) {
    console.error('Error fetching employees:', error);
    return;
  }

  console.log(`Total employees in DB: ${data.length}`);
  const missingEmail = data.filter(e => !e.email);
  const missingPhone = data.filter(e => !e.phone);
  const missingAddress = data.filter(e => !e.current_address_street);
  const missingDob = data.filter(e => !e.date_of_birth);

  console.log(`Missing Email: ${missingEmail.length}`);
  console.log(`Missing Phone: ${missingPhone.length}`);
  console.log(`Missing Address: ${missingAddress.length}`);
  console.log(`Missing DOB: ${missingDob.length}`);

  console.log('\nList of first 15 employees and their contact details status:');
  data.slice(0, 15).forEach(e => {
    console.log(`${e.employee_number} | ${e.first_name} ${e.last_name} | Email: ${e.email || 'MISSING'} | Phone: ${e.phone || 'MISSING'} | Address: ${e.current_address_street ? 'OK' : 'MISSING'}`);
  });
}
run();
