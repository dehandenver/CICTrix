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
  console.log("=== COLUMNS IN THE LIVE employees TABLE ===");
  const { data, error } = await supabase.rpc('execute_sql_query', {
    sql_query: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'employees';"
  });

  if (error) {
    // If the execute_sql_query RPC doesn't exist, we can try to inspect a single record or list fields from postgrest.
    console.log("RPC query failed, trying to fetch one row and list keys...");
    const { data: row, error: rowErr } = await supabase.from('employees').select('*').limit(1).maybeSingle();
    if (rowErr) {
      console.error("Error fetching single row:", rowErr);
    } else if (row) {
      console.log("Keys in employees table row:", Object.keys(row));
      console.log("Sample values:", row);
    } else {
      console.log("No rows in employees table.");
    }
  } else {
    console.log("Columns from information_schema:", data);
  }
}

inspect();
