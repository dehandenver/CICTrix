/**
 * Give every active office an initial IPCR weighting config.
 *
 * `department_weighting_configs` has writes locked to service_role by design
 * (20260714_ipcr_target_setting.sql): a write here changes how every rating in
 * that office is computed, including cycles already rated, so it is not exposed
 * to the browser. The supported write path is the backend endpoint
 * `PUT /api/offices/{id}/weighting-config`, which does the RBAC check. This
 * script is the server-side bootstrap for the initial rows only — it uses the
 * same service-role key and opens no client path.
 *
 * Choice of split is derived from each office's actual function mix rather than
 * assigned by hand. Every one of the five offices files Core, Strategic AND
 * Support MFOs, so option A (support 0) and option B (strategic 0) would weight
 * real, rated work at zero. Option C is the only split that scores everything
 * these offices actually do. If an office's mix later loses a function type,
 * re-run to see the recommendation change, and move it with the endpoint.
 *
 * Idempotent: an office already on the recommended split is left untouched, so
 * its effective_from history isn't churned.
 *
 * Run:  node scripts/seed-office-weighting.mjs
 * Needs SUPABASE_SERVICE_ROLE_KEY in .env or backend/.env.
 */

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv(path) {
  if (!fs.existsSync(path)) return {};
  return fs.readFileSync(path, 'utf8').split('\n').reduce((acc, line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return acc;
    const i = t.indexOf('=');
    if (i < 0) return acc;
    acc[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    return acc;
  }, {});
}
const env = { ...loadEnv('.env'), ...loadEnv('backend/.env') };
const URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY;
if (!URL || !SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env / backend/.env).');
  process.exit(1);
}
const supabase = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });

async function pageAll(table, select, apply) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(select).range(from, from + 999);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

/** The split that scores every function type an office actually files. */
function recommendedCode(mix) {
  if (!mix.STRATEGIC) return 'B';   // core + support only
  if (!mix.SUPPORT) return 'A';     // strategic + core only
  return 'C';                       // all three
}

async function main() {
  const { data: departments, error: depErr } = await supabase
    .from('departments').select('id, name').eq('is_active', true).order('name');
  if (depErr) throw depErr;

  const { data: options, error: optErr } = await supabase
    .from('weighting_schema_options').select('id, code, strategic_weight, core_weight, support_weight');
  if (optErr) throw optErr;
  const optionByCode = new Map((options ?? []).map((o) => [o.code, o]));

  // Function mix per office, from real history.
  const emps = await pageAll('employees_with_department', 'employee_id, department', (q) => q.eq('status', 'Active'));
  const deptOf = new Map(emps.map((e) => [e.employee_id, e.department]));
  const perf = await pageAll('ipcr_performance', 'employee_num, function_type');
  const mixByDept = new Map();
  for (const r of perf) {
    const d = deptOf.get(r.employee_num);
    if (!d) continue;
    if (!mixByDept.has(d)) mixByDept.set(d, { CORE: 0, STRATEGIC: 0, SUPPORT: 0 });
    const m = mixByDept.get(d);
    m[r.function_type] = (m[r.function_type] ?? 0) + 1;
  }

  const active = await pageAll('department_weighting_configs', 'id, department_id, schema_option_id', (q) => q.eq('is_active', true));
  const activeByDept = new Map(active.map((c) => [c.department_id, c]));

  let set = 0, unchanged = 0;
  for (const dept of departments ?? []) {
    const mix = mixByDept.get(dept.name) ?? { CORE: 0, STRATEGIC: 0, SUPPORT: 0 };
    const code = recommendedCode(mix);
    const option = optionByCode.get(code);
    if (!option) { console.error(`  ! option ${code} missing`); continue; }

    const current = activeByDept.get(dept.id);
    if (current && current.schema_option_id === option.id) {
      console.log(`  = ${dept.name} already on ${code}`);
      unchanged++;
      continue;
    }

    // Deactivate before insert: a partial unique index permits only one active
    // config per department.
    if (current) {
      const { error } = await supabase.from('department_weighting_configs')
        .update({ is_active: false, deactivated_at: new Date().toISOString() })
        .eq('id', current.id);
      if (error) { console.error(`  ! ${dept.name} deactivate:`, error.message); continue; }
    }

    const { error } = await supabase.from('department_weighting_configs').insert({
      department_id: dept.id,
      schema_option_id: option.id,
      is_active: true,
    });
    if (error) { console.error(`  ! ${dept.name} insert:`, error.message); continue; }

    console.log(
      `  + ${dept.name} -> ${code} ` +
      `(strategic ${option.strategic_weight} / core ${option.core_weight} / support ${option.support_weight}) ` +
      `[mix core=${mix.CORE} strategic=${mix.STRATEGIC} support=${mix.SUPPORT}]`
    );
    set++;
  }

  console.log(`\nDone. ${set} offices set, ${unchanged} already correct.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
