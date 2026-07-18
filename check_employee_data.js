const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fyzdfgxaaowjzbjpwrii.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5emRmZ3hhYW93anpianB3cmlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTU3MDcsImV4cCI6MjA4NTI3MTcwN30.icGGfTLcjZjm_Gowkb0zD-E-axXhZR-uNLW3MXAhfIU';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('success_indicator_ratings')
    .select('non_existent_column');
  console.log('Error object:', error);
  console.log('Type of error:', typeof error);
  console.log('Is instance of Error:', error instanceof Error);
  console.log('error.message:', error?.message);
}

run();
