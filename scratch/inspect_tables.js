const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env', 'utf8');
const env = envContent.split('\n').reduce((acc, line) => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    acc[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/['"]/g, '');
  }
  return acc;
}, {});

const url = env.VITE_SUPABASE_URL;
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5emRmZ3hhYW93anpianB3cmlpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTY5NTcwNywiZXhwIjoyMDg1MjcxNzA3fQ.ZK7i_oUHgJj2cEmDy5UDhLp50BaD_4xo6TJlLJ_iX60';

const supabase = createClient(url, key);

async function inspectTable(tableName, textCols) {
  try {
    const { data, error } = await supabase.from(tableName).select('*').limit(1);
    if (error) {
      console.log(`Skipping table ${tableName}:`, error.message);
      return;
    }
    if (!data || data.length === 0) return;

    const cols = Object.keys(data[0]);
    const matchedCols = cols.filter(c => textCols.includes(c) || c.toLowerCase().includes('department') || c.toLowerCase().includes('office'));
    if (matchedCols.length === 0) return;

    // Search for 'office of the city accountant' case insensitively
    for (const col of matchedCols) {
      const { data: matches, error: matchErr } = await supabase
        .from(tableName)
        .select(`id, ${col}`)
        .ilike(col, '%office of the city accountant%');

      if (matchErr) {
        // Maybe there's no id column
        const { data: matchesNoId, error: matchErr2 } = await supabase
          .from(tableName)
          .select(col)
          .ilike(col, '%office of the city accountant%');
        if (matchErr2) {
          console.error(`Error querying ${tableName}.${col}:`, matchErr2.message);
        } else if (matchesNoId && matchesNoId.length > 0) {
          console.log(`Matched in table ${tableName}.${col} (no id):`, matchesNoId);
        }
      } else if (matches && matches.length > 0) {
        console.log(`Matched in table ${tableName}.${col}:`, matches);
      }
    }
  } catch (err) {
    console.error(`Error inspecting table ${tableName}:`, err.message);
  }
}

async function run() {
  const tables = [
    'employees',
    'applicants',
    'job_postings',
    'departments',
    'divisions',
    'office_role_assignments',
    'performance_evaluations',
    'raters',
    'supervisors'
  ];

  console.log('--- Inspecting tables for office names ---');
  for (const t of tables) {
    await inspectTable(t, ['department', 'office', 'office_name', 'department_name', 'target_department']);
  }
}

run();
