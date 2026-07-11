// ─────────────────────────────────────────────────────────────────────────────
// Sync: RSP roster → Employee Portal + Office Account Portal
//
// Idempotent, re-runnable job. For every ACTIVE employee in the live RSP roster
// (the employees table) it guarantees:
//
//   1. an Employee Portal login (employee_portal_accounts), matched on
//      employee_number so re-runs never duplicate; existing rows keep their
//      password/username and only get missing profile fields backfilled;
//
//   2. an Office Account (office_role_assignments) IF the RSP position marks the
//      person as an approving authority — DeptHead for head/chief/director
//      titles, Supervisor for supervisor/manager titles (hybrid rule: the RSP
//      title auto-seeds the authoritative office_role_assignments table rather
//      than replacing it). Existing Active assignments are left untouched;
//
//   3. a designated approver (ipcr_designated_approvers) for their OWN IPCR —
//      their reports_to supervisor, else their office's Dept Head (a different
//      person), else "unassigned" (TBD) — plus a dual-role flag for anyone who
//      is both an employee and the Office Account over their own office.
//
// Safe to run on every roster change. Reads service creds from .env.
//
//   node scripts/sync-rsp-portals.mjs
// ─────────────────────────────────────────────────────────────────────────────
import {
  loadEnv, serviceClient, die,
  empFullName, empNumber, empPosition,
  slugify, classifyOfficeRole, buildDepartmentResolver, loadActiveEmployees,
} from './lib/ipcr-shared.mjs';

const env = loadEnv();
const db = serviceClient(env);

const nowIso = () => new Date().toISOString();
const rand4 = () => Math.floor(1000 + Math.random() * 9000);
const genPassword = () => `Cic-${Math.random().toString(36).slice(2, 8)}${rand4()}`;
const DEFAULT_PORTAL_PASSWORD = 'Cictrix@2026'; // new logins only; existing ones untouched

async function main() {
  console.log('▶ Loading RSP roster (active employees)…');
  const employees = await loadActiveEmployees(db).catch((e) => die('load employees', e));
  const resolveDept = await buildDepartmentResolver(db).catch((e) => die('load departments', e));
  console.log(`  ${employees.length} active employees.\n`);

  // Preload existing portal accounts + usernames so re-runs are idempotent and
  // generated usernames never collide.
  const { data: portalRows } = await db
    .from('employee_portal_accounts')
    .select('id, username, employee_id, full_name, email, mobile_number');
  const portalByEmpNum = new Map((portalRows ?? []).map((r) => [String(r.employee_id), r]));
  const takenUsernames = new Set((portalRows ?? []).map((r) => String(r.username ?? '').toLowerCase()));

  const uniqueUsername = (base) => {
    let u = base;
    while (!u || takenUsernames.has(u.toLowerCase())) u = `${base || 'user'}.${rand4()}`;
    takenUsernames.add(u.toLowerCase());
    return u;
  };

  const stats = { portalCreated: 0, portalBackfilled: 0, portalKept: 0, officeCreated: 0, officeKept: 0 };

  // ── Pass 1: Employee Portal accounts + Office Accounts ─────────────────────
  for (const e of employees) {
    const num = empNumber(e);
    const name = empFullName(e);
    if (!num) {
      console.warn(`  ⚠ skipping employee ${e.id} — no employee_number`);
      continue;
    }

    // 1) Employee Portal login.
    const existing = portalByEmpNum.get(num);
    if (existing) {
      const patch = {};
      if (!existing.full_name && name) patch.full_name = name;
      if (!existing.email && e.email) patch.email = e.email;
      if (!existing.mobile_number && (e.phone || e.mobile_number))
        patch.mobile_number = e.phone ?? e.mobile_number;
      if (Object.keys(patch).length) {
        patch.updated_at = nowIso();
        const { error } = await db.from('employee_portal_accounts').update(patch).eq('id', existing.id);
        if (error) console.warn(`  ⚠ backfill portal ${num}: ${error.message}`);
        else stats.portalBackfilled++;
      } else {
        stats.portalKept++;
      }
    } else {
      const username = uniqueUsername(slugify(name));
      const { error } = await db.from('employee_portal_accounts').insert({
        id: `employee-portal-${slugify(num)}`,
        username,
        password: DEFAULT_PORTAL_PASSWORD,
        employee_id: num,
        full_name: name,
        email: e.email ?? null,
        mobile_number: e.phone ?? e.mobile_number ?? null,
        updated_at: nowIso(),
      });
      if (error) console.warn(`  ⚠ create portal ${num}: ${error.message}`);
      else {
        stats.portalCreated++;
        portalByEmpNum.set(num, { employee_id: num, username });
      }
    }

    // 2) Office Account — only for approving-authority titles, into their office.
    const role = classifyOfficeRole(empPosition(e));
    const office = resolveDept(e);
    if (role && office) {
      const { data: active } = await db
        .from('office_role_assignments')
        .select('id')
        .eq('employee_id', e.id)
        .eq('office_id', office.id)
        .eq('status', 'Active')
        .maybeSingle();
      if (active) {
        stats.officeKept++;
      } else {
        const username = `${slugify(name)}.office.${rand4()}`;
        const { error } = await db.from('office_role_assignments').insert({
          employee_id: e.id,
          employee_name: name,
          office_id: office.id,
          office_name: office.name,
          role,
          account_username: username,
          account_password: genPassword(),
          must_change_password: true,
          status: 'Active',
          assigned_by: 'sync-rsp-portals',
          assigned_at: nowIso(),
        });
        if (error) console.warn(`  ⚠ create office account ${num}: ${error.message}`);
        else stats.officeCreated++;
      }
    }
  }

  // ── Rebuild office role state (existing + just-created) ────────────────────
  const { data: activeRoles } = await db
    .from('office_role_assignments')
    .select('employee_id, office_id, role')
    .eq('status', 'Active');
  const deptHeadByOffice = new Map();           // office_id → head employee uuid
  const ownOfficeRoles = new Map();             // employee uuid → Set(office_id)
  for (const r of activeRoles ?? []) {
    if (!r.office_id) continue;
    if (r.role === 'DeptHead' && !deptHeadByOffice.has(String(r.office_id)))
      deptHeadByOffice.set(String(r.office_id), r.employee_id ? String(r.employee_id) : null);
    if (r.employee_id) {
      const set = ownOfficeRoles.get(String(r.employee_id)) ?? new Set();
      set.add(String(r.office_id));
      ownOfficeRoles.set(String(r.employee_id), set);
    }
  }
  const activeEmpIds = new Set(employees.map((e) => String(e.id)));

  // ── Pass 2: designated approver + dual-role flag ───────────────────────────
  let approverRows = 0;
  const approverStats = { reports_to: 0, office_dept_head: 0, unassigned: 0, dual: 0 };
  for (const e of employees) {
    const office = resolveDept(e);
    const officeId = office?.id ? String(office.id) : null;
    const dual = officeId ? ownOfficeRoles.get(String(e.id))?.has(officeId) ?? false : false;

    let approver = null;
    let source = 'unassigned';
    const reportsTo = e.reports_to ? String(e.reports_to) : null;
    if (reportsTo && reportsTo !== String(e.id) && activeEmpIds.has(reportsTo)) {
      approver = reportsTo;
      source = 'reports_to';
    } else if (officeId) {
      const head = deptHeadByOffice.get(officeId);
      if (head && head !== String(e.id)) {
        approver = head;
        source = 'office_dept_head';
      }
    }

    const { error } = await db.from('ipcr_designated_approvers').upsert(
      {
        employee_id: e.id,
        approver_employee_id: approver,
        approver_source: source,
        is_dual_role: dual,
        office_id: officeId,
        updated_at: nowIso(),
      },
      { onConflict: 'employee_id' },
    );
    if (error) console.warn(`  ⚠ approver upsert ${empNumber(e)}: ${error.message}`);
    else {
      approverRows++;
      approverStats[source]++;
      if (dual) approverStats.dual++;
    }
  }

  console.log('\n✅ Sync complete.');
  console.log(`   Employee Portal : ${stats.portalCreated} created, ${stats.portalBackfilled} backfilled, ${stats.portalKept} unchanged`);
  console.log(`   Office Accounts  : ${stats.officeCreated} created, ${stats.officeKept} already active`);
  console.log(`   Approvers        : ${approverRows} rows (reports_to ${approverStats.reports_to}, dept-head ${approverStats.office_dept_head}, TBD ${approverStats.unassigned}); ${approverStats.dual} dual-role flagged`);
  if (approverStats.unassigned > 0)
    console.log(`   ⚠ ${approverStats.unassigned} employee(s) have no approver yet → "TBD - Assign Approver".`);
}

main().catch((e) => die('unexpected error', e));
