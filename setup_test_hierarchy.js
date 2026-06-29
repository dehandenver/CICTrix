const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    acc[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/['"]/g, '');
  }
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('Setting up test hierarchy...');

  const { data: emps, error } = await supabase.from('employees').select('id, employee_number, first_name, last_name');
  if (error) {
    console.error('Error fetching employees:', error);
    return;
  }

  const ajay = emps.find(e => e.first_name.includes('A-jay') || e.last_name.includes('Buenjemia'));
  const ad = emps.find(e => e.first_name.includes('ad') || e.last_name.includes('adc'));
  const angelika = emps.find(e => e.first_name.includes('Angelika') || e.last_name.includes('Ocana'));
  const rodrigo = emps.find(e => e.first_name.includes('Rodrigo') || e.last_name.includes('Duterte'));
  const sara = emps.find(e => e.first_name.includes('Sara') || e.last_name.includes('Dutae'));

  if (!ajay || !ad) {
    console.error('Could not find all test employees');
    return;
  }

  const updates = [
    { id: ad.id, reports_to: ajay.id },
    { id: angelika.id, reports_to: ad.id },
    { id: rodrigo.id, reports_to: ad.id },
    { id: sara.id, reports_to: ad.id },
  ];

  for (const update of updates) {
    const { error: updateError } = await supabase
      .from('employees')
      .update({ reports_to: update.reports_to })
      .eq('id', update.id);
    if (updateError) {
      console.error(`Error updating employee ${update.id}:`, updateError);
    } else {
      console.log(`Updated employee ${update.id} to report to ${update.reports_to}`);
    }
  }

  console.log('Hierarchy setup completed!');
}

run();
