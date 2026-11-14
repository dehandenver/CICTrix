import { useBackClosesView } from '../../hooks/useHistoryBack';
import { BackButton } from '../../components/BackButton';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getAdminEmail } from '../../lib/adminSession';
import { AlertCircle, Building2, Check, CheckCircle2, ClipboardList, History, Search, ShieldCheck, UserMinus, UserPlus, Users, X } from 'lucide-react';
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
  OFFICE_HEAD_POSITIONS,
  ROLE_LABELS,
  createAssignment,
  getPendingSubmissions,
  listAssignments,
  listAuditTrail,
  listEmployeeOptions,
  revokeOrTransfer,
} from '../../lib/api/officeRoles';
import '../../styles/admin.css';
import { SkeletonList, useTableLoading } from '../../components/table-loading';
import { ConfirmModal } from '../../components/modal';

// Session lives in the shared per-tab module so every screen reads one identity.
const getCurrentAdminEmail = (): string => getAdminEmail();



export const SystemAdministrationPage = () => {
  const [activeTab, setActiveTab] = useState<'directory' | 'access-roles'>('directory');

  return (
    <div className="min-h-screen bg-[var(--bg-page)] ds-remap abyan-tokens">
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
              {activeTab === 'directory'
                ? 'Master list of offices, department heads, supervisors, and headcount.'
                : 'Assign or remove department heads, manage office access, and handle succession transfers.'}
            </p>
          </div>

          <div className="mb-6">
            <div className="inline-flex bg-slate-100 p-1 rounded-xl gap-1 border border-slate-200/60">
              <button
                type="button"
                onClick={() => setActiveTab('directory')}
                className={
                  activeTab === 'directory'
                    ? 'px-4 py-2 text-sm font-bold text-[#040E6B] bg-white rounded-lg shadow-sm border border-slate-200/50 transition-all'
                    : 'px-4 py-2 text-sm font-semibold text-slate-600 rounded-lg hover:text-slate-900 transition-colors'
                }
              >
                Office Directory
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('access-roles')}
                className={
                  activeTab === 'access-roles'
                    ? 'px-4 py-2 text-sm font-bold text-[#040E6B] bg-white rounded-lg shadow-sm border border-slate-200/50 transition-all'
                    : 'px-4 py-2 text-sm font-semibold text-slate-600 rounded-lg hover:text-slate-900 transition-colors'
                }
              >
                Access & Role Management
              </button>
            </div>
          </div>

          {activeTab === 'directory' ? <OfficeDirectory /> : <AccessRoleManagement />}
        </main>
      </div>
    </div>
  );
};

// ── Subtab: Office Directory ─────────────────────────────────────────────────
const OfficeDirectory = () => {
  const [rows, setRows] = useState<OfficeDirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const officesLoad = useTableLoading(loading, rows.length > 0);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [drillOfficeRow, setDrillOfficeRow] = useState<OfficeDirectoryRow | null>(null);
  useBackClosesView(drillOfficeRow !== null, () => setDrillOfficeRow(null), 'sysadmin-office');

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
    return () => { cancelled = true; };
  }, []);

  const handleOfficeClick = (row: OfficeDirectoryRow) => {
    setDrillOfficeRow(row);
  };

  const getOfficeDirInitials = (name: string): string => {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '??';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const filtered = useMemo(() => filterOfficeDirectory(rows, search), [rows, search]);

  if (drillOfficeRow !== null) {
    return (
      <div>
        <BackButton className="mb-4" onBack={() => setDrillOfficeRow(null)} />

        <div style={{ background: '#fff', border: '1px solid var(--neutral-200)', borderRadius: '12px', overflow: 'hidden', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700, fontSize: '20px', color: 'var(--neutral-800)', marginBottom: '4px' }}>
            <Building2 size={24} className="text-[#363EE8]" />
            {drillOfficeRow.officeName}
          </div>
          <p style={{ fontSize: '14px', color: 'var(--neutral-600)', marginTop: 0, marginBottom: '24px' }}>
            {drillOfficeRow.employeeCount} employee{drillOfficeRow.employeeCount !== 1 ? 's' : ''}
          </p>

          {/* Department Head Card */}
          <div style={{ background: 'var(--bg-page)', border: '1px solid var(--neutral-200)', borderRadius: '12px', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#dbeafe', color: '#1e40af', display: 'flex', alignItems: 'center', fontWeight: 700, fontSize: '18px', justifyContent: 'center' }}>
              {drillOfficeRow.deptHead ? getOfficeDirInitials(drillOfficeRow.deptHead.name) : 'DH'}
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: 'var(--neutral-400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Department Head</p>
              {drillOfficeRow.deptHead ? (
                <>
                  <p style={{ margin: '4px 0 0 0', fontSize: '16px', fontWeight: 700, color: 'var(--neutral-800)' }}>{drillOfficeRow.deptHead.name}</p>
                  <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: 'var(--neutral-600)' }}>
                    {drillOfficeRow.deptHead.position} · {drillOfficeRow.deptHead.contact}
                  </p>
                </>
              ) : (
                <p style={{ margin: '4px 0 0 0', fontSize: '14px', fontWeight: 600, color: 'var(--warning-700)' }}>Unassigned</p>
              )}
            </div>
            {drillOfficeRow.deptHead && (
              <div style={{ marginLeft: 'auto' }}>
                <AccountStatusBadge status={drillOfficeRow.deptHead.accountStatus} />
              </div>
            )}
          </div>

          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--neutral-800)', marginBottom: '16px', marginTop: 0 }}>Divisions & Assigned Supervisors</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
            {drillOfficeRow.divisions.map((div, idx) => (
              <div key={idx} style={{ background: '#fff', border: '1px solid var(--neutral-200)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
                <div>
                  <div style={{ borderBottom: '1px solid var(--bg-page)', paddingBottom: '12px', marginBottom: '16px' }}>
                    <h4 style={{ margin: 0, fontWeight: 700, color: 'var(--neutral-800)', fontSize: '14px' }}>{div.name}</h4>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <p style={{ margin: 0, fontSize: '10px', fontWeight: 600, color: 'var(--neutral-400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Supervisors</p>
                    {div.supervisors.length === 0 ? (
                      <div style={{ background: 'var(--warning-100)', border: '1px solid var(--warning-100)', borderRadius: '8px', padding: '12px', color: 'var(--warning-700)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertCircle size={16} style={{ color: 'var(--warning-500)', flexShrink: 0 }} />
                        <span>No supervisors assigned to this division.</span>
                      </div>
                    ) : (
                      div.supervisors.map((sup, sIdx) => {
                        const initials = getOfficeDirInitials(sup.name);
                        return (
                          <div key={sIdx} style={{ display: 'flex', alignItems: 'start', gap: '12px', padding: '10px', borderRadius: '8px', border: '1px solid var(--bg-page)', background: '#fafafa' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '4px', background: '#3b82f6', color: '#fff', fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {initials}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <p style={{ margin: 0, fontWeight: 600, color: 'var(--neutral-800)', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sup.name}</p>
                              <p style={{ margin: '2px 0 0 0', color: 'var(--neutral-600)', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sup.position || 'Supervisor'}</p>
                              <p style={{ margin: '2px 0 0 0', color: 'var(--neutral-400)', fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sup.contact}</p>
                              <div style={{ marginTop: '8px' }}>
                                <AccountStatusBadge status={sup.accountStatus} />
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Search / filter bar */}
      <div style={{ position: 'relative', maxWidth: '440px', marginBottom: '16px' }}>
        <Search
          size={16}
          style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--neutral-400)' }}
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by office, Dept Head, or Supervisor name…"
          style={{
            width: '100%',
            padding: '9px 12px 9px 36px',
            border: '1px solid var(--neutral-200)',
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

      <div style={{ background: '#fff', border: '1px solid var(--neutral-200)', borderRadius: '12px', overflow: 'hidden' }}>
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--neutral-200)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontWeight: 600,
            color: 'var(--neutral-800)',
          }}
        >
          <Building2 size={18} />
          Office Directory
          <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 500, color: 'var(--neutral-600)' }}>
            {officesLoad.initialLoading ? '' : `${filtered.length} office${filtered.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {officesLoad.initialLoading ? (
          <SkeletonList show={officesLoad.showSkeleton} label="Loading offices…" />
        ) : filtered.length === 0 && !error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--neutral-600)' }}>
            {rows.length === 0
              ? 'No offices found. Ensure the departments table is seeded (migration 006).'
              : 'No offices match your search.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div className="abyan-table-wrap is-flush"><table className="abyan-table">
              <thead>
                <tr>
                  <th style={th}>Office</th>
                  <th style={th}>Department Head</th>
                  <th style={{ ...th, textAlign: 'right' }}>Employees</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.officeId}
                    onClick={() => handleOfficeClick(row)}
                    style={{ borderTop: '1px solid var(--neutral-200)', cursor: 'pointer' }}
                    className="hover:bg-blue-50/40"
                  >
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: '#363EE8' }}>{row.officeName || '—'}</div>
                      <div style={{ fontSize: '14px', color: '#515F69', marginTop: '2px' }}>
                        {row.code}
                        {!row.isActive && ' · Inactive'}
                      </div>
                    </td>
                    <td style={td}>
                      {row.deptHead ? (
                        <PersonCell person={row.deptHead} />
                      ) : (
                        <span style={{ color: 'var(--warning-700)', fontSize: '14px' }}>Unassigned</span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontWeight: 600,
                          color: 'var(--neutral-800)',
                        }}
                      >
                        <Users size={14} style={{ color: '#515F69' }} />
                        {row.employeeCount}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        )}
      </div>

      <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--neutral-400)' }}>
        Click an office row to view all divisions and assigned supervisors.
      </p>
    </div>
  );
};

const PersonCell = ({ person }: { person: OfficePerson }) => (
  <div>
    <div style={{ fontWeight: 600, color: 'var(--neutral-800)' }}>{person.name}</div>
    {person.position && (
      <div style={{ fontSize: '12px', color: 'var(--neutral-600)' }}>{person.position}</div>
    )}
    <div style={{ fontSize: '12px', color: 'var(--neutral-400)' }}>{person.contact}</div>
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
        color: active ? '#047857' : 'var(--neutral-600)',
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
  const assignmentsLoad = useTableLoading(loading, assignments.length > 0);
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
        <p style={{ color: 'var(--neutral-600)', fontSize: '14px', margin: 0, flex: 1 }}>
          Assign or remove office roles. Removing preserves history and can transfer the role plus reroute
          pending submissions to a successor.
        </p>
        <button type="button" onClick={() => setShowAdd(true)} style={{ ...primaryBtn, borderRadius: '999px' }}>
          <UserPlus size={15} />
          Appoint Department Head
        </button>
      </div>

      {/* Active assignments */}
      <div style={card}>
        <div style={cardHeader}>
          <Users size={18} />
          Active Role Assignments
          <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 500, color: 'var(--neutral-600)' }}>
            {assignmentsLoad.initialLoading ? '' : `${assignments.length}`}
          </span>
        </div>
        {assignmentsLoad.initialLoading ? (
          <SkeletonList show={assignmentsLoad.showSkeleton} label="Loading assignments…" />
        ) : assignments.length === 0 ? (
          <div style={emptyBox}>
            No active assignments yet. Use “Add Personnel” to assign a Supervisor or Department Head. (If this
            looks wrong, ensure migration <code>011_create_office_role_assignments.sql</code> has been run.)
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div className="abyan-table-wrap is-flush"><table className="abyan-table">
              <thead>
                <tr>
                  <th style={th}>Employee</th>
                  <th style={th}>Office</th>
                  <th style={th}>Role</th>
                  <th style={th}>Office Account</th>
                  <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id}>
                    <td style={td}>
                      <span style={{ fontWeight: 600, color: 'var(--neutral-800)' }}>{a.employee_name || '—'}</span>
                    </td>
                    <td style={td}>{a.office_name || '—'}</td>
                    <td style={td}>
                      <span style={rolePill(a.role)}>{ROLE_LABELS[a.role]}</span>
                    </td>
                    <td style={td}>
                      <code style={{ color: 'var(--neutral-800)' }}>{a.account_username || '—'}</code>
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
            </table></div>
          </div>
        )}
      </div>

      {/* Audit trail */}
      <div style={{ ...card, marginTop: '20px' }}>
        <div style={cardHeader}>
          <History size={18} />
          Access Change Audit Trail
          <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 500, color: 'var(--neutral-600)' }}>
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
                  <div style={{ fontSize: '13px', color: 'var(--neutral-800)' }}>{entry.details || '—'}</div>
                  <div style={{ fontSize: '12px', color: 'var(--neutral-400)', marginTop: '2px' }}>
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
          assignments={assignments}
          onOpenTransfer={(assignment) => {
            setShowAdd(false);
            setRemoveTarget(assignment);
          }}
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

// ── Appoint Department Head Modal & Helpers ─────────────────────────────────
const getPersonInitials = (name: string): string => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const getAvatarColor = (name: string): string => {
  const colors = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#4f46e5'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export interface SearchableEmployeeComboboxProps {
  employees: EmployeeOption[];
  selectedEmployee: EmployeeOption | null;
  selectedOfficeName?: string;
  onSelect: (emp: EmployeeOption | null) => void;
  disabled?: boolean;
}

export const SearchableEmployeeCombobox: React.FC<SearchableEmployeeComboboxProps> = ({
  employees,
  selectedEmployee,
  selectedOfficeName,
  onSelect,
  disabled,
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cleanQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!cleanQuery) return employees;
    return employees.filter((e) => {
      const name = e.full_name?.toLowerCase() || '';
      const pos = e.position?.toLowerCase() || '';
      const dept = e.department?.toLowerCase() || '';
      return name.includes(cleanQuery) || pos.includes(cleanQuery) || dept.includes(cleanQuery);
    });
  }, [employees, cleanQuery]);

  const { officeStaff, otherStaff } = useMemo(() => {
    if (!selectedOfficeName) {
      return { officeStaff: [], otherStaff: filtered };
    }
    const normOffice = selectedOfficeName.trim().toLowerCase();
    const officeList: EmployeeOption[] = [];
    const otherList: EmployeeOption[] = [];
    for (const emp of filtered) {
      if (emp.department && emp.department.trim().toLowerCase() === normOffice) {
        officeList.push(emp);
      } else {
        otherList.push(emp);
      }
    }
    return { officeStaff: officeList, otherStaff: otherList };
  }, [filtered, selectedOfficeName]);

  const flattened = useMemo(() => {
    if (selectedOfficeName && officeStaff.length > 0) {
      return [...officeStaff, ...otherStaff];
    }
    return filtered;
  }, [selectedOfficeName, officeStaff, otherStaff, filtered]);

  useEffect(() => {
    const handleClickOutside = (ev: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(ev.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        setIsOpen(true);
        return;
      }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < flattened.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, flattened.length - 1)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flattened[highlightedIndex]) {
        onSelect(flattened[highlightedIndex]);
        setIsOpen(false);
        setQuery('');
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  if (selectedEmployee) {
    return (
      <div
        data-testid="selected-employee-chip"
        style={{
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: '#ffffff',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: getAvatarColor(selectedEmployee.full_name),
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {getPersonInitials(selectedEmployee.full_name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#040E6B' }}>
            {selectedEmployee.full_name}
          </div>
          <div style={{ fontSize: '11px', color: '#515F69', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[selectedEmployee.position, selectedEmployee.department].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onSelect(null);
            setQuery('');
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          style={{
            background: 'none',
            border: 'none',
            padding: '4px 8px',
            fontSize: '12px',
            color: '#363ee8',
            fontWeight: 600,
            cursor: disabled ? 'not-allowed' : 'pointer',
            borderRadius: '4px',
          }}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          border: isOpen ? '1.5px solid #363EE8' : '1px solid #cbd5e1',
          boxShadow: isOpen ? '0 0 0 3px rgba(54, 62, 232, 0.12)' : 'none',
          borderRadius: '8px',
          background: '#ffffff',
          padding: '0 10px',
          height: '40px',
        }}
      >
        <Search size={16} style={{ color: '#64748b', marginRight: '8px', flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls="employee-combobox-list"
          aria-label="Search employee"
          placeholder="Search employee by name, position, or department…"
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            fontSize: '13px',
            color: 'var(--neutral-800)',
            background: 'transparent',
          }}
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery('');
              setHighlightedIndex(0);
              inputRef.current?.focus();
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={15} />
          </button>
        )}
      </div>

      {isOpen && (
        <div
          id="employee-combobox-list"
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            maxHeight: '240px',
            overflowY: 'auto',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.12)',
            zIndex: 50,
          }}
        >
          {flattened.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: '13px', color: '#64748b', textAlign: 'center' }}>
              No employees found matching &quot;{query}&quot;
            </div>
          ) : (
            <>
              {selectedOfficeName && officeStaff.length > 0 && (
                <div>
                  <div
                    style={{
                      padding: '6px 12px',
                      background: '#f1f5f9',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#475569',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Staff in {selectedOfficeName} ({officeStaff.length})
                  </div>
                  {officeStaff.map((emp) => {
                    const idx = flattened.indexOf(emp);
                    const isHighlighted = idx === highlightedIndex;
                    return (
                      <div
                        key={emp.id}
                        role="option"
                        aria-selected={isHighlighted}
                        onClick={() => {
                          onSelect(emp);
                          setIsOpen(false);
                          setQuery('');
                        }}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        style={{
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          cursor: 'pointer',
                          background: isHighlighted ? 'var(--color-primary-50)' : '#ffffff',
                          borderBottom: '1px solid #f1f5f9',
                        }}
                      >
                        <div
                          style={{
                            width: '30px',
                            height: '30px',
                            borderRadius: '50%',
                            background: getAvatarColor(emp.full_name),
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '11px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {getPersonInitials(emp.full_name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#040E6B' }}>
                            {emp.full_name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#515F69', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {[emp.position, emp.department].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedOfficeName && officeStaff.length > 0 && otherStaff.length > 0 && (
                <div>
                  <div
                    style={{
                      padding: '6px 12px',
                      background: '#f1f5f9',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#475569',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      borderTop: '1px solid #e2e8f0',
                    }}
                  >
                    Other Staff ({otherStaff.length})
                  </div>
                  {otherStaff.map((emp) => {
                    const idx = flattened.indexOf(emp);
                    const isHighlighted = idx === highlightedIndex;
                    return (
                      <div
                        key={emp.id}
                        role="option"
                        aria-selected={isHighlighted}
                        onClick={() => {
                          onSelect(emp);
                          setIsOpen(false);
                          setQuery('');
                        }}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        style={{
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          cursor: 'pointer',
                          background: isHighlighted ? 'var(--color-primary-50)' : '#ffffff',
                          borderBottom: '1px solid #f1f5f9',
                        }}
                      >
                        <div
                          style={{
                            width: '30px',
                            height: '30px',
                            borderRadius: '50%',
                            background: getAvatarColor(emp.full_name),
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '11px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {getPersonInitials(emp.full_name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#040E6B' }}>
                            {emp.full_name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#515F69', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {[emp.position, emp.department].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {(!selectedOfficeName || officeStaff.length === 0) && (
                <div>
                  {flattened.map((emp, idx) => {
                    const isHighlighted = idx === highlightedIndex;
                    return (
                      <div
                        key={emp.id}
                        role="option"
                        aria-selected={isHighlighted}
                        onClick={() => {
                          onSelect(emp);
                          setIsOpen(false);
                          setQuery('');
                        }}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        style={{
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          cursor: 'pointer',
                          background: isHighlighted ? 'var(--color-primary-50)' : '#ffffff',
                          borderBottom: '1px solid #f1f5f9',
                        }}
                      >
                        <div
                          style={{
                            width: '30px',
                            height: '30px',
                            borderRadius: '50%',
                            background: getAvatarColor(emp.full_name),
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '11px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {getPersonInitials(emp.full_name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#040E6B' }}>
                            {emp.full_name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#515F69', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {[emp.position, emp.department].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <div
            style={{
              padding: '6px 12px',
              background: '#fafafa',
              borderTop: '1px solid #e2e8f0',
              fontSize: '11px',
              color: '#64748b',
            }}
          >
            Use Arrow Up/Down to navigate, Enter to select, Esc to close
          </div>
        </div>
      )}
    </div>
  );
};

// ── Option B Stacked Confirmation Dialog ────────────────────────────────────
export interface AppointmentConfirmDialogProps {
  open: boolean;
  employeeName: string;
  officeName: string;
  mappedTitle: string;
  saving: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

export const AppointmentConfirmDialog: React.FC<AppointmentConfirmDialogProps> = ({
  open,
  employeeName,
  officeName,
  mappedTitle,
  saving,
  onBack,
  onConfirm,
}) => {
  return (
    <ConfirmModal
      open={open}
      icon={<Check strokeWidth={1.75} />}
      title="Confirm Department Head Appointment"
      cancelLabel="Back"
      confirmLabel="Confirm Appointment"
      loading={saving}
      onCancel={onBack}
      onConfirm={onConfirm}
      message={(
        <p data-testid="confirm-prompt" className="!mb-0">
          Appoint <strong>{employeeName}</strong> as the Department Head of <strong>{officeName}</strong>?
        </p>
      )}
    >
      <ul className="!m-0 list-disc space-y-1 rounded-xl border border-[var(--neutral-200)] bg-[var(--bg-page)] py-3 pl-8 pr-4 text-xs leading-relaxed text-[var(--neutral-800)]">
        <li>Official title updated to <strong>{mappedTitle}</strong></li>
        <li>Promotion recorded in <code className="rounded bg-[var(--neutral-200)] px-1 text-[11px]">position_history</code></li>
        <li>Immediate portal access granted via current account switcher</li>
      </ul>
    </ConfirmModal>
  );
};

// ── Appoint Department Head Modal ────────────────────────────────────────────
export interface AppointDepartmentHeadModalProps {
  departments: Department[];
  employees: EmployeeOption[];
  assignments: OfficeRoleAssignment[];
  onOpenTransfer: (assignment: OfficeRoleAssignment) => void;
  onClose: () => void;
  onDone: (msg: string) => void;
}

export const AppointDepartmentHeadModal = ({
  departments,
  employees,
  assignments,
  onOpenTransfer,
  onClose,
  onDone,
}: AppointDepartmentHeadModalProps) => {
  const [officeId, setOfficeId] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null);
  const [role] = useState<OfficeRole>('DeptHead');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [appointedDetails, setAppointedDetails] = useState<{ employeeName: string; officeName: string } | null>(null);

  const selectedOffice = departments.find((d) => d.id === officeId);
  const incumbent = officeId
    ? assignments.find((a) => a.office_id === officeId && a.status === 'Active' && a.role === 'DeptHead')
    : undefined;

  const mappedTitle = selectedOffice
    ? (OFFICE_HEAD_POSITIONS[selectedOffice.name] || 'Department Head')
    : 'Department Head';

  const handleOpenConfirm = () => {
    setErr('');
    if (!officeId) return setErr('Select an office.');
    if (!selectedEmployee) return setErr('Select an employee.');
    if (incumbent) {
      return setErr(
        `This office currently has an active Department Head (${incumbent.employee_name}). To replace this head, use Remove / Transfer to ensure pending IPCR reviews are rerouted.`
      );
    }
    setShowConfirm(true);
  };

  const handleExecuteAppointment = async () => {
    if (!selectedEmployee || !selectedOffice) return;
    setErr('');
    setSaving(true);
    const result = await createAssignment({
      employeeId: selectedEmployee.id,
      employeeName: selectedEmployee.full_name,
      officeId: selectedOffice.id,
      officeName: selectedOffice.name,
      role,
      performedBy: getCurrentAdminEmail(),
    });
    setSaving(false);

    if (!result.ok) {
      setShowConfirm(false);
      return setErr('error' in result ? result.error : 'Failed to create assignment.');
    }

    const successMsg = `Successfully appointed ${selectedEmployee.full_name} as Department Head of ${selectedOffice.name}. They can access their office dashboard immediately using their current account switcher.`;
    setAppointedDetails({
      employeeName: selectedEmployee.full_name,
      officeName: selectedOffice.name,
    });
    setShowConfirm(false);
    setIsSuccess(true);
    onDone(successMsg);
  };

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title={isSuccess ? 'Department Head Appointed' : 'Appoint Department Head'}
        subtitle={
          isSuccess
            ? undefined
            : 'Assign executive leadership and activate department dashboard privileges.'
        }
        headerIcon={
          isSuccess ? (
            <CheckCircle2 size={20} strokeWidth={1.75} />
          ) : (
            <Building2 size={20} strokeWidth={1.75} />
          )
        }
      >
        {!isSuccess ? (
          <div style={{ color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* 1. Office Selection First */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label htmlFor="modal-office-select" style={{ fontSize: '13px', fontWeight: 600, color: '#28343D', margin: 0 }}>
                  Office <span style={{ color: '#e05252' }}>*</span>
                </label>
                {selectedOffice && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: selectedOffice.is_active ? '#166534' : 'var(--neutral-600)' }}>
                      {selectedOffice.is_active ? 'Active Department' : 'Inactive Department'}
                    </span>
                    {incumbent ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: '#fee2e2',
                          color: '#991b1b',
                        }}
                      >
                        Occupied
                      </span>
                    ) : (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: '#dcfce7',
                          color: '#166534',
                        }}
                      >
                        Vacant
                      </span>
                    )}
                  </div>
                )}
              </div>
              <select
                id="modal-office-select"
                aria-label="Office"
                value={officeId}
                onChange={(e) => {
                  setOfficeId(e.target.value);
                  setErr('');
                }}
                style={{
                  ...input,
                  borderColor: officeId ? '#363ee8' : '#cbd5e1',
                }}
              >
                <option value="">Select an office…</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {!d.is_active ? ' (inactive)' : ''}
                  </option>
                ))}
              </select>

              {incumbent && (
                <div
                  style={{
                    marginTop: '10px',
                    padding: '12px 14px',
                    background: 'var(--warning-100)',
                    border: '1px solid var(--warning-300)',
                    borderRadius: '8px',
                    color: 'var(--warning-700)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', lineHeight: 1.4 }}>
                    <AlertCircle size={18} style={{ color: 'var(--warning-500)', flexShrink: 0, marginTop: '1px' }} />
                    <span>
                      This office currently has an active Department Head ({incumbent.employee_name}). To replace this head, use Remove / Transfer to ensure pending IPCR reviews are rerouted.
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => onOpenTransfer(incumbent)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        background: 'var(--warning-100)',
                        color: 'var(--warning-700)',
                        border: '1px solid var(--warning-300)',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Go to Transfer Flow
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Employee to Appoint (Combobox) */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#28343D', marginBottom: '6px' }}>
                Employee to Appoint <span style={{ color: '#e05252' }}>*</span>
              </label>
              <SearchableEmployeeCombobox
                employees={employees}
                selectedEmployee={selectedEmployee}
                selectedOfficeName={selectedOffice?.name}
                onSelect={(emp) => {
                  setSelectedEmployee(emp);
                  setErr('');
                }}
              />
            </div>

            {/* 3. Promotion & Database Sync Preview Card */}
            {selectedOffice && (
              <div
                style={{
                  background: '#f0f7ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '10px',
                  padding: '12px 14px',
                }}
              >
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#1e40af',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '6px',
                  }}
                >
                  PROMOTION &amp; DATABASE SYNC PREVIEW
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    gap: '4px 12px',
                    fontSize: '12px',
                    alignItems: 'baseline',
                  }}
                >
                  <span style={{ color: '#64748b' }}>Official Title:</span>
                  <strong style={{ color: '#040E6B' }}>{mappedTitle}</strong>
                  <span style={{ color: '#64748b' }}>Sync Action:</span>
                  <span style={{ color: '#047857', fontWeight: 600 }}>
                    Promotion recorded in position_history
                  </span>
                </div>
              </div>
            )}

            {/* 4. Single Identity SSO Reassurance Banner */}
            {selectedEmployee && (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '12px',
                  color: '#475569',
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'flex-start',
                }}
              >
                <ShieldCheck size={16} style={{ color: '#363ee8', flexShrink: 0, marginTop: '2px' }} />
                <span>
                  {selectedEmployee.full_name} uses their regular login credentials. Their profile switcher will automatically unlock the Department Head portal upon appointment.
                </span>
              </div>
            )}

            {err && <div style={{ ...bannerErr, margin: '4px 0 0 0' }}>{err}</div>}

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                style={{
                  padding: '8px 20px',
                  border: '1.5px solid #363EE8',
                  background: '#ffffff',
                  borderRadius: '999px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#363EE8',
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleOpenConfirm}
                disabled={saving || !!incumbent}
                style={{
                  padding: '8px 22px',
                  background: 'linear-gradient(180deg, #363EE8, #191FA8)',
                  border: 'none',
                  borderRadius: '999px',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#ffffff',
                  cursor: saving || incumbent ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 4px rgba(4, 14, 107, 0.15)',
                  opacity: saving || incumbent ? 0.5 : 1,
                }}
              >
                Appoint Department Head
              </button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '16px 8px 8px 8px' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: '#dcfce7',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
              }}
            >
              <CheckCircle2 size={32} style={{ color: '#047857' }} />
            </div>
            <p data-testid="success-description" style={{ fontSize: '14px', color: '#475569', lineHeight: 1.5, margin: '0 auto 24px auto', maxWidth: '380px' }}>
              Successfully appointed <strong>{appointedDetails?.employeeName}</strong> as Department Head of <strong>{appointedDetails?.officeName}</strong>. They can access their office dashboard immediately using their current account switcher.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '9px 36px',
                  background: 'linear-gradient(180deg, #363EE8, #191FA8)',
                  border: 'none',
                  borderRadius: '999px',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#ffffff',
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(4, 14, 107, 0.15)',
                }}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Dialog>

      <AppointmentConfirmDialog
        open={showConfirm}
        employeeName={selectedEmployee?.full_name || ''}
        officeName={selectedOffice?.name || ''}
        mappedTitle={mappedTitle}
        saving={saving}
        onBack={() => setShowConfirm(false)}
        onConfirm={handleExecuteAppointment}
      />
    </>
  );
};

export const AddPersonnelModal = AppointDepartmentHeadModal;

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
            <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 500, color: 'var(--neutral-600)' }}>
              {loadingPending ? '' : `${pending.length} pending`}
            </span>
          </div>
          <div style={{ padding: '12px 16px' }}>
            {loadingPending ? (
              <div style={{ color: 'var(--neutral-600)', fontSize: '13px' }}>Checking pending submissions…</div>
            ) : pending.length === 0 ? (
              <div style={{ color: 'var(--neutral-600)', fontSize: '13px' }}>
                No pending or in-progress submissions await this role-holder. Nothing to reroute.
              </div>
            ) : (
              <>
                <p style={{ fontSize: '12px', color: 'var(--neutral-600)', marginTop: 0, marginBottom: '10px' }}>
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
                      <span style={{ color: 'var(--neutral-400)' }}>({p.status})</span>
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
    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--neutral-800)', marginBottom: '6px' }}>
      {label}
    </label>
    {children}
  </div>
);

// ── Subtab: Phase Scheduler ──────────────────────────────────────────────────



// ── Subtab: Locked Targets Vault ─────────────────────────────────────────────


// ── Subtab: Compliance Tracker ───────────────────────────────────────────────


// ── Subtab: Final Review & Closeout ──────────────────────────────────────────



// ── Placeholder for not-yet-built subtabs ────────────────────────────────────

// Header and cell styling come from the shared .abyan-table layer
// (src/components/data-table); these stay for per-cell overrides.
const th: React.CSSProperties = {};

const td: React.CSSProperties = {};

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid var(--neutral-200)',
  borderRadius: '12px',
  overflow: 'hidden',
};

const cardHeader: React.CSSProperties = {
  padding: '16px 20px',
  borderBottom: '1px solid var(--neutral-200)',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  fontWeight: 600,
  color: 'var(--neutral-800)',
};

const emptyBox: React.CSSProperties = {
  padding: '32px',
  textAlign: 'center',
  color: 'var(--neutral-600)',
  fontSize: '14px',
  lineHeight: 1.5,
};



const input: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid var(--neutral-200)',
  borderRadius: '8px',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
  background: '#fff',
  color: 'var(--neutral-900)',
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
  color: 'var(--neutral-800)',
  border: '1px solid var(--neutral-200)',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
};

const dangerBtn: React.CSSProperties = {
  padding: '9px 16px',
  background: 'var(--error-500)',
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
  color: 'var(--error-700)',
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
    revoke: 'var(--error-700)',
    reroute: 'var(--warning-700)',
  };
  const color = map[action] ?? 'var(--neutral-600)';
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
