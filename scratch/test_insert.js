const SUPABASE_URL = "https://fyzdfgxaaowjzbjpwrii.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5emRmZ3hhYW93anpianB3cmlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2OTU3MDcsImV4cCI6MjA4NTI3MTcwN30.icGGfTLcjZjm_Gowkb0zD-E-axXhZR-uNLW3MXAhfIU";

async function run() {
  const payload = {
    employee_id: "3869564c-89b0-47c7-a963-f5ed4e8b9e30",
    document_type: "Other Relevant Documents",
    document_name: "Test Doc",
    category: "hr_request",
    request_source: "LND",
    status: "Pending",
    description: "Test",
    due_date: "2026-05-30",
    requested_by: "LND Admin"
  };

  console.log("Sending payload:", payload);

  const res = await fetch(`${SUPABASE_URL}/rest/v1/employee_documents`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(payload)
  });
  
  const text = await res.text();
  console.log(`Status: ${res.status}`);
  console.log(`Response: ${text}`);
}

run();
