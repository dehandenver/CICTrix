import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Building2, Check, ClipboardList, Copy, History, Search, ShieldCheck, UserMinus, UserPlus, Users } from 'lucide-react';
import { AdminHeader } from '../../components/AdminHeader';
import { Dialog } from '../../components/Dialog';
import { Sidebar } from '../../components/Sidebar';
import { listDepartments, type Department } from '../../lib/api/departments';
import {
  type OfficeDirectoryRow,
  type OfficePerson,
  filterOfficeDirectory,
  getOfficeDirectory,
} from '../../lib/api/officeDirectory';
import {
  type EmployeeOption,
  type OfficeRole,
  type OfficeRoleAssignment,
  type PendingSubmission,
  ROLE_LABELS,
  createAssignment,
  getPendingSubmissions,
  listAssignments,
  listAuditTrail,
  listEmployeeOptions,
  revokeOrTransfer,
} from '../../lib/api/officeRoles';
import '../../styles/admin.css';

const ADMIN_SESSION_KEY = 'cictrix_admin_session';
const getCurrentAdminEmail = (): string => {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return 'super-admin';
    const parsed = JSON.parse(raw) as { email?: string };
    return parsed?.email || 'super-admin';
  } catch {
    return 'super-admin';
  }
};

// ── Tab / subtab definition (Module 1: System Administration) ────────────────
interface SubtabDef {
  key: string;
  label: string;
  blurb: string;
  ready?: boolean;
}
interface TabDef {
  key: string;
  label: string;
  subtabs: SubtabDef[];
}

const TABS: TabDef[] = [
  {
    key: '1.1',
    label: '1.1 Personnel & Office Registry',
    subtabs: [
      {
        key: 'office-directory',
        label: 'Office Directory',
        blurb: 'Master list of every office with its Department Head, Supervisor(s), and headcount.',
        ready: true,
      },
      {
        key: 'access-role',
        label: 'Access & Role Management',
        blurb:
          'Assign or remove Supervisor / Dept Head roles tied to an office, auto-link Office Account credentials, and reroute pending submissions via the Succession Transfer Tool.',
        ready: true,
      },
    ],
  },
  {
    key: '1.2',
    label: '1.2 Cycle & Timeline Settings',
    subtabs: [
      {
        key: 'phase-scheduler',
        label: 'Phase Scheduler',
        blurb:
          'Open/close the Target-Setting and Rating phases (system-wide or per office) with start and deadline dates. (Planned — Phase 3.)',
      },
      {
        key: 'locked-targets',
        label: 'Locked Targets Vault',
        blurb:
          'Frozen, read-only store of office-verified targets for the 6-month period; feeds the Accomplishment Rating step. (Planned — Phase 3.)',
      },
    ],
  },
  {
    key: '1.3',
    label: '1.3 Submission Compliance & Closeout',
    subtabs: [
      {
        key: 'compliance-tracker',
        label: 'Compliance Tracker',
        blurb:
          'Per-office progress: % of employees submitted vs. % of office verified, drillable and sortable. (Planned — Phase 4.)',
      },
      {
        key: 'final-closeout',
        label: 'Final Review & Closeout',
        blurb:
          'Validate that all IPCRs, the DPCR, and the OPCR are present before PM locks, timestamps, and archives the office cycle. (Planned — Phase 4.)',
      },
    ],
  },
];

export const SystemAdministrationPage = () => {
  const [activeTab, setActiveTab] = useState<string>('1.1');
  const [activeSubtab, setActiveSubtab] = useState<string>('office-directory');

  const currentTab = TABS.find((t) => t.key === activeTab) ?? TABS[0];
  const currentSubtab =
    currentTab.subtabs.find((s) => s.key === activeSubtab) ?? currentTab.subtabs[0];

  const handleTabChange = (tabKey: string) => {
    setActiveTab(tabKey);
    const tab = TABS.find((t) => t.key === tabKey);
    if (tab) setActiveSubtab(tab.subtabs[0].key);
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <AdminHeader userName="Super Admin" divisionLabel="System Administrator" />
      <div className="admin-layout">
        <Sidebar activeModule="Super" userRole="super-admin" />
        <main className="admin-content">
          <div className="admin-header">
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck size={26} />
              System Administration
            </h1>
            <p className="admin-subtitle">
              Module 1 — configure offices, roles, cycle timelines, and cycle closeout.
            </p>
          </div>

          {/* Primary tabs */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              marginTop: '16px',
              borderBottom: '1px solid #e5e7eb',
              paddingBottom: '2px',
            }}
          >
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabChange(tab.key)}
                style={{
                  padding: '10px 16px',
                  border: 'none',
                  background: 'transparent',
                  borderBottom: activeTab === tab.key ? '2px solid #363EE8' : '2px solid transparent',
                  color: activeTab === tab.key ? '#363EE8' : '#6b7280',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Subtabs */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '16px 0' }}>
            {currentTab.subtabs.map((sub) => (
              <button
                key={sub.key}
                type="button"
                onClick={() => setActiveSubtab(sub.key)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '999px',
                  border: '1px solid',
                  borderColor: activeSubtab === sub.key ? '#363EE8' : '#d1d5db',
                  background: activeSubtab === sub.key ? '#363EE8' : '#fff',
                  color: activeSubtab === sub.key ? '#fff' : '#374151',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                {sub.label}
              </button>
            ))}
          </div>

          {currentSubtab.key === 'office-directory' ? (
            <OfficeDirectory />
          ) : currentSubtab.key === 'access-role' ? (
            <AccessRoleManagement />
          ) : (
            <PlaceholderSubtab title={currentSubtab.label} blurb={currentSubtab.blurb} />
          )}
        </main>
      </div>
    </div>
  );
};

// ── Subtab: Office Directory ─────────────────────────────────────────────────
const OfficeDirectory = () => {
  const [rows, setRows] = useState<OfficeDirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      const result = await getOfficeDirectory();
      if (cancelled) return;
      if (result.ok) {
        setRows(result.data);
      } else if ('error' in result) {
        setError(result.error);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => filterOfficeDirectory(rows, search), [rows, search]);

  return (
    <div>
      {/* Search / filter bar */}
      <div style={{ position: 'relative', maxWidth: '440px', marginBottom: '16px' }}>
        <Search
          size={16}
          style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by office, Dept Head, or Supervisor name…"
          style={{
            width: '100%',
            padding: '9px 12px 9px 36px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '14px',
            outline: 'none',
          }}
        />
      </div>

      {error && (
        <div
          style={{
            margin: '16px 0',
            padding: '12px 16px',
            background: 'rgba(220, 38, 38, 0.1)',
            border: '1px solid rgba(220, 38, 38, 0.3)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontWeight: 600,
            color: '#1f2937',
          }}
        >
          <Building2 size={18} />
          Office Directory
          <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 500, color: '#6b7280' }}>
            {loading ? '' : `${filtered.length} office${filtered.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading offices…</div>
        ) : filtered.length === 0 && !error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            {rows.length === 0
              ? 'No offices found. Ensure the departments table is seeded (migration 006).'
              : 'No offices match your search.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: '#f9fafb', textAlign: 'left', color: '#6b7280' }}>
                  <th style={th}>Office</th>
                  <th style={th}>Department Head</th>
                  <th style={th}>Supervisor(s)</th>
                  <th style={{ ...th, textAlign: 'right' }}>Employees</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.officeId} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: '#1f2937' }}>{row.officeName || '—'}</div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                        {row.code}
                        {!row.isActive && ' · Inactive'}
                      </div>
                    </td>
                    <td style={td}>
                      {row.deptHead ? (
                        <PersonCell person={row.deptHead} />
                      ) : (
                        <span style={{ color: '#b45309', fontSize: '13px' }}>Unassigned</span>
                      )}
                    </td>
                    <td style={td}>
                      {row.supervisors.length === 0 ? (
                        <span style={{ color: '#b45309', fontSize: '13px' }}>None assigned</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {row.supervisors.map((sup, i) => (
                            <PersonCell key={`${row.officeId}-sup-${i}`} person={sup} />
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontWeight: 600,
                          color: '#1f2937',
                        }}
                      >
                        <Users size={14} style={{ color: '#9ca3af' }} />
                        {row.employeeCount}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ marginTop: '12px', fontSize: '12px', color: '#9ca3af' }}>
        Read-only. Roles and account status are configured under Access &amp; Role Management.
      </p>
    </div>
  );
};

const PersonCell = ({ person }: { person: OfficePerson }) => (
  <div>
    <div style={{ fontWeight: 600, color: '#1f2937' }}>{person.name}</div>
    {person.position && (
      <div style={{ fontSize: '12px', color: '#6b7280' }}>{person.position}</div>
    )}
    <div style={{ fontSize: '12px', color: '#9ca3af' }}>{person.contact}</div>
    <AccountStatusBadge status={person.accountStatus} />
  </div>
);

const AccountStatusBadge = ({ status }: { status: string }) => {
  const active = status.toLowerCase() === 'active';
  return (
    <span
      style={{
        display: 'inline-block',
        marginTop: '4px',
        padding: '1px 8px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 600,
        background: active ? 'rgba(16, 185, 129, 0.12)' : 'rgba(107, 114, 128, 0.15)',
        color: active ? '#047857' : '#4b5563',
      }}
    >
      {status}
    </span>
  );
};

// ── Subtab: Access & Role Management ─────────────────────────────────────────
const AccessRoleManagement = () => {
  const [assignments, setAssignments] = useState<OfficeRoleAssignment[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof listAuditTrail>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<OfficeRoleAssignment | null>(null);

  const reload = async () => {
    setLoading(true);
    setError('');
    const [aRes, deps, emps, aud] = await Promise.all([
      listAssignments(false),
      listDepartments(true),
      listEmployeeOptions(),
      listAuditTrail(40),
    ]);
    if (aRes.ok) setAssignments(aRes.data);
    else if ('error' in aRes) setError(aRes.error);
    setDepartments(deps.success ? deps.data : []);
    setEmployees(emps);
    setAudit(aud);
    setLoading(false);
  };

  useEffect(() => {
    void reload();
  }, []);

  const flash = (msg: string) => {
    setBanner(msg);
    setTimeout(() => setBanner(''), 6000);
  };

  return (
    <div>
      {banner && (
        <div style={bannerOk}>
          <Check size={18} />
          {banner}
        </div>
      )}
      {error && (
        <div style={bannerErr}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <p style={{ color: '#6b7280', fontSize: '14px', margin: 0, flex: 1 }}>
          Assign or remove office roles. Removing preserves history and can transfer the role plus reroute
          pending submissions to a successor.
        </p>
        <button type="button" onClick={() => setShowAdd(true)} style={primaryBtn}>
          <UserPlus size={15} />
          Add Personnel
        </button>
      </div>

      {/* Active assignments */}
      <div style={card}>
        <div style={cardHeader}>
          <Users size={18} />
          Active Role Assignments
          <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 500, color: '#6b7280' }}>
            {loading ? '' : `${assignments.length}`}
          </span>
        </div>
        {loading ? (
          <div style={emptyBox}>Loading assignments…</div>
        ) : assignments.length === 0 ? (
          <div style={emptyBox}>
            No active assignments yet. Use “Add Personnel” to assign a Supervisor or Department Head. (If this
            looks wrong, ensure migration <code>011_create_office_role_assignments.sql</code> has been run.)
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: '#f9fafb', textAlign: 'left', color: '#6b7280' }}>
                  <th style={th}>Employee</th>
                  <th style={th}>Office</th>
                  <th style={th}>Role</th>
                  <th style={th}>Office Account</th>
                  <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={td}>
                      <span style={{ fontWeight: 600, color: '#1f2937' }}>{a.employee_name || '—'}</span>
                    </td>
                    <td style={td}>{a.office_name || '—'}</td>
                    <td style={td}>
                      <span style={rolePill(a.role)}>{ROLE_LABELS[a.role]}</span>
                    </td>
                    <td style={td}>
                      <code style={{ color: '#374151' }}>{a.account_username || '—'}</code>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button type="button" onClick={() => setRemoveTarget(a)} style={dangerOutlineBtn}>
                        <UserMinus size={15} />
                        Remove / Transfer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit trail */}
      <div style={{ ...card, marginTop: '20px' }}>
        <div style={cardHeader}>
          <History size={18} />
          Access Change Audit Trail
          <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 500, color: '#6b7280' }}>
            {audit.length ? `${audit.length} recent` : ''}
          </span>
        </div>
        {audit.length === 0 ? (
          <div style={emptyBox}>No access changes recorded yet.</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: '8px 0' }}>
            {audit.map((entry) => (
              <li
                key={entry.id}
                style={{ display: 'flex', gap: '12px', padding: '10px 20px', borderTop: '1px solid #f5f5f5' }}
              >
                <span style={auditPill(entry.action)}>{entry.action}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', color: '#374151' }}>{entry.details || '—'}</div>
                  <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                    {entry.performed_by || 'unknown'} · {new Date(entry.created_at).toLocaleString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showAdd && (
        <AddPersonnelModal
          departments={departments}
          employees={employees}
          onClose={() => setShowAdd(false)}
          onDone={(msg) => {
            flash(msg);
            void reload();
          }}
        />
      )}
      {removeTarget && (
        <RemoveTransferModal
          assignment={removeTarget}
          employees={employees}
          onClose={() => setRemoveTarget(null)}
          onDone={(msg) => {
            flash(msg);
            setRemoveTarget(null);
            void reload();
          }}
        />
      )}
    </div>
  );
};

// ── Add Personnel modal ──────────────────────────────────────────────────────
const AddPersonnelModal = ({
  departments,
  employees,
  onClose,
  onDone,
}: {
  departments: Department[];
  employees: EmployeeOption[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) => {
  const [employeeId, setEmployeeId] = useState('');
  const [officeId, setOfficeId] = useState('');
  const [role, setRole] = useState<OfficeRole>('Supervisor');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [creds, setCreds] = useState<{ username: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async () => {
    setErr('');
    if (!employeeId) return setErr('Select an employee.');
    if (!officeId) return setErr('Select an office.');
    const emp = employees.find((e) => e.id === employeeId);
    const off = departments.find((d) => d.id === officeId);
    if (!emp || !off) return setErr('Invalid selection.');

    setSaving(true);
    const result = await createAssignment({
      employeeId: emp.id,
      employeeName: emp.full_name,
      officeId: off.id,
      officeName: off.name,
      role,
      performedBy: getCurrentAdminEmail(),
    });
    setSaving(false);

    if (!result.ok) return setErr('error' in result ? result.error : 'Failed to create assignment.');
    setCreds({
      username: result.assignment.account_username ?? '',
      password: result.assignment.account_password ?? '',
    });
    onDone(`✓ ${emp.full_name} assigned as ${ROLE_LABELS[role]} of ${off.name}.`);
  };

  const copy = async () => {
    if (!creds) return;
    try {
      await navigator.clipboard.writeText(`${creds.username} / ${creds.password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={creds ? 'Office Account Created' : 'Add Personnel'}>
      {!creds ? (
        <div style={{ color: 'var(--text-primary)' }}>
          <Field label="Employee">
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} style={input}>
              <option value="">Select an employee…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                  {e.department ? ` — ${e.department}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Office">
            <select value={officeId} onChange={(e) => setOfficeId(e.target.value)} style={input}>
              <option value="">Select an office…</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {!d.is_active ? ' (inactive)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value as OfficeRole)} style={input}>
              <option value="Supervisor">Supervisor</option>
              <option value="DeptHead">Department Head</option>
            </select>
          </Field>
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '-4px' }}>
            An Office Account username and temporary password will be generated automatically.
          </p>

          {err && <div style={{ ...bannerErr, margin: '12px 0 0' }}>{err}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
            <button type="button" onClick={onClose} disabled={saving} style={secondaryBtn}>
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} disabled={saving} style={primaryBtn}>
              {saving ? 'Assigning…' : 'Assign Role'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ color: 'var(--text-primary)' }}>
          <p style={{ marginBottom: '12px', lineHeight: 1.5 }}>
            Share these Office Account credentials securely — the password will not be shown again:
          </p>
          <div style={credBox}>
            <div>
              <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Username</div>
              <code style={{ fontSize: '15px', fontWeight: 700 }}>{creds.username}</code>
            </div>
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Temp password</div>
              <code style={{ fontSize: '15px', fontWeight: 700 }}>{creds.password}</code>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '16px' }}>
            <button type="button" onClick={copy} style={secondaryBtn}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Copied' : 'Copy'}
              </span>
            </button>
            <button type="button" onClick={onClose} style={primaryBtn}>
              Done
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
};

// ── Remove / Transfer modal (with Succession Transfer Tool) ──────────────────
const RemoveTransferModal = ({
  assignment,
  employees,
  onClose,
  onDone,
}: {
  assignment: OfficeRoleAssignment;
  employees: EmployeeOption[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) => {
  const [reason, setReason] = useState('');
  const [reassign, setReassign] = useState(false);
  const [successorId, setSuccessorId] = useState('');
  const [pending, setPending] = useState<PendingSubmission[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingPending, setLoadingPending] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!assignment.employee_id) return;
    let cancelled = false;
    setLoadingPending(true);
    getPendingSubmissions(assignment.employee_id)
      .then((p) => {
        if (cancelled) return;
        setPending(p);
        setSelected(new Set(p.map((x) => x.id)));
      })
      .finally(() => {
        if (!cancelled) setLoadingPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assignment.employee_id]);

  const successorOptions = employees.filter((e) => e.id !== assignment.employee_id);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    setErr('');
    const successor =
      reassign && successorId
        ? { employeeId: successorId, employeeName: employees.find((e) => e.id === successorId)?.full_name ?? '' }
        : null;

    if (reassign && !successorId) return setErr('Choose a successor, or uncheck “reassign”.');
    if (selected.size > 0 && !successor)
      return setErr('Rerouting pending submissions requires a successor. Enable reassignment or clear the selection.');

    setProcessing(true);
    const result = await revokeOrTransfer({
      assignment,
      reason,
      performedBy: getCurrentAdminEmail(),
      successor,
      rerouteSubmissionIds: successor ? Array.from(selected) : [],
    });
    setProcessing(false);

    if (!result.ok) return setErr('error' in result ? result.error : 'Failed to process the change.');

    const parts = [`✓ Access revoked for ${assignment.employee_name ?? 'the role-holder'}.`];
    if (successor) parts.push(`Role transferred to ${successor.employeeName}.`);
    if (result.rerouted > 0) parts.push(`${result.rerouted} pending submission(s) rerouted.`);
    onDone(parts.join(' '));
  };

  return (
    <Dialog open onClose={onClose} title="Remove / Transfer Role">
      <div style={{ color: 'var(--text-primary)' }}>
        <p style={{ marginBottom: '14px', lineHeight: 1.5 }}>
          Remove <strong>{assignment.employee_name}</strong> as {ROLE_LABELS[assignment.role]} of{' '}
          <strong>{assignment.office_name}</strong>? Their historical records are kept — only active access is
          revoked.
        </p>

        <Field label="Reason (resigned, reassigned, promoted…)">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            style={{ ...input, resize: 'vertical' }}
            placeholder="Optional but recommended for the audit trail"
          />
        </Field>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0 12px', cursor: 'pointer' }}>
          <input type="checkbox" checked={reassign} onChange={(e) => setReassign(e.target.checked)} />
          <span style={{ fontWeight: 600 }}>Reassign this role to a successor</span>
        </label>

        {reassign && (
          <Field label="Successor">
            <select value={successorId} onChange={(e) => setSuccessorId(e.target.value)} style={input}>
              <option value="">Select the incoming replacement…</option>
              {successorOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                  {e.department ? ` — ${e.department}` : ''}
                </option>
              ))}
            </select>
          </Field>
        )}

        {/* Succession Transfer Tool */}
        <div style={{ ...card, marginTop: '8px' }}>
          <div style={{ ...cardHeader, padding: '12px 16px' }}>
            <ClipboardList size={16} />
            Succession Transfer Tool
            <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 500, color: '#6b7280' }}>
              {loadingPending ? '' : `${pending.length} pending`}
            </span>
          </div>
          <div style={{ padding: '12px 16px' }}>
            {loadingPending ? (
              <div style={{ color: '#6b7280', fontSize: '13px' }}>Checking pending submissions…</div>
            ) : pending.length === 0 ? (
              <div style={{ color: '#6b7280', fontSize: '13px' }}>
                No pending or in-progress submissions await this role-holder. Nothing to reroute.
              </div>
            ) : (
              <>
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: 0, marginBottom: '10px' }}>
                  Select the items to reroute to the successor so nothing gets stuck mid-cycle.
                </p>
                {pending.map((p) => (
                  <label
                    key={p.id}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', cursor: 'pointer' }}
                  >
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                    <span style={{ fontSize: '13px' }}>
                      <strong>{p.kind}</strong> — {p.employeeName} · {p.period}{' '}
                      <span style={{ color: '#9ca3af' }}>({p.status})</span>
                    </span>
                  </label>
                ))}
              </>
            )}
          </div>
        </div>

        {err && <div style={{ ...bannerErr, margin: '12px 0 0' }}>{err}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
          <button type="button" onClick={onClose} disabled={processing} style={secondaryBtn}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={processing} style={dangerBtn}>
            {processing ? 'Processing…' : 'Confirm'}
          </button>
        </div>
      </div>
    </Dialog>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: '14px' }}>
    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
      {label}
    </label>
    {children}
  </div>
);

// ── Placeholder for not-yet-built subtabs ────────────────────────────────────
const PlaceholderSubtab = ({ title, blurb }: { title: string; blurb: string }) => (
  <div
    style={{
      background: '#fff',
      border: '1px dashed #d1d5db',
      borderRadius: '12px',
      padding: '40px',
      textAlign: 'center',
    }}
  >
    <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937', marginBottom: '8px' }}>{title}</h3>
    <p style={{ color: '#6b7280', maxWidth: '640px', margin: '0 auto', lineHeight: 1.5 }}>{blurb}</p>
  </div>
);

const th: React.CSSProperties = {
  padding: '12px 16px',
  fontWeight: 600,
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: '14px 16px',
  color: '#374151',
  verticalAlign: 'top',
};

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  overflow: 'hidden',
};

const cardHeader: React.CSSProperties = {
  padding: '16px 20px',
  borderBottom: '1px solid #e5e7eb',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  fontWeight: 600,
  color: '#1f2937',
};

const emptyBox: React.CSSProperties = {
  padding: '32px',
  textAlign: 'center',
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: 1.5,
};

const input: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
  background: '#fff',
  color: '#111827',
};

const credBox: React.CSSProperties = {
  background: '#f3f4f6',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '12px 14px',
};

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '9px 16px',
  background: '#363EE8',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const secondaryBtn: React.CSSProperties = {
  padding: '9px 16px',
  background: '#fff',
  color: '#374151',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
};

const dangerBtn: React.CSSProperties = {
  padding: '9px 16px',
  background: '#dc2626',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
};

const dangerOutlineBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '7px 14px',
  background: '#fff',
  color: '#b91c1c',
  border: '1px solid #fca5a5',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const bannerOk: React.CSSProperties = {
  margin: '0 0 16px',
  padding: '12px 16px',
  background: 'rgba(40, 167, 69, 0.1)',
  border: '1px solid rgba(40, 167, 69, 0.3)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '14px',
};

const bannerErr: React.CSSProperties = {
  margin: '0 0 16px',
  padding: '12px 16px',
  background: 'rgba(220, 38, 38, 0.1)',
  border: '1px solid rgba(220, 38, 38, 0.3)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '14px',
};

const rolePill = (role: OfficeRole): React.CSSProperties => ({
  display: 'inline-block',
  padding: '2px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 600,
  background: role === 'DeptHead' ? 'rgba(124, 58, 237, 0.12)' : 'rgba(54, 62, 232, 0.1)',
  color: role === 'DeptHead' ? '#6d28d9' : '#363EE8',
});

const auditPill = (action: string): React.CSSProperties => {
  const map: Record<string, string> = {
    assign: '#047857',
    transfer: '#2563eb',
    revoke: '#b91c1c',
    reroute: '#b45309',
  };
  const color = map[action] ?? '#4b5563';
  return {
    display: 'inline-block',
    padding: '1px 8px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    background: `${color}1a`,
    color,
    height: 'fit-content',
    whiteSpace: 'nowrap',
  };
};
