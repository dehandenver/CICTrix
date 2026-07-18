const fs = require('fs');

function loadEnv(path) {
  if (!fs.existsSync(path)) return {};
  return fs.readFileSync(path, 'utf8').split('\n').reduce((acc, l) => {
    const p = l.split('=');
    if (p.length >= 2) acc[p[0].trim()] = p.slice(1).join('=').trim().replace(/['"]/g, '');
    return acc;
  }, {});
}

const env = { ...loadEnv('.env'), ...loadEnv('backend/.env') };
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Accept': 'application/openapi+json'
    }
  });
  const data = await res.json();
  if (data.paths) {
    const paths = Object.keys(data.paths);
    const rpcs = paths.filter(p => p.startsWith('/rpc/'));
    console.log('Available RPCs:', rpcs);
  } else {
    console.log('Error fetching OpenAPI schema:', data);
  }
}
run();
