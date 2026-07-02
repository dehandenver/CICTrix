import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Check,
  ChevronDown,
  ClipboardCheck,
  GraduationCap,
  Lock,
  Pencil,
  Search,
  Send,
  Trash2,
  TrendingUp,
  UserPlus,
} from 'lucide-react';
import { Dialog } from '../../../components/Dialog';
import { listDepartments, type Department } from '../../../lib/api/departments';
import { listEmployeeOptions, type EmployeeOption } from '../../../lib/api/officeRoles';
import { getActiveCyclePeriod } from '../../../lib/api/compliance';
import { listLockedTargets, type LockedTargetRow } from '../../../lib/api/lockedTargets';
import { getEmployeeHistory, type EmployeeHistory } from '../../../lib/api/performanceHistory';
import { IPCR_STAGES, type IpcrStage, stagePillStyle } from '../../../lib/api/ipcrStages';
import {
  type IpcrNotification,
  type IpcrPhase,
  type SubmissionRow,
  getSubmissionTracker,
  listNotifications,
  sendNotification,
  setSubmissionStage,
} from '../../../lib/api/ipcrSubmissions';
import {
  type NewEntrant,
  type NewEntrantInput,
  createNewEntrant,
  deleteNewEntrant,
  listNewEntrants,
  updateNewEntrant,
} from '../../../lib/api/newEntrants';
import { getCurrentAdminEmail } from '../moduleUi';

const SUBTABS = [
  { key: 'onboarding', label: '2.1 New Entrant Onboarding' },
  { key: 'target-setting', label: '2.2 Target Setting' },
  { key: 'accomplishment', label: '2.3 Accomplishment Rating' },
  { key: 'history', label: '2.4 Performance History' },
] as const;

type SubtabKey = (typeof SUBTABS)[number]['key'];

export const PMIPCRManagement = () => {
  const [active, setActive] = useState<SubtabKey>('onboarding');

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-[#363EE8]" />
          IPCR Management
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Module 2 — onboarding, target-setting, accomplishment rating, and performance history.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 bg-white rounded-xl border border-slate-200 p-2 shadow-sm">
        {SUBTABS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setActive(s.key)}
            className={`px-4 py-2 text-xs font-bold rounded-md transition ${
              active === s.key
                ? 'bg-[#363EE8] text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {active === 'onboarding' && <PMNewEntrantOnboarding />}
      {active === 'target-setting' && <PMSubmissionPhasePanel phase="target" />}
      {active === 'accomplishment' && <PMSubmissionPhasePanel phase="rating" showLockedTargets />}
      {active === 'history' && <PMPerformanceHistory />}
    </div>
  );
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

const Banner = ({ ok, msg }: { ok: boolean; msg: string }) => (
  <div
    className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm mb-4 ${
      ok
        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
        : 'bg-red-50 border border-red-200 text-red-800'
    }`}
  >
    {ok ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
    {msg}
  </div>
);

const MetricCard = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
    <div className="h-10 w-10 rounded-xl bg-[#363EE8]/10 text-[#363EE8] grid place-content-center shrink-0">
      {icon}
    </div>
    <div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  </div>
);

// ── Subtab 2.1: New Entrant Onboarding ────────────────────────────────────────
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

const PMNewEntrantOnboarding = () => {
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
    const [res, emps, deps] = await Promise.all([
      listNewEntrants(),
      listEmployeeOptions(),
      listDepartments(true),
    ]);
    if (res.ok) setEntrants(res.data);
    else if ('error' in res) setError(res.error);
    setEmployees(emps);
    setDepartments(deps.success ? deps.data : []);
    setLoading(false);
  };

  useEffect(() => { void reload(); }, []);

  const flash = (m: string) => { setBanner(m); setTimeout(() => setBanner(''), 6000); };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entrants;
    return entrants.filter(
      (e) =>
        (e.employee_name ?? '').toLowerCase().includes(q) ||
        (e.office_name ?? '').toLowerCase().includes(q),
    );
  }, [entrants, search]);

  const metrics = useMemo(() => {
    const total = entrants.length;
    const orientationDone = entrants.filter((e) => e.orientation_completed_date).length;
    const targetsForwarded = entrants.filter(
      (e) => e.initial_target_stage === 'Forwarded to PM',
    ).length;
    return { total, orientationDone, targetsForwarded };
  }, [entrants]);

  const remove = async (id: string) => {
    const res = await deleteNewEntrant(id);
    if (res.ok) { flash('✓ New entrant record removed.'); void reload(); }
    else if ('error' in res) setError(res.error);
  };

  return (
    <div className="space-y-4">
      {banner && <Banner ok msg={banner} />}
      {error && <Banner ok={false} msg={error} />}

      <div className="grid grid-cols-3 gap-3">
        <MetricCard icon={<UserPlus className="h-5 w-5" />} label="New entrants" value={metrics.total} />
        <MetricCard
          icon={<GraduationCap className="h-5 w-5" />}
          label="Orientation completed"
          value={`${metrics.orientationDone}/${metrics.total}`}
        />
        <MetricCard
          icon={<Send className="h-5 w-5" />}
          label="Initial targets forwarded"
          value={`${metrics.targetsForwarded}/${metrics.total}`}
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by employee or office…"
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#363EE8]"
          />
        </div>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="flex items-center gap-1.5 bg-[#363EE8] hover:bg-[#2e35d4] text-white rounded-lg px-4 py-2 text-xs font-semibold shadow transition"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Add New Entrant
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 font-semibold text-sm text-slate-800">
          <UserPlus className="h-4 w-4 text-[#363EE8]" />
          New Entrants
          {!loading && (
            <span className="ml-auto text-xs font-medium text-slate-500">{filtered.length}</span>
          )}
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500">Loading new entrants…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            {entrants.length === 0
              ? 'No new entrants tracked yet. Use "Add New Entrant".'
              : 'No records match your search.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold">
                  <th className="px-4 py-2.5">Employee</th>
                  <th className="px-4 py-2.5">Office</th>
                  <th className="px-4 py-2.5">Start</th>
                  <th className="px-4 py-2.5">Orientation</th>
                  <th className="px-4 py-2.5">Target Deadline</th>
                  <th className="px-4 py-2.5">Initial Target Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-semibold text-slate-800">{e.employee_name || '—'}</td>
                    <td className="px-4 py-3">{e.office_name || '—'}</td>
                    <td className="px-4 py-3">{fmtDate(e.start_date)}</td>
                    <td className="px-4 py-3">
                      <div>
                        {e.orientation_completed_date
                          ? `Done ${fmtDate(e.orientation_completed_date)}`
                          : e.orientation_date
                            ? `Sched. ${fmtDate(e.orientation_date)}`
                            : '—'}
                      </div>
                      {e.orientation_conducted_by && (
                        <div className="text-slate-400 mt-0.5">by {e.orientation_conducted_by}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">{fmtDate(e.target_setting_deadline)}</td>
                    <td className="px-4 py-3">
                      <span style={stagePillStyle(e.initial_target_stage)}>
                        {e.initial_target_stage}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setEditing(e)}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 mr-1.5 transition"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(e.id)}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-red-200 bg-white hover:bg-red-50 text-red-600 transition"
                        title="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
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
        <PMEntrantModal
          existing={editing === 'new' ? null : editing}
          employees={employees}
          departments={departments}
          onClose={() => setEditing(null)}
          onDone={(msg) => { flash(msg); setEditing(null); void reload(); }}
        />
      )}
    </div>
  );
};

const FormField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1 mb-3">
    <label className="block text-xs font-semibold text-slate-700">{label}</label>
    {children}
  </div>
);

const fieldCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#363EE8]';

const PMEntrantModal = ({
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

  const set = <K extends keyof NewEntrantInput>(k: K, v: NewEntrantInput[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

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
    const res = existing
      ? await updateNewEntrant(existing.id, form)
      : await createNewEntrant(form, getCurrentAdminEmail());
    setSaving(false);
    if (!res.ok) return setErr('error' in res ? res.error : 'Failed to save.');
    onDone(`✓ ${form.employeeName || 'New entrant'} ${existing ? 'updated' : 'added'}.`);
  };

  return (
    <Dialog open onClose={onClose} title={existing ? 'Edit New Entrant' : 'Add New Entrant'}>
      <div className="space-y-1">
        <FormField label="Employee">
          <select
            value={form.employeeId}
            onChange={(e) => onPickEmployee(e.target.value)}
            disabled={Boolean(existing)}
            className={fieldCls}
          >
            <option value="">Select an employee…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name}
                {e.department ? ` — ${e.department}` : ''}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Office">
          <select
            value={form.officeId ?? ''}
            onChange={(e) => {
              const d = departments.find((x) => x.id === e.target.value);
              set('officeId', e.target.value || null);
              set('officeName', d?.name ?? null);
            }}
            className={fieldCls}
          >
            <option value="">(optional) Select an office…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Start date">
            <input
              type="date"
              value={form.startDate ?? ''}
              onChange={(e) => set('startDate', e.target.value || null)}
              className={fieldCls}
            />
          </FormField>
          <FormField label="Target-setting deadline">
            <input
              type="date"
              value={form.targetSettingDeadline ?? ''}
              onChange={(e) => set('targetSettingDeadline', e.target.value || null)}
              className={fieldCls}
            />
          </FormField>
        </div>

        <p className="text-xs font-bold text-slate-700 mt-2 mb-1">Job Orientation Log</p>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Scheduled orientation date">
            <input
              type="date"
              value={form.orientationDate ?? ''}
              onChange={(e) => set('orientationDate', e.target.value || null)}
              className={fieldCls}
            />
          </FormField>
          <FormField label="Completed on">
            <input
              type="date"
              value={form.orientationCompletedDate ?? ''}
              onChange={(e) => set('orientationCompletedDate', e.target.value || null)}
              className={fieldCls}
            />
          </FormField>
        </div>

        <FormField label="Conducted by">
          <input
            type="text"
            value={form.orientationConductedBy ?? ''}
            onChange={(e) => set('orientationConductedBy', e.target.value || null)}
            placeholder="Name of briefer"
            className={fieldCls}
          />
        </FormField>

        <FormField label="Initial target-setting status">
          <select
            value={form.initialTargetStage}
            onChange={(e) => set('initialTargetStage', e.target.value as IpcrStage)}
            className={fieldCls}
          >
            {IPCR_STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Notes">
          <textarea
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value || null)}
            rows={2}
            className={`${fieldCls} resize-y`}
          />
        </FormField>

        {err && <Banner ok={false} msg={err} />}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-lg px-4 py-2 text-xs font-semibold transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="bg-[#363EE8] hover:bg-[#2e35d4] text-white rounded-lg px-4 py-2 text-xs font-semibold shadow transition"
          >
            {saving ? 'Saving…' : existing ? 'Save changes' : 'Add entrant'}
          </button>
        </div>
      </div>
    </Dialog>
  );
};

// ── Subtabs 2.2 / 2.3: submission pipeline ────────────────────────────────────
const PHASE_META: Record<IpcrPhase, { notif: string; noun: string; forwardNote: string }> = {
  target: {
    notif: 'Targets Needed',
    noun: 'target',
    forwardNote:
      'Setting a stage to "Forwarded to PM" locks that employee\'s targets into the Locked Targets Vault (Module 1.2).',
  },
  rating: {
    notif: 'Accomplishment Ratings Needed',
    noun: 'accomplishment',
    forwardNote:
      'Setting a stage to "Forwarded to PM" finalizes that employee\'s rating for the office closeout bundle (Module 1.3).',
  },
};

const STAGE_PILL_TW: Record<string, string> = {
  'Not Started': 'bg-slate-100 text-slate-600',
  'In Draft': 'bg-blue-50 text-blue-700',
  'Submitted to Office': 'bg-blue-100 text-blue-800',
  'Returned for Revision': 'bg-amber-100 text-amber-800',
  'Verified': 'bg-emerald-100 text-emerald-800',
  'Forwarded to PM': 'bg-violet-100 text-violet-800',
};

const StagePill = ({ stage }: { stage: string }) => (
  <span
    className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${STAGE_PILL_TW[stage] ?? 'bg-slate-100 text-slate-600'}`}
  >
    {stage}
  </span>
);

const PMSubmissionPhasePanel = ({
  phase,
  showLockedTargets,
}: {
  phase: IpcrPhase;
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

    if (showLockedTargets) {
      const lockedRes = await listLockedTargets();
      const map = new Map<string, LockedTargetRow[]>();
      if (lockedRes.ok) {
        for (const set of lockedRes.data) {
          if (set.period !== p) continue;
          const key = String(set.employee_id ?? '');
          if (!key || map.has(key)) continue;
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
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  useEffect(() => { void reload(); }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const flash = (m: string) => { setBanner(m); setTimeout(() => setBanner(''), 6000); };

  const visible = useMemo(
    () => rows.filter((r) => (!officeFilter || r.officeId === officeFilter) && (!stageFilter || r.stage === stageFilter)),
    [rows, officeFilter, stageFilter],
  );

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
    if (!res.ok) { setError('error' in res ? res.error : 'Failed to update stage.'); return; }
    setRows((prev) => prev.map((r) => (r.employeeId === row.employeeId ? { ...r, stage } : r)));
    if (res.lockedToVault) flash(`✓ ${row.employeeName}: targets locked into the Vault.`);
  };

  return (
    <div className="space-y-4">
      {banner && <Banner ok msg={banner} />}
      {error && <Banner ok={false} msg={error} />}

      <p className="text-xs text-slate-500">
        Period: <strong className="text-slate-800">{period || '—'}</strong>
      </p>

      {/* Notification log */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 font-semibold text-sm text-slate-800">
          <Bell className="h-4 w-4 text-[#363EE8]" />
          Notification Log
          <button
            type="button"
            onClick={() => setShowNotify(true)}
            className="ml-auto flex items-center gap-1.5 bg-[#363EE8] hover:bg-[#2e35d4] text-white rounded-lg px-3 py-1.5 text-xs font-semibold shadow transition"
          >
            <Send className="h-3 w-3" />
            Send &ldquo;{meta.notif}&rdquo;
          </button>
        </div>
        {notifications.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">No notifications sent yet for this phase.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {notifications.map((n) => (
              <li key={n.id} className="flex gap-3 px-5 py-3">
                <Bell className="h-4 w-4 text-[#363EE8] mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-slate-700">
                    <strong>{meta.notif}</strong> → {n.office_name || 'All offices'} · {n.employee_count} employee(s)
                    {n.message ? ` — "${n.message}"` : ''}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {n.triggered_by || 'PM'} · {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pipeline stage summary pills */}
      <div className="flex flex-wrap gap-2">
        {IPCR_STAGES.map((s) => (
          <span
            key={s}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold ${STAGE_PILL_TW[s] ?? 'bg-slate-100 text-slate-600'}`}
          >
            {s} <strong>{stageCounts[s]}</strong>
          </span>
        ))}
      </div>

      {/* Submission tracker */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 font-semibold text-sm text-slate-800">
          <ClipboardCheck className="h-4 w-4 text-[#363EE8]" />
          {phase === 'target' ? 'Submission Tracker' : 'Rating Submission Tracker'}
          <div className="ml-auto flex gap-2">
            <select
              value={officeFilter}
              onChange={(e) => setOfficeFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#363EE8]"
            >
              <option value="">All offices</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value as '' | IpcrStage)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#363EE8]"
            >
              <option value="">All stages</option>
              {IPCR_STAGES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">Loading tracker…</div>
        ) : visible.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            {rows.length === 0
              ? 'No employees found for this cycle. Ensure migrations and employees exist.'
              : 'No employees match the current filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold">
                  <th className="px-4 py-2.5">Employee</th>
                  <th className="px-4 py-2.5">Office</th>
                  <th className="px-4 py-2.5">Stage</th>
                  <th className="px-4 py-2.5">Set Stage</th>
                  <th className="px-4 py-2.5">Updated</th>
                  {showLockedTargets && <th className="px-4 py-2.5 text-right">Locked Targets</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {visible.map((r) => {
                  const locked = showLockedTargets ? lockedMap.get(r.employeeId) : undefined;
                  return (
                    <Fragment key={r.employeeId}>
                      <tr className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-semibold text-slate-800">{r.employeeName}</td>
                        <td className="px-4 py-3">{r.officeName || '—'}</td>
                        <td className="px-4 py-3"><StagePill stage={r.stage} /></td>
                        <td className="px-4 py-3">
                          <select
                            value={r.stage}
                            disabled={savingId === r.employeeId}
                            onChange={(e) => changeStage(r, e.target.value as IpcrStage)}
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#363EE8]"
                          >
                            {IPCR_STAGES.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          {r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : '—'}
                        </td>
                        {showLockedTargets && (
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {locked && locked.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => toggle(r.employeeId)}
                                className="inline-flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg px-2.5 py-1 text-xs font-semibold transition"
                              >
                                <Lock className="h-3 w-3" />
                                {locked.length}
                                <ChevronDown
                                  className={`h-3.5 w-3.5 transition-transform ${expanded.has(r.employeeId) ? 'rotate-180' : ''}`}
                                />
                              </button>
                            ) : (
                              <span className="text-[11px] text-amber-700">Not in Vault</span>
                            )}
                          </td>
                        )}
                      </tr>
                      {showLockedTargets && expanded.has(r.employeeId) && locked && (
                        <tr>
                          <td colSpan={showLockedTargets ? 6 : 5} className="px-4 pb-4 bg-slate-50/50">
                            <div className="rounded-lg border border-slate-200 bg-white p-3 mt-1">
                              <p className="text-[11px] text-slate-400 mb-2">
                                Locked targets (read-only, from Vault) — the employee rates accomplishments against each of these.
                              </p>
                              {locked.length === 0 ? (
                                <p className="text-xs text-slate-500">No target rows in this set.</p>
                              ) : (
                                <ol className="pl-4 space-y-1">
                                  {locked.map((t, i) => (
                                    <li key={i} className="text-xs text-slate-700">
                                      {t.function_type && (
                                        <strong className="text-slate-500">[{t.function_type}] </strong>
                                      )}
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

      <p className="text-[11px] text-slate-400">{meta.forwardNote}</p>

      {showNotify && (
        <PMNotifyModal
          phase={phase}
          period={period}
          departments={departments}
          rows={rows}
          onClose={() => setShowNotify(false)}
          onDone={(msg) => { flash(msg); setShowNotify(false); void reload(); }}
        />
      )}
    </div>
  );
};

const PMNotifyModal = ({
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
    onDone(`✓ "${meta.notif}" logged for ${office?.name ?? 'all offices'} (${count} employees).`);
  };

  return (
    <Dialog open onClose={onClose} title={`Send "${meta.notif}"`}>
      <div className="space-y-3">
        <p className="text-xs text-slate-500">
          Logs that PM triggered the {meta.noun}-phase notification to the selected Office Account(s) for{' '}
          {period || 'this cycle'}.
        </p>
        <FormField label="Office">
          <select value={officeId} onChange={(e) => setOfficeId(e.target.value)} className={fieldCls}>
            <option value="">All offices</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Message (optional)">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            placeholder="e.g. Please submit targets by month-end."
            className={`${fieldCls} resize-y`}
          />
        </FormField>
        <p className="text-[11px] text-slate-400">{count} employee(s) will be recorded as included.</p>
        {err && <Banner ok={false} msg={err} />}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-lg px-4 py-2 text-xs font-semibold transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="bg-[#363EE8] hover:bg-[#2e35d4] text-white rounded-lg px-4 py-2 text-xs font-semibold shadow transition"
          >
            {saving ? 'Sending…' : 'Send notification'}
          </button>
        </div>
      </div>
    </Dialog>
  );
};

// ── Subtab 2.4: Performance History ───────────────────────────────────────────
const scoreTone = (adj: string | null): string => {
  switch (adj) {
    case 'Outstanding': return 'bg-emerald-100 text-emerald-800';
    case 'Very Satisfactory': return 'bg-blue-100 text-blue-800';
    case 'Satisfactory': return 'bg-amber-100 text-amber-800';
    default: return 'bg-red-100 text-red-800';
  }
};

const PMPerformanceHistory = () => {
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
    if (!employeeId) { setHistory(null); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      const res = await getEmployeeHistory(employeeId);
      if (cancelled) return;
      if (res.ok) setHistory(res.data);
      else { setHistory(null); setError('error' in res ? res.error : 'Failed to load history.'); }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [employeeId]);

  const selectedName = employees.find((e) => e.id === employeeId)?.full_name ?? '';

  return (
    <div className="space-y-4">
      {error && <Banner ok={false} msg={error} />}

      <div className="max-w-md">
        <label className="block text-xs font-semibold text-slate-700 mb-1">Employee</label>
        <select
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          disabled={loadingEmployees}
          className={fieldCls}
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
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-12 text-center text-sm text-slate-500">
          Select an employee to view their IPCR track record.
        </div>
      ) : loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-12 text-center text-sm text-slate-500">
          Loading history…
        </div>
      ) : !history || history.cycles.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-12 text-center text-sm text-slate-500">
          No completed IPCR cycles found for {selectedName || 'this employee'}.
        </div>
      ) : (
        <>
          {/* Summary + trends */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <div className="text-2xl font-bold text-slate-900">{history.cyclesCompleted}</div>
                <div className="text-xs text-slate-500">cycles completed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900">
                  {history.avgScore != null ? history.avgScore.toFixed(2) : '—'}
                </div>
                <div className="text-xs text-slate-500">avg rating</div>
              </div>
              {history.trends.length > 0 && (
                <div className="flex flex-wrap gap-2 ml-auto">
                  {history.trends.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#363EE8]/10 text-[#363EE8]"
                    >
                      <TrendingUp className="h-3 w-3" />
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {history.trends.length === 0 && (
                <span className="ml-auto text-xs text-slate-400">Not enough cycles for trend analysis</span>
              )}
            </div>
          </div>

          {/* Cycle timeline */}
          {history.cycles.map((c, i) => (
            <div key={`${c.period}-${i}`} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 font-semibold text-sm text-slate-800">
                <span>{c.period}</span>
                {c.adjectival && (
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${scoreTone(c.adjectival)}`}>
                    {c.finalScore?.toFixed(2)} · {c.adjectival}
                  </span>
                )}
                <span className="ml-auto text-xs font-normal text-slate-400">
                  {c.status ?? '—'}
                  {c.approvedAt ? ` · ${new Date(c.approvedAt).toLocaleDateString()}` : ''}
                </span>
              </div>
              {c.rows.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No target/accomplishment detail recorded for this cycle.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold">
                        <th className="px-4 py-2.5 w-1/2">Target</th>
                        <th className="px-4 py-2.5 w-1/2">Accomplishment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {c.rows.map((r, j) => (
                        <tr key={j} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 align-top">
                            {r.functionType && (
                              <strong className="text-slate-400">[{r.functionType}] </strong>
                            )}
                            {r.target || '—'}
                          </td>
                          <td className={`px-4 py-3 align-top ${r.accomplishment ? '' : 'text-amber-700 italic'}`}>
                            {r.accomplishment || 'No accomplishment recorded'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}

          <p className="text-[11px] text-slate-400">
            Read-only. Feeds promotional application review (Module 4) and performance pattern analysis.
          </p>
        </>
      )}
    </div>
  );
};
