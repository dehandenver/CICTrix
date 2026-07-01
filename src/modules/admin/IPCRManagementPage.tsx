import { Fragment, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Bell, Check, ChevronDown, ClipboardCheck, GraduationCap, Lock, Pencil, Search, Send, Trash2, TrendingUp, UserPlus } from 'lucide-react';
import { AdminHeader } from '../../components/AdminHeader';
import { Dialog } from '../../components/Dialog';
import { Sidebar } from '../../components/Sidebar';
import { listDepartments, type Department } from '../../lib/api/departments';
import { listEmployeeOptions, type EmployeeOption } from '../../lib/api/officeRoles';
import { getActiveCyclePeriod } from '../../lib/api/compliance';
import { listLockedTargets, type LockedTargetRow } from '../../lib/api/lockedTargets';
import { getEmployeeHistory, type EmployeeHistory } from '../../lib/api/performanceHistory';
import { IPCR_STAGES, type IpcrStage, stagePillStyle } from '../../lib/api/ipcrStages';
import {
  type IpcrNotification,
  type IpcrPhase,
  type SubmissionRow,
  getSubmissionTracker,
  listNotifications,
  sendNotification,
  setSubmissionStage,
} from '../../lib/api/ipcrSubmissions';
import {
  type NewEntrant,
  type NewEntrantInput,
  createNewEntrant,
  deleteNewEntrant,
  listNewEntrants,
  updateNewEntrant,
} from '../../lib/api/newEntrants';
import { Field, getCurrentAdminEmail, ui } from './moduleUi';
import '../../styles/admin.css';

interface SubtabDef {
  key: string;
  label: string;
  blurb: string;
}

const SUBTABS: SubtabDef[] = [
  {
    key: 'onboarding',
    label: '2.1 New Entrant Onboarding',
    blurb: 'Track new entrants: orientation schedule/log and their first-ever target-setting status.',
  },
  {
    key: 'target-setting',
    label: '2.2 Target Setting',
    blurb:
      'Notification log for “Targets Needed” + per-employee submission tracker (Not Started → Forwarded to PM).',
  },
  {
    key: 'accomplishment',
    label: '2.3 Accomplishment Rating',
    blurb: 'Second-half mirror of 2.2, pre-populated with each employee’s locked targets from the Vault.',
  },
  {
    key: 'history',
    label: '2.4 Performance History',
    blurb: 'Read-only per-employee timeline of completed cycles: targets vs accomplishments, with trend indicators.',
  },
];

export const IPCRManagementPage = () => {
  const [active, setActive] = useState('onboarding');
  const current = SUBTABS.find((s) => s.key === active) ?? SUBTABS[0];

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <AdminHeader userName="Super Admin" divisionLabel="System Administrator" />
      <div className="admin-layout">
        <Sidebar activeModule="Super" userRole="super-admin" />
        <main className="admin-content">
          <div className="admin-header">
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ClipboardCheck size={26} />
              IPCR Management
            </h1>
            <p className="admin-subtitle">
              Module 2 — onboarding, target-setting, accomplishment rating, and performance history.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '16px 0' }}>
            {SUBTABS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setActive(s.key)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '999px',
                  border: '1px solid',
                  borderColor: active === s.key ? '#363EE8' : '#d1d5db',
                  background: active === s.key ? '#363EE8' : '#fff',
                  color: active === s.key ? '#fff' : '#374151',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          {active === 'onboarding' ? (
            <NewEntrantOnboarding />
          ) : active === 'target-setting' ? (
            <SubmissionPhasePanel phase="target" />
          ) : active === 'accomplishment' ? (
            <SubmissionPhasePanel phase="rating" showLockedTargets />
          ) : active === 'history' ? (
            <PerformanceHistory />
          ) : (
            <div style={{ background: '#fff', border: '1px dashed #d1d5db', borderRadius: '12px', padding: '40px', textAlign: 'center' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937', marginBottom: '8px' }}>{current.label}</h3>
              <p style={{ color: '#6b7280', maxWidth: '640px', margin: '0 auto', lineHeight: 1.5 }}>{current.blurb}</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

// ── Subtab 2.1: New Entrant Onboarding ───────────────────────────────────────
const emptyInput = (): NewEntrantInput => ({
  employeeId: '',
  employeeName: '',
  officeId: null,
  officeName: null,
  startDate: null,
  orientationDate: null,
  targetSettingDeadline: null,
  orientationConductedBy: null,
  orientationCompletedDate: null,
  initialTargetStage: 'Not Started',
  notes: null,
});

const NewEntrantOnboarding = () => {
  const [entrants, setEntrants] = useState<NewEntrant[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<NewEntrant | 'new' | null>(null);

  const reload = async () => {
    setLoading(true);
    setError('');
    const [res, emps, deps] = await Promise.all([listNewEntrants(), listEmployeeOptions(), listDepartments(true)]);
    if (res.ok) setEntrants(res.data);
    else if ('error' in res) setError(res.error);
    setEmployees(emps);
    setDepartments(deps.success ? deps.data : []);
    setLoading(false);
  };
  useEffect(() => {
    void reload();
  }, []);

  const flash = (m: string) => {
    setBanner(m);
    setTimeout(() => setBanner(''), 6000);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entrants;
    return entrants.filter(
      (e) => (e.employee_name ?? '').toLowerCase().includes(q) || (e.office_name ?? '').toLowerCase().includes(q),
    );
  }, [entrants, search]);

  const metrics = useMemo(() => {
    const total = entrants.length;
    const orientationDone = entrants.filter((e) => e.orientation_completed_date).length;
    const targetsForwarded = entrants.filter((e) => e.initial_target_stage === 'Forwarded to PM').length;
    return { total, orientationDone, targetsForwarded };
  }, [entrants]);

  const remove = async (id: string) => {
    const res = await deleteNewEntrant(id);
    if (res.ok) {
      flash('✓ New entrant record removed.');
      void reload();
    } else if ('error' in res) {
      setError(res.error);
    }
  };

  return (
    <div>
      {banner && (
        <div style={ui.bannerOk}>
          <Check size={18} />
          {banner}
        </div>
      )}
      {error && (
        <div style={ui.bannerErr}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
        <Metric icon={<UserPlus size={18} />} label="New entrants" value={metrics.total} />
        <Metric icon={<GraduationCap size={18} />} label="Orientation completed" value={`${metrics.orientationDone}/${metrics.total}`} />
        <Metric icon={<Send size={18} />} label="Initial targets forwarded" value={`${metrics.targetsForwarded}/${metrics.total}`} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '420px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by employee or office…"
            style={{ ...ui.input, paddingLeft: '36px' }}
          />
        </div>
        <button type="button" onClick={() => setEditing('new')} style={ui.primaryBtn}>
          <UserPlus size={15} />
          Add New Entrant
        </button>
      </div>

      <div style={ui.card}>
        <div style={ui.cardHeader}>
          <UserPlus size={18} />
          New Entrants
          <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 500, color: '#6b7280' }}>
            {loading ? '' : `${filtered.length}`}
          </span>
        </div>
        {loading ? (
          <div style={ui.emptyBox}>Loading new entrants…</div>
        ) : filtered.length === 0 ? (
          <div style={ui.emptyBox}>
            {entrants.length === 0
              ? 'No new entrants tracked yet. Use “Add New Entrant”. (Ensure migration 014 has been run.)'
              : 'No records match your search.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: '#f9fafb', textAlign: 'left', color: '#6b7280' }}>
                  <th style={ui.th}>Employee</th>
                  <th style={ui.th}>Office</th>
                  <th style={ui.th}>Start</th>
                  <th style={ui.th}>Orientation</th>
                  <th style={ui.th}>Target deadline</th>
                  <th style={ui.th}>Initial Target Status</th>
                  <th style={{ ...ui.th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={ui.td}>
                      <span style={{ fontWeight: 600, color: '#1f2937' }}>{e.employee_name || '—'}</span>
                    </td>
                    <td style={ui.td}>{e.office_name || '—'}</td>
                    <td style={ui.td}>{fmtDate(e.start_date)}</td>
                    <td style={ui.td}>
                      <div>{e.orientation_completed_date ? `Done ${fmtDate(e.orientation_completed_date)}` : e.orientation_date ? `Sched. ${fmtDate(e.orientation_date)}` : '—'}</div>
                      {e.orientation_conducted_by && (
                        <div style={{ fontSize: '12px', color: '#9ca3af' }}>by {e.orientation_conducted_by}</div>
                      )}
                    </td>
                    <td style={ui.td}>{fmtDate(e.target_setting_deadline)}</td>
                    <td style={ui.td}>
                      <span style={stagePillStyle(e.initial_target_stage)}>{e.initial_target_stage}</span>
                    </td>
                    <td style={{ ...ui.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        onClick={() => setEditing(e)}
                        style={{ ...ui.secondaryBtn, padding: '6px 10px', marginRight: '6px' }}
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(e.id)}
                        style={{ ...ui.secondaryBtn, padding: '6px 10px', color: '#b91c1c', borderColor: '#fca5a5' }}
                        title="Remove"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <EntrantModal
          existing={editing === 'new' ? null : editing}
          employees={employees}
          departments={departments}
          onClose={() => setEditing(null)}
          onDone={(msg) => {
            flash(msg);
            setEditing(null);
            void reload();
          }}
        />
      )}
    </div>
  );
};

const Metric = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) => (
  <div style={{ ...ui.card, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
    <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(54,62,232,0.1)', color: '#363EE8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {icon}
    </div>
    <div>
      <div style={{ fontSize: '20px', fontWeight: 700, color: '#1f2937' }}>{value}</div>
      <div style={{ fontSize: '12px', color: '#6b7280' }}>{label}</div>
    </div>
  </div>
);

const EntrantModal = ({
  existing,
  employees,
  departments,
  onClose,
  onDone,
}: {
  existing: NewEntrant | null;
  employees: EmployeeOption[];
  departments: Department[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) => {
  const [form, setForm] = useState<NewEntrantInput>(() =>
    existing
      ? {
          employeeId: existing.employee_id ?? '',
          employeeName: existing.employee_name ?? '',
          officeId: existing.office_id,
          officeName: existing.office_name,
          startDate: existing.start_date,
          orientationDate: existing.orientation_date,
          targetSettingDeadline: existing.target_setting_deadline,
          orientationConductedBy: existing.orientation_conducted_by,
          orientationCompletedDate: existing.orientation_completed_date,
          initialTargetStage: existing.initial_target_stage,
          notes: existing.notes,
        }
      : emptyInput(),
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = <K extends keyof NewEntrantInput>(k: K, v: NewEntrantInput[K]) => setForm((p) => ({ ...p, [k]: v }));

  const onPickEmployee = (id: string) => {
    const emp = employees.find((e) => e.id === id);
    const office = departments.find((d) => d.name === emp?.department) ?? null;
    setForm((p) => ({
      ...p,
      employeeId: id,
      employeeName: emp?.full_name ?? '',
      officeId: office?.id ?? p.officeId,
      officeName: office?.name ?? emp?.department ?? p.officeName,
    }));
  };

  const submit = async () => {
    setErr('');
    if (!form.employeeId) return setErr('Select an employee.');
    setSaving(true);
    const res = existing ? await updateNewEntrant(existing.id, form) : await createNewEntrant(form, getCurrentAdminEmail());
    setSaving(false);
    if (!res.ok) return setErr('error' in res ? res.error : 'Failed to save.');
    onDone(`✓ ${form.employeeName || 'New entrant'} ${existing ? 'updated' : 'added'}.`);
  };

  return (
    <Dialog open onClose={onClose} title={existing ? 'Edit New Entrant' : 'Add New Entrant'}>
      <div style={{ color: 'var(--text-primary)' }}>
        <Field label="Employee">
          <select value={form.employeeId} onChange={(e) => onPickEmployee(e.target.value)} disabled={Boolean(existing)} style={ui.input}>
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
          <select value={form.officeId ?? ''} onChange={(e) => { const d = departments.find((x) => x.id === e.target.value); set('officeId', e.target.value || null); set('officeName', d?.name ?? null); }} style={ui.input}>
            <option value="">(optional) Select an office…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Field label="Start date">
            <input type="date" value={form.startDate ?? ''} onChange={(e) => set('startDate', e.target.value || null)} style={ui.input} />
          </Field>
          <Field label="Target-setting deadline">
            <input type="date" value={form.targetSettingDeadline ?? ''} onChange={(e) => set('targetSettingDeadline', e.target.value || null)} style={ui.input} />
          </Field>
        </div>

        <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', margin: '6px 0 8px' }}>Job Orientation Log</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Field label="Scheduled orientation date">
            <input type="date" value={form.orientationDate ?? ''} onChange={(e) => set('orientationDate', e.target.value || null)} style={ui.input} />
          </Field>
          <Field label="Completed on">
            <input type="date" value={form.orientationCompletedDate ?? ''} onChange={(e) => set('orientationCompletedDate', e.target.value || null)} style={ui.input} />
          </Field>
        </div>
        <Field label="Conducted by">
          <input type="text" value={form.orientationConductedBy ?? ''} onChange={(e) => set('orientationConductedBy', e.target.value || null)} placeholder="Name of briefer" style={ui.input} />
        </Field>

        <Field label="Initial target-setting status">
          <select value={form.initialTargetStage} onChange={(e) => set('initialTargetStage', e.target.value as IpcrStage)} style={ui.input}>
            {IPCR_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Notes">
          <textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} rows={2} style={{ ...ui.input, resize: 'vertical' }} />
        </Field>

        {err && <div style={{ ...ui.bannerErr, margin: '0 0 12px' }}>{err}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" onClick={onClose} disabled={saving} style={ui.secondaryBtn}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={saving} style={ui.primaryBtn}>
            {saving ? 'Saving…' : existing ? 'Save changes' : 'Add entrant'}
          </button>
        </div>
      </div>
    </Dialog>
  );
};

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

// ── Subtabs 2.2 / 2.3: submission pipeline + notification log ─────────────────
const PHASE_META: Record<IpcrPhase, { notif: string; noun: string; forwardNote: string }> = {
  target: {
    notif: 'Targets Needed',
    noun: 'target',
    forwardNote: 'Setting a stage to “Forwarded to PM” locks that employee’s targets into the Locked Targets Vault (Module 1.2).',
  },
  rating: {
    notif: 'Accomplishment Ratings Needed',
    noun: 'accomplishment',
    forwardNote: 'Setting a stage to “Forwarded to PM” finalizes that employee’s rating for the office closeout bundle (Module 1.3).',
  },
};

const SubmissionPhasePanel = ({
  phase,
  extra,
  showLockedTargets,
}: {
  phase: IpcrPhase;
  extra?: React.ReactNode;
  showLockedTargets?: boolean;
}) => {
  const meta = PHASE_META[phase];
  const [period, setPeriod] = useState('');
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [notifications, setNotifications] = useState<IpcrNotification[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [lockedMap, setLockedMap] = useState<Map<string, LockedTargetRow[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');
  const [officeFilter, setOfficeFilter] = useState('');
  const [stageFilter, setStageFilter] = useState<'' | IpcrStage>('');
  const [savingId, setSavingId] = useState('');
  const [showNotify, setShowNotify] = useState(false);

  const colCount = showLockedTargets ? 6 : 5;

  const reload = async () => {
    setLoading(true);
    setError('');
    const { period: p } = await getActiveCyclePeriod();
    setPeriod(p);
    const [trackRes, notifs, deps] = await Promise.all([
      getSubmissionTracker({ period: p, phase, excludeNewEntrants: phase === 'target' }),
      listNotifications(phase),
      listDepartments(true),
    ]);
    if (trackRes.ok) setRows(trackRes.rows);
    else if ('error' in trackRes) setError(trackRes.error);
    setNotifications(notifs);
    setDepartments(deps.success ? deps.data : []);

    // Pre-populate each employee's locked targets (read-only) for the rating phase.
    if (showLockedTargets) {
      const lockedRes = await listLockedTargets();
      const map = new Map<string, LockedTargetRow[]>();
      if (lockedRes.ok) {
        for (const set of lockedRes.data) {
          if (set.period !== p) continue;
          const key = String(set.employee_id ?? '');
          if (!key || map.has(key)) continue; // most recent set wins (ordered desc)
          map.set(key, set.targets ?? []);
        }
      }
      setLockedMap(map);
    }
    setLoading(false);
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const flash = (m: string) => {
    setBanner(m);
    setTimeout(() => setBanner(''), 6000);
  };

  const visible = useMemo(() => {
    return rows.filter(
      (r) => (!officeFilter || r.officeId === officeFilter) && (!stageFilter || r.stage === stageFilter),
    );
  }, [rows, officeFilter, stageFilter]);

  const stageCounts = useMemo(() => {
    const scope = officeFilter ? rows.filter((r) => r.officeId === officeFilter) : rows;
    const counts = Object.fromEntries(IPCR_STAGES.map((s) => [s, 0])) as Record<IpcrStage, number>;
    for (const r of scope) counts[r.stage]++;
    return counts;
  }, [rows, officeFilter]);

  const changeStage = async (row: SubmissionRow, stage: IpcrStage) => {
    setSavingId(row.employeeId);
    const res = await setSubmissionStage({
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      officeId: row.officeId,
      officeName: row.officeName,
      period,
      phase,
      stage,
      updatedBy: getCurrentAdminEmail(),
    });
    setSavingId('');
    if (!res.ok) {
      setError('error' in res ? res.error : 'Failed to update stage.');
      return;
    }
    setRows((prev) => prev.map((r) => (r.employeeId === row.employeeId ? { ...r, stage } : r)));
    if (res.lockedToVault) flash(`✓ ${row.employeeName}: targets locked into the Vault.`);
  };

  return (
    <div>
      {banner && (
        <div style={ui.bannerOk}>
          <Check size={18} />
          {banner}
        </div>
      )}
      {error && (
        <div style={ui.bannerErr}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px' }}>
        Period: <strong style={{ color: '#374151' }}>{period || '—'}</strong>
      </p>

      {extra}

      {/* Notification log */}
      <div style={{ ...ui.card, marginBottom: '20px' }}>
        <div style={ui.cardHeader}>
          <Bell size={18} />
          Notification Log
          <button type="button" onClick={() => setShowNotify(true)} style={{ ...ui.primaryBtn, marginLeft: 'auto', padding: '7px 12px' }}>
            <Send size={14} />
            Send “{meta.notif}”
          </button>
        </div>
        {notifications.length === 0 ? (
          <div style={ui.emptyBox}>No notifications sent yet for this phase.</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: '6px 0' }}>
            {notifications.map((n) => (
              <li key={n.id} style={{ display: 'flex', gap: '12px', padding: '10px 20px', borderTop: '1px solid #f5f5f5' }}>
                <Bell size={15} style={{ color: '#363EE8', marginTop: '2px' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', color: '#374151' }}>
                    <strong>{meta.notif}</strong> → {n.office_name || 'All offices'} · {n.employee_count} employee(s)
                    {n.message ? ` — “${n.message}”` : ''}
                  </div>
                  <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                    {n.triggered_by || 'PM'} · {new Date(n.created_at).toLocaleString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pipeline summary */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {IPCR_STAGES.map((s) => (
          <span key={s} style={{ ...stagePillStyle(s), padding: '5px 12px', display: 'inline-flex', gap: '6px' }}>
            {s} <strong>{stageCounts[s]}</strong>
          </span>
        ))}
      </div>

      {/* Submission tracker */}
      <div style={ui.card}>
        <div style={ui.cardHeader}>
          <ClipboardCheck size={18} />
          {phase === 'target' ? 'Submission Tracker' : 'Rating Submission Tracker'}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <select value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)} style={{ ...ui.input, width: 'auto', padding: '6px 10px' }}>
              <option value="">All offices</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value as any)} style={{ ...ui.input, width: 'auto', padding: '6px 10px' }}>
              <option value="">All stages</option>
              {IPCR_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        {loading ? (
          <div style={ui.emptyBox}>Loading tracker…</div>
        ) : visible.length === 0 ? (
          <div style={ui.emptyBox}>
            {rows.length === 0
              ? 'No employees found for this cycle. (Ensure migration 015 has been run and employees exist.)'
              : 'No employees match the current filters.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: '#f9fafb', textAlign: 'left', color: '#6b7280' }}>
                  <th style={ui.th}>Employee</th>
                  <th style={ui.th}>Office</th>
                  <th style={ui.th}>Stage</th>
                  <th style={ui.th}>Set stage</th>
                  <th style={ui.th}>Updated</th>
                  {showLockedTargets && <th style={{ ...ui.th, textAlign: 'right' }}>Locked Targets</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const locked = showLockedTargets ? lockedMap.get(r.employeeId) : undefined;
                  return (
                    <Fragment key={r.employeeId}>
                      <tr style={{ borderTop: '1px solid #f0f0f0' }}>
                        <td style={ui.td}>
                          <span style={{ fontWeight: 600, color: '#1f2937' }}>{r.employeeName}</span>
                        </td>
                        <td style={ui.td}>{r.officeName || '—'}</td>
                        <td style={ui.td}>
                          <span style={stagePillStyle(r.stage)}>{r.stage}</span>
                        </td>
                        <td style={ui.td}>
                          <select
                            value={r.stage}
                            disabled={savingId === r.employeeId}
                            onChange={(e) => changeStage(r, e.target.value as IpcrStage)}
                            style={{ ...ui.input, width: 'auto', padding: '6px 10px' }}
                          >
                            {IPCR_STAGES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={ui.td}>{r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : '—'}</td>
                        {showLockedTargets && (
                          <td style={{ ...ui.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {locked && locked.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => toggle(r.employeeId)}
                                style={{ ...ui.secondaryBtn, padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                              >
                                <Lock size={13} />
                                {locked.length}
                                <ChevronDown
                                  size={14}
                                  style={{ transform: expanded.has(r.employeeId) ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
                                />
                              </button>
                            ) : (
                              <span style={{ fontSize: '12px', color: '#b45309' }}>Not in Vault</span>
                            )}
                          </td>
                        )}
                      </tr>
                      {showLockedTargets && expanded.has(r.employeeId) && locked && (
                        <tr>
                          <td colSpan={colCount} style={{ padding: '0 16px 14px', background: '#fafafa' }}>
                            <div style={{ padding: '12px 14px', border: '1px solid #eee', borderRadius: '8px', background: '#fff' }}>
                              <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>
                                Locked targets (read-only, from Vault) — the employee rates accomplishments against each of these.
                              </div>
                              {locked.length === 0 ? (
                                <div style={{ fontSize: '13px', color: '#6b7280' }}>No target rows in this set.</div>
                              ) : (
                                <ol style={{ margin: 0, paddingLeft: '18px' }}>
                                  {locked.map((t, i) => (
                                    <li key={i} style={{ fontSize: '13px', color: '#374151', marginBottom: '4px' }}>
                                      {t.function_type ? <strong>[{t.function_type}] </strong> : null}
                                      {t.target_text || JSON.stringify(t)}
                                    </li>
                                  ))}
                                </ol>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ marginTop: '12px', fontSize: '12px', color: '#9ca3af' }}>{meta.forwardNote}</p>

      {showNotify && (
        <NotifyModal
          phase={phase}
          period={period}
          departments={departments}
          rows={rows}
          onClose={() => setShowNotify(false)}
          onDone={(msg) => {
            flash(msg);
            setShowNotify(false);
            void reload();
          }}
        />
      )}
    </div>
  );
};

// ── Subtab 2.4: Performance History ──────────────────────────────────────────
const scoreTone = (adj: string | null): { bg: string; fg: string } => {
  switch (adj) {
    case 'Outstanding':
      return { bg: 'rgba(16,185,129,0.14)', fg: '#047857' };
    case 'Very Satisfactory':
      return { bg: 'rgba(54,62,232,0.1)', fg: '#363EE8' };
    case 'Satisfactory':
      return { bg: 'rgba(245,158,11,0.15)', fg: '#b45309' };
    default:
      return { bg: 'rgba(220,38,38,0.12)', fg: '#b91c1c' };
  }
};

const PerformanceHistory = () => {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [history, setHistory] = useState<EmployeeHistory | null>(null);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoadingEmployees(true);
      setEmployees(await listEmployeeOptions());
      setLoadingEmployees(false);
    })();
  }, []);

  useEffect(() => {
    if (!employeeId) {
      setHistory(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      const res = await getEmployeeHistory(employeeId);
      if (cancelled) return;
      if (res.ok) setHistory(res.data);
      else {
        setHistory(null);
        setError('error' in res ? res.error : 'Failed to load history.');
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  const selectedName = employees.find((e) => e.id === employeeId)?.full_name ?? '';

  return (
    <div>
      {error && (
        <div style={ui.bannerErr}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <div style={{ maxWidth: '460px', marginBottom: '16px' }}>
        <label style={ui.miniLabel}>Employee</label>
        <select
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          disabled={loadingEmployees}
          style={ui.input}
        >
          <option value="">{loadingEmployees ? 'Loading employees…' : 'Select an employee…'}</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.full_name}
              {e.department ? ` — ${e.department}` : ''}
            </option>
          ))}
        </select>
      </div>

      {!employeeId ? (
        <div style={{ ...ui.card, ...ui.emptyBox }}>Select an employee to view their IPCR track record.</div>
      ) : loading ? (
        <div style={{ ...ui.card, ...ui.emptyBox }}>Loading history…</div>
      ) : !history || history.cycles.length === 0 ? (
        <div style={{ ...ui.card, ...ui.emptyBox }}>No completed IPCR cycles found for {selectedName || 'this employee'}.</div>
      ) : (
        <>
          {/* Summary + trends */}
          <div style={{ ...ui.card, padding: '16px 20px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '20px' }}>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#1f2937' }}>{history.cyclesCompleted}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>cycles completed</div>
              </div>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#1f2937' }}>
                  {history.avgScore != null ? history.avgScore.toFixed(2) : '—'}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>avg rating</div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginLeft: 'auto' }}>
                {history.trends.length === 0 ? (
                  <span style={{ fontSize: '13px', color: '#9ca3af' }}>Not enough cycles for trend analysis</span>
                ) : (
                  history.trends.map((t) => (
                    <span
                      key={t}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 12px',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background: 'rgba(54,62,232,0.08)',
                        color: '#363EE8',
                      }}
                    >
                      <TrendingUp size={13} />
                      {t}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Timeline */}
          {history.cycles.map((c, i) => {
            const tone = scoreTone(c.adjectival);
            return (
              <div key={`${c.period}-${i}`} style={{ ...ui.card, marginBottom: '14px' }}>
                <div style={ui.cardHeader}>
                  <span style={{ fontWeight: 700 }}>{c.period}</span>
                  {c.adjectival && (
                    <span style={{ padding: '2px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, background: tone.bg, color: tone.fg }}>
                      {c.finalScore?.toFixed(2)} · {c.adjectival}
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#9ca3af' }}>
                    {c.status ?? '—'}
                    {c.approvedAt ? ` · ${new Date(c.approvedAt).toLocaleDateString()}` : ''}
                  </span>
                </div>
                {c.rows.length === 0 ? (
                  <div style={ui.emptyBox}>No target/accomplishment detail recorded for this cycle.</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#f9fafb', textAlign: 'left', color: '#6b7280' }}>
                          <th style={ui.th}>Target</th>
                          <th style={ui.th}>Accomplishment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.rows.map((r, j) => (
                          <tr key={j} style={{ borderTop: '1px solid #f0f0f0' }}>
                            <td style={{ ...ui.td, width: '50%' }}>
                              {r.functionType ? <strong style={{ color: '#6b7280' }}>[{r.functionType}] </strong> : null}
                              {r.target || '—'}
                            </td>
                            <td style={{ ...ui.td, width: '50%', color: r.accomplishment ? '#374151' : '#b45309' }}>
                              {r.accomplishment || 'No accomplishment recorded'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
          <p style={{ marginTop: '4px', fontSize: '12px', color: '#9ca3af' }}>
            Read-only. Feeds promotional application review (Module 4) and performance pattern analysis.
          </p>
        </>
      )}
    </div>
  );
};

const NotifyModal = ({
  phase,
  period,
  departments,
  rows,
  onClose,
  onDone,
}: {
  phase: IpcrPhase;
  period: string;
  departments: Department[];
  rows: SubmissionRow[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) => {
  const meta = PHASE_META[phase];
  const [officeId, setOfficeId] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const count = officeId ? rows.filter((r) => r.officeId === officeId).length : rows.length;
  const office = departments.find((d) => d.id === officeId) ?? null;

  const submit = async () => {
    setErr('');
    setSaving(true);
    const res = await sendNotification({
      phase,
      officeId: office?.id ?? null,
      officeName: office?.name ?? null,
      period,
      employeeCount: count,
      message: message.trim() || null,
      triggeredBy: getCurrentAdminEmail(),
    });
    setSaving(false);
    if (!res.ok) return setErr('error' in res ? res.error : 'Failed to send.');
    onDone(`✓ “${meta.notif}” logged for ${office?.name ?? 'all offices'} (${count} employees).`);
  };

  return (
    <Dialog open onClose={onClose} title={`Send “${meta.notif}”`}>
      <div style={{ color: 'var(--text-primary)' }}>
        <p style={{ fontSize: '13px', color: '#6b7280', marginTop: 0 }}>
          Logs that PM triggered the {meta.noun}-phase notification to the selected Office Account(s) for {period || 'this cycle'}.
        </p>
        <Field label="Office">
          <select value={officeId} onChange={(e) => setOfficeId(e.target.value)} style={ui.input}>
            <option value="">All offices</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Message (optional)">
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} style={{ ...ui.input, resize: 'vertical' }} placeholder="e.g. Please submit targets by month-end." />
        </Field>
        <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '-4px' }}>
          {count} employee(s) will be recorded as included.
        </p>
        {err && <div style={{ ...ui.bannerErr, margin: '8px 0 12px' }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" onClick={onClose} disabled={saving} style={ui.secondaryBtn}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={saving} style={ui.primaryBtn}>
            {saving ? 'Sending…' : 'Send notification'}
          </button>
        </div>
      </div>
    </Dialog>
  );
};
