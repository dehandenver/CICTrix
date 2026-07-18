async function run() {
  const url = 'http://localhost:8000/api/competency-assessment/assess';
  const payload = {
    employee_id: '339a4e5a-d4d4-455d-a1e1-48f50de34595',
    cycle_id: 2
  };

  console.log('Sending request to:', url);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    console.log('Response Status:', res.status, res.statusText);
    const text = await res.text();
    console.log('Response Body:', text);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

run();
