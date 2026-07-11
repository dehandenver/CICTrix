// ─────────────────────────────────────────────────────────────────────────────
// Seed: historical FROZEN Phase 1 IPCR + blank Phase 2 shell for EVERY employee
//
// For each active employee (from the RSP roster) this generates a past-dated,
// already-APPROVED Phase 1 record for a completed period ("January–June 2026"),
// so "My IPCR Workspace" is populated and Phase 2 rating is demoable immediately.
//
//   * MFOs / Success Indicators are chosen from a small template library keyed
//     to the employee's job title + department keywords (payroll → Accounting,
//     helpdesk → IT, document mgmt → Records, …), with a generic fallback for
//     unmatched positions. Grouped Core / Strategic / Support like the Phase 1 UI.
//
//   * Approver (approved_by / reviewed_by) is the employee's DESIGNATED approver
//     from ipcr_designated_approvers (populated by sync-rsp-portals.mjs) — never
//     the employee themselves, even for dual-role department heads. Falls back to
//     the office Dept Head, then any other active employee.
//
//   * A believable audit trail is written (submit → optional admin_edit →
//     approve), all past-dated, into ipcr_audit_log.
//
//   * Every Success Indicator gets a matching success_indicator_ratings row with
//     Q/E/T all null and rated_by = the approver (phase2_status stays
//     'not_started'): "frozen targets, ready to be rated".
//
// Ordering respects the DB immutability trigger: children are written while the
// record is still a draft, THEN the record is flipped to approved.
//
// Idempotent. Run the sync first, then this:
//   node scripts/sync-rsp-portals.mjs
//   node scripts/seed-ipcr-historical.mjs
// ─────────────────────────────────────────────────────────────────────────────
import {
  loadEnv, serviceClient, die,
  empFullName, empNumber, empPosition, empDepartmentName,
  buildDepartmentResolver, loadActiveEmployees,
} from './lib/ipcr-shared.mjs';

const env = loadEnv();
const db = serviceClient(env);

const PERIOD = 'January–June 2026';            // en-dash form the Employee Portal uses
const CYCLE_TITLE = 'January–June 2026';
const D = {                                     // all comfortably in the past
  submitted: '2026-01-15T09:30:00+08:00',
  edited: '2026-01-18T11:00:00+08:00',
  approved: '2026-01-22T14:10:00+08:00',
};

// ── Template library: [keywords] → { core, strategic, support } ──────────────
// First group whose keyword appears in "<position> <department>" wins.
const TEMPLATES = [
  {
    keys: ['payroll', 'accounting', 'accountant', 'budget', 'finance', 'treasur', 'disburs', 'bookkeep'],
    core: [
      { title: 'Payroll & Disbursement Processing', indicators: [
        'Process payroll and disbursement vouchers within 3 working days of complete documents, with zero computation errors.',
        'Reconcile monthly financial reports against the general ledger on or before the 5th working day of the following month.',
      ] },
      { title: 'Budget Monitoring', indicators: [
        'Prepare and submit quarterly budget utilization reports with 100% accuracy against approved allotments.',
      ] },
    ],
    strategic: [
      { title: 'Financial Controls Improvement', indicators: [
        'Design and implement at least one internal control enhancement that reduces disbursement processing time by 15%.',
      ] },
    ],
    support: [
      { title: 'Audit & Compliance Support', indicators: [
        'Provide complete supporting documents to COA/internal audit within 2 working days of every request.',
      ] },
    ],
  },
  {
    keys: ['it', 'information technology', 'systems', 'helpdesk', 'help desk', 'developer', 'programmer', 'network', 'technical support', 'software'],
    core: [
      { title: 'IT Helpdesk & Systems Support', indicators: [
        'Acknowledge all helpdesk tickets within 15 minutes and resolve 90% of routine requests within the same working day.',
        'Maintain 99% uptime of core department systems across the rating period.',
      ] },
      { title: 'Systems Administration', indicators: [
        'Complete scheduled backups and security patches on all managed servers with zero missed cycles.',
      ] },
    ],
    strategic: [
      { title: 'Digital Transformation Initiative', indicators: [
        'Deliver at least one system enhancement or automation that eliminates a manual, paper-based workflow.',
      ] },
    ],
    support: [
      { title: 'End-User Enablement', indicators: [
        'Conduct at least 2 systems orientation sessions for department staff during the rating period.',
      ] },
    ],
  },
  {
    keys: ['records', 'document', 'archive', 'file', 'registry', 'records officer'],
    core: [
      { title: 'Document & Records Management', indicators: [
        'Classify, encode, and file 100% of incoming documents within 1 working day of receipt.',
        'Maintain the records inventory with zero misfiled or unaccounted documents at period-end.',
      ] },
      { title: 'Records Retrieval', indicators: [
        'Retrieve requested records and provide certified copies within 30 minutes of a valid request.',
      ] },
    ],
    strategic: [
      { title: 'Records Digitization', indicators: [
        'Digitize at least 80% of active records and index them for electronic retrieval by end of period.',
      ] },
    ],
    support: [
      { title: 'Retention & Disposal Compliance', indicators: [
        'Apply the approved records retention schedule and prepare disposal lists with zero compliance findings.',
      ] },
    ],
  },
  {
    keys: ['hr', 'human resource', 'personnel', 'recruitment', 'training', 'learning'],
    core: [
      { title: 'Personnel & 201 Files Management', indicators: [
        'Keep 201 files of all supervised staff complete with zero missing documents by period-end.',
        'Process new-hire onboarding documentation within 5 working days of the hire date.',
      ] },
      { title: 'HR Transactions', indicators: [
        'Process leave, service records, and certificate requests within 3 working days of application.',
      ] },
    ],
    strategic: [
      { title: 'Competency Development Program', indicators: [
        'Roll out a department-wide capacity-building program addressing at least 3 identified competency gaps.',
      ] },
    ],
    support: [
      { title: 'Employee Engagement', indicators: [
        'Coordinate at least 2 employee engagement or wellness activities during the rating period.',
      ] },
    ],
  },
  {
    keys: ['engineer', 'engineering', 'infrastructure', 'construction', 'maintenance', 'facilities'],
    core: [
      { title: 'Project & Infrastructure Delivery', indicators: [
        'Complete assigned inspections and technical evaluations within the committed schedule for 95% of projects.',
        'Ensure all project documentation and as-built plans are complete and accurate at turnover.',
      ] },
      { title: 'Facilities Maintenance', indicators: [
        'Respond to and act on facility maintenance requests within 1 working day of receipt.',
      ] },
    ],
    strategic: [
      { title: 'Preventive Maintenance Program', indicators: [
        'Establish and execute a preventive maintenance schedule that reduces unplanned downtime by 20%.',
      ] },
    ],
    support: [
      { title: 'Safety Compliance', indicators: [
        'Achieve zero safety violations on supervised sites across the rating period.',
      ] },
    ],
  },
  {
    keys: ['health', 'medical', 'nurse', 'clinic', 'sanitation'],
    core: [
      { title: 'Health Services Delivery', indicators: [
        'Serve all clients within the committed service standard with a client satisfaction rating of at least 90%.',
        'Maintain complete and accurate patient/health records with zero data-privacy findings.',
      ] },
      { title: 'Program Implementation', indicators: [
        'Achieve at least 90% of targeted coverage for assigned public-health programs.',
      ] },
    ],
    strategic: [
      { title: 'Preventive Health Initiative', indicators: [
        'Design and launch one preventive-health or information campaign reaching at least 500 residents.',
      ] },
    ],
    support: [
      { title: 'Inter-Agency Coordination', indicators: [
        'Submit complete health reports to partner agencies on or before every deadline.',
      ] },
    ],
  },
  {
    keys: ['planning', 'development officer', 'research', 'statist', 'analyst'],
    core: [
      { title: 'Planning & Research', indicators: [
        'Prepare assigned plans, studies, and reports with complete data and submit on or before deadline.',
        'Maintain an updated, validated dataset for the assigned program area throughout the period.',
      ] },
      { title: 'Monitoring & Evaluation', indicators: [
        'Submit accurate quarterly monitoring reports for all tracked indicators with zero data errors.',
      ] },
    ],
    strategic: [
      { title: 'Evidence-Based Policy Support', indicators: [
        'Deliver at least one policy brief or recommendation adopted by management during the period.',
      ] },
    ],
    support: [
      { title: 'Stakeholder Consultation', indicators: [
        'Facilitate at least 2 stakeholder consultations and document the results for planning use.',
      ] },
    ],
  },
  {
    keys: ['legal', 'lawyer', 'attorney', 'paralegal'],
    core: [
      { title: 'Legal Services', indicators: [
        'Review and act on contracts, opinions, and legal documents within 5 working days of referral.',
        'Maintain a complete and current docket of all assigned cases and legal matters.',
      ] },
      { title: 'Compliance Advisory', indicators: [
        'Provide legal advisories on referred matters with zero adverse findings on accuracy.',
      ] },
    ],
    strategic: [
      { title: 'Policy & Ordinance Support', indicators: [
        'Draft or review at least 2 policy/ordinance instruments adopted during the rating period.',
      ] },
    ],
    support: [
      { title: 'Legal Records Management', indicators: [
        'Keep case files and legal records complete, secure, and retrievable within 30 minutes on request.',
      ] },
    ],
  },
  {
    keys: ['admin', 'clerk', 'clerical', 'secretary', 'encoder', 'utility', 'liaison', 'receiving'],
    core: [
      { title: 'Administrative & Clerical Support', indicators: [
        'Process and route all incoming/outgoing communications within the same working day of receipt.',
        'Maintain accurate logbooks and trackers with zero unrecorded transactions at period-end.',
      ] },
      { title: 'Office Coordination', indicators: [
        'Provide timely logistical and scheduling support for all official activities with zero missed commitments.',
      ] },
    ],
    strategic: [
      { title: 'Process Improvement', indicators: [
        'Propose and implement one workflow improvement that shortens a routine transaction turnaround.',
      ] },
    ],
    support: [
      { title: 'Frontline Service', indicators: [
        'Attend to all walk-in clients within the committed service standard with courteous, accurate assistance.',
      ] },
    ],
  },
];

// Generic fallback for any position that matches no keyword group.
const GENERIC = {
  core: [
    { title: 'Core Functions Delivery', indicators: [
      'Complete 100% of assigned core tasks within the committed timeline and quality standard for the period.',
      'Maintain complete, accurate records/outputs for all assigned functions with zero unresolved backlogs at period-end.',
    ] },
    { title: 'Service Quality', indicators: [
      'Meet or exceed the office service standard for all transactions handled, with a client satisfaction rating of at least 90%.',
    ] },
  ],
  strategic: [
    { title: 'Continuous Improvement', indicators: [
      'Contribute at least one process, quality, or service improvement adopted by the office during the period.',
    ] },
  ],
  support: [
    { title: 'Team & Compliance Support', indicators: [
      'Support office reporting and compliance requirements, submitting all assigned deliverables on or before deadline.',
    ] },
  ],
};

function pickTemplate(employee) {
  const hay = `${empPosition(employee) ?? ''} ${empDepartmentName(employee) ?? ''}`.toLowerCase();
  return TEMPLATES.find((t) => t.keys.some((k) => hay.includes(k))) ?? GENERIC;
}

const flatten = (mfos) =>
  mfos.map((m) => `${m.title}\n${m.indicators.map((d) => `  - ${d}`).join('\n')}`).join('\n\n');

async function ensureCycle() {
  const existing = await db.from('performance_cycles').select('id').eq('title', CYCLE_TITLE).maybeSingle();
  if (existing.data?.id) return existing.data.id;
  const { data, error } = await db
    .from('performance_cycles')
    .insert({ title: CYCLE_TITLE, start_date: '2026-01-01', end_date: '2026-06-30', status: 'Completed' })
    .select('id')
    .single();
  if (error) die('ensure cycle failed', error);
  return data.id;
}

async function main() {
  console.log('▶ Loading roster + approver map…');
  const employees = await loadActiveEmployees(db).catch((e) => die('load employees', e));
  const resolveDept = await buildDepartmentResolver(db).catch((e) => die('load departments', e));
  const cycleId = await ensureCycle();

  const { data: approverRows } = await db
    .from('ipcr_designated_approvers')
    .select('employee_id, approver_employee_id');
  const designated = new Map((approverRows ?? []).map((r) => [String(r.employee_id), r.approver_employee_id]));

  const { data: heads } = await db
    .from('office_role_assignments')
    .select('employee_id, office_id')
    .eq('role', 'DeptHead')
    .eq('status', 'Active');
  const headByOffice = new Map((heads ?? []).filter((h) => h.office_id).map((h) => [String(h.office_id), h.employee_id ? String(h.employee_id) : null]));

  const activeIds = employees.map((e) => String(e.id));

  const resolveApprover = (e) => {
    const self = String(e.id);
    const designatedId = designated.get(self);
    if (designatedId && String(designatedId) !== self) return String(designatedId);
    const office = resolveDept(e);
    const head = office ? headByOffice.get(String(office.id)) : null;
    if (head && head !== self) return head;
    // Last resort: any other active employee (guarantees approved_by <> employee_id).
    return activeIds.find((id) => id !== self) ?? null;
  };

  let done = 0, skipped = 0, edits = 0;

  for (let idx = 0; idx < employees.length; idx++) {
    const e = employees[idx];
    const num = empNumber(e);
    const name = empFullName(e);
    const approver = resolveApprover(e);
    if (!approver) {
      console.warn(`  ⚠ ${num}: no eligible approver (only one active employee?) — skipping.`);
      skipped++;
      continue;
    }
    const office = resolveDept(e);
    const tpl = pickTemplate(e);
    const includeAdminEdit = idx % 3 === 0; // "optionally one admin edit" — realistic variety

    // 1) Parent row as DRAFT first so the immutability trigger lets us write children.
    const { data: ts, error: tsErr } = await db
      .from('target_settings')
      .upsert(
        { employee_id: e.id, cycle_id: cycleId, status: 'draft', submitted_at: D.submitted, updated_at: new Date().toISOString() },
        { onConflict: 'employee_id,cycle_id' },
      )
      .select('id')
      .single();
    if (tsErr) { console.warn(`  ⚠ ${num}: target_settings ${tsErr.message}`); skipped++; continue; }

    // 2) Replace MFOs + success indicators (children cascade off mfos).
    await db.from('mfos').delete().eq('target_setting_id', ts.id);
    const siIds = [];
    for (const fn of ['core', 'strategic', 'support']) {
      const list = tpl[fn] ?? [];
      for (let i = 0; i < list.length; i++) {
        const { data: mfoRow, error: mErr } = await db
          .from('mfos')
          .insert({ target_setting_id: ts.id, function_type: fn, title: list[i].title, sort_order: i })
          .select('id')
          .single();
        if (mErr) { console.warn(`  ⚠ ${num}: mfo ${mErr.message}`); continue; }
        const rows = list[i].indicators.map((description, j) => ({ mfo_id: mfoRow.id, description, sort_order: j }));
        const { data: siRows, error: siErr } = await db.from('success_indicators').insert(rows).select('id');
        if (siErr) { console.warn(`  ⚠ ${num}: SI ${siErr.message}`); continue; }
        for (const r of siRows ?? []) siIds.push(r.id);
      }
    }

    // 3) Blank Phase 2 rating shell — one per SI, Q/E/T null, rated_by = approver.
    if (siIds.length) {
      const ratingRows = siIds.map((sid) => ({
        success_indicator_id: sid,
        quality: null, efficiency: null, timeliness: null,
        rated_by: approver,
        updated_at: new Date().toISOString(),
      }));
      const { error: rErr } = await db
        .from('success_indicator_ratings')
        .upsert(ratingRows, { onConflict: 'success_indicator_id' });
      if (rErr) console.warn(`  ⚠ ${num}: ratings ${rErr.message}`);
    }

    // 4) Flip to APPROVED / frozen (children are now immutable). phase2_status
    //    stays 'not_started' by default.
    const { error: apErr } = await db
      .from('target_settings')
      .update({
        status: 'approved',
        submitted_at: D.submitted,
        reviewed_by: approver,
        reviewed_at: D.approved,
        approved_by: approver,
        approved_at: D.approved,
        review_comment: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ts.id);
    if (apErr) { console.warn(`  ⚠ ${num}: approve ${apErr.message}`); skipped++; continue; }

    // 5) Believable, past-dated audit trail. Reset first so re-runs don't stack.
    await db.from('ipcr_audit_log').delete().eq('target_setting_id', ts.id);
    const trail = [
      { target_setting_id: ts.id, action: 'submit', performed_by: e.id, performed_by_role: 'employee', created_at: D.submitted },
    ];
    if (includeAdminEdit) {
      trail.push({
        target_setting_id: ts.id, action: 'admin_edit', field_changed: 'success_indicator',
        old_value: '(original wording)', new_value: '(clarified by office)',
        performed_by: approver, performed_by_role: 'office_account', created_at: D.edited,
      });
      edits++;
    }
    trail.push({ target_setting_id: ts.id, action: 'approve', performed_by: approver, performed_by_role: 'office_account', created_at: D.approved });
    await db.from('ipcr_audit_log').insert(trail);

    // 6) Mirror flattened targets into ipcr_workspace so "My IPCR Workspace" and
    //    the PDF render the frozen Phase 1. Phase 2 columns stay null.
    const { error: wsErr } = await db.from('ipcr_workspace').upsert(
      {
        employee_id: e.id,
        employee_num: num,
        employee_name: name,
        office_id: office?.id ?? null,
        office_name: office?.name ?? null,
        period: PERIOD,
        status: 'Targets Submitted',
        core_target: flatten(tpl.core ?? []),
        strategic_target: flatten(tpl.strategic ?? []),
        support_target: flatten(tpl.support ?? []),
        targets_submitted_at: D.submitted,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'employee_id,period' },
    );
    if (wsErr) console.warn(`  ⚠ ${num}: workspace ${wsErr.message}`);

    done++;
    if (done % 25 === 0) console.log(`  …${done} seeded`);
  }

  console.log('\n✅ Historical seed complete.');
  console.log(`   Frozen Phase 1 records: ${done}  (with an admin edit: ${edits})`);
  if (skipped) console.log(`   Skipped: ${skipped}`);
  console.log(`   Period "${PERIOD}" · cycle #${cycleId} · Phase 2 = not_started (ready to rate).`);
}

main().catch((e) => die('unexpected error', e));
