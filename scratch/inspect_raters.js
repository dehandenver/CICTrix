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
  console.log("=== RATERS ===");
  const { data: raters, error: ratersErr } = await supabase.from('raters').select('*');
  if (ratersErr) console.error(ratersErr);
  else console.log(JSON.stringify(raters, null, 2));

  console.log("\n=== JOB POSTINGS ===");
  const { data: jobs, error: jobsErr } = await supabase.from('job_postings').select('*');
  if (jobsErr) console.error(jobsErr);
  else console.log(JSON.stringify(jobs, null, 2));

  console.log("\n=== APPLICANTS FOR CITY ENGINEER ===");
  const { data: applicants, error: appErr } = await supabase
    .from('applicants')
    .select('*');
    
  if (appErr) {
    console.error(appErr);
  } else {
    // Filter applicants that might be related to City Engineer
    const cityEngineerApps = applicants.filter(a => 
      String(a.position).toLowerCase().includes('engineer') || 
      String(a.office).toLowerCase().includes('engineer') ||
      String(a.department).toLowerCase().includes('engineer')
    );
    console.log(JSON.stringify(cityEngineerApps, null, 2));
  }
}

inspect();
