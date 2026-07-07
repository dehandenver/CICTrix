const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let url, key;
try {
  const backendEnvPath = path.join(__dirname, 'backend', '.env');
  const envContent = fs.readFileSync(backendEnvPath, 'utf8');
  const env = envContent.split('\n').reduce((acc, line) => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      acc[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/['"]/g, '');
    }
    return acc;
  }, {});
  url = env.SUPABASE_URL;
  key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;
} catch (e) {
  const envContent = fs.readFileSync('.env', 'utf8');
  const env = envContent.split('\n').reduce((acc, line) => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      acc[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/['"]/g, '');
    }
    return acc;
  }, {});
  url = env.VITE_SUPABASE_URL;
  key = env.VITE_SUPABASE_ANON_KEY;
}

const supabase = createClient(url, key);

async function run() {
  try {
    console.log('Querying pg_tables for RLS status...');
    
    // Query pg_tables to check row security
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT tablename, rowsecurity 
        FROM pg_tables 
        WHERE schemaname = 'public' AND tablename IN ('employees', 'office_role_assignments');
      `
    });
    
    if (error) {
      // If RPC is not available, we can try running it via raw SQL (if using service role)
      // Wait, let's see if we can do custom queries
      console.error('RPC Error:', error);
    } else {
      console.log('RLS Status:', data);
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

run();
