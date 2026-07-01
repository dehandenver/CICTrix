import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Building2, Search, ShieldCheck, Users } from 'lucide-react';
import { AdminHeader } from '../../components/AdminHeader';
import { Sidebar } from '../../components/Sidebar';
import {
  type OfficeDirectoryRow,
  type OfficePerson,
  filterOfficeDirectory,
  getOfficeDirectory,
} from '../../lib/api/officeDirectory';
import '../../styles/admin.css';

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
          'Assign or remove Supervisor / Dept Head roles tied to an office, auto-link Office Account credentials, and reroute pending submissions via the Succession Transfer Tool. (Planned — Phase 2.)',
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
