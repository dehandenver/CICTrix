const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const p = line.split('='); if (p.length >= 2) acc[p[0].trim()] = p.slice(1).join('=').trim().replace(/['"]/g, ''); return acc;
}, {});
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

(async () => {
  const { data: depts } = await supabase.from('departments').select('id, name, code, head_employee_id, is_active').order('name');
  const { data: view } = await supabase.from('employees_with_department').select('id, employee_id, full_name, email, mobile_number');
  const byId = new Map((view || []).map(r => [String(r.id), r]));
  console.log('DEPT | head_employee_id | resolves? | full_name | email | mobile');
  for (const d of (depts || [])) {
    if (!d.is_active) continue;
    const h = d.head_employee_id ? byId.get(String(d.head_employee_id)) : null;
    console.log(`${d.name} | ${d.head_employee_id || 'NULL'} | ${h ? 'YES' : 'NO'} | ${h?.full_name ?? '-'} | ${h?.email || 'BLANK'} | ${h?.mobile_number || 'BLANK'}`);
  }
  // Also: do the head employees exist in base employees with an email under a different id?
  const { data: base } = await supabase.from('employees').select('id, employee_number, first_name, last_name, email, phone').limit(3);
  console.log('\nSample base rows (id vs view id shape):', base?.map(b => ({ id: b.id, email: b.email, phone: b.phone })));
})();
