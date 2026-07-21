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
  try {
    const { data: allEmployees, error: allErr } = await supabase
      .from('employees')
      .select('employee_number, user_account_id');
    
    if (allErr) {
      console.error("Error:", allErr);
      return;
    }

    allEmployees.forEach(e => {
      if (e.user_account_id) {
        console.log(`Employee: ${e.employee_number}, user_account_id: ${e.user_account_id}`);
      }
    });

  } catch (err) {
    console.error("Unexpected error:", err);
  }
}

inspect();
