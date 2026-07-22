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
  console.log("=== RLS STATE FOR employees TABLE ===");
  const { data: rlsState, error: rlsErr } = await supabase.rpc('get_rls_status_for_employees'); // We might not have this function, let's execute SQL or try direct queries
  
  // Let's run a raw query using a custom RPC or query pg_tables/pg_policies by doing an inline query if supported.
  // Wait, Supabase client doesn't support raw SQL query directly unless we call a custom RPC function or execute an SQL endpoint.
  // Let's query public tables like pg_policies or similar via POSTGREST if they are exposed, or check if there is an rpc function we can use.
  // Let's query using the REST API to see if we get RLS errors.
  
  // Let's test calling pg_policies via RPC if it exists. If not, let's write a script that does anonymous vs authenticated requests.
  
  const anonClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  
  console.log("\nTesting SELECT as anon user on employees table...");
  const { data: anonData, error: anonErr } = await anonClient
    .from('employees')
    .select('id, employee_number')
    .limit(3);
    
  if (anonErr) {
    console.log("Anon SELECT failed:", anonErr.message);
  } else {
    console.log(`Anon SELECT succeeded! Retrieved ${anonData?.length} rows:`, anonData);
  }

  console.log("\nTesting SELECT as anon user on employees_with_department view...");
  const { data: anonViewData, error: anonViewErr } = await anonClient
    .from('employees_with_department')
    .select('id, employee_id')
    .limit(3);

  if (anonViewErr) {
    console.log("Anon view SELECT failed:", anonViewErr.message);
  } else {
    console.log(`Anon view SELECT succeeded! Retrieved ${anonViewData?.length} rows:`, anonViewData);
  }
}

inspect();
