import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  FileClock,
  Grid3x3,
  History,
  ListChecks,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { Dialog } from '../../../components/Dialog';
import { POSITIONS, COMPETENCIES } from '../../../constants/positions';
import {
  PROFICIENCY_LEVELS,
  type ChangeLogEntry,
  type ProficiencyLevel,
  type Proposal,
  type ProposalAction,
  type Requirement,
  approveProposal,
  createRequirement,
  listChangeLog,
  listProposals,
  listRequirements,
  rejectProposal,
  removeRequirement,
  submitProposal,
  updateRequirement,
} from '../../../lib/api/competencyFramework';
import { getCurrentAdminEmail } from '../moduleUi';

// ── Shared helpers ─────────────────────────────────────────────────────────────
const LEVEL_CLS: Record<string, string> = {
  Basic: 'bg-slate-100 text-slate-700',
  Intermediate: 'bg-[#363EE8]/10 text-[#363EE8]',
  Advanced: 'bg-emerald-100 text-emerald-800',
};

const LevelPill = ({ level }: { level: string | null }) => (
  <span
    className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${LEVEL_CLS[level ?? ''] ?? LEVEL_CLS.Basic}`}
  >
    {level ?? 'Basic'}
  </span>
);

const ACTION_CLS: Record<string, string> = {
  add: 'bg-emerald-100 text-emerald-800',
  revise: 'bg-[#363EE8]/10 text-[#363EE8]',
  remove: 'bg-red-100 text-red-800',
};

const ActionPill = ({ action }: { action: string }) => (
  <span
    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${ACTION_CLS[action] ?? ACTION_CLS.revise}`}
  >
    {action}
  </span>
);

const Banner = ({ ok, msg }: { ok: boolean; msg: string }) => (
  <div
    className={`flex items-center gap-2 rounded-lg px-4 py-3 text-xs mb-4 ${ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}`}
  >
    {ok ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
    {msg}
  </div>
);

const fieldCls =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#363EE8]';

const FormField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1 mb-3">
    <label className="block text-xs font-semibold text-slate-700">{label}</label>
    {children}
  </div>
);

const CardHeader = ({ icon, title, aside }: { icon: React.ReactNode; title: string; aside?: React.ReactNode }) => (
  <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 font-semibold text-sm text-slate-800">
    <span className="text-[#363EE8]">{icon}</span>
    {title}
    {aside && <div className="ml-auto">{aside}</div>}
  </div>
);

// ── Root component ─────────────────────────────────────────────────────────────
const SUBTABS = [
  { key: 'requirements', label: '3.1 Position Requirements' },
  { key: 'queue', label: '3.2 Review Queue' },
  { key: 'map', label: '3.3 Competency Map' },
  { key: 'log', label: '3.4 Change Log' },
] as const;

type SubtabKey = (typeof SUBTABS)[number]['key'];

export const PMCompetencyFramework = () => {
  const [active, setActive] = useState<SubtabKey>('requirements');

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ListChecks className="h-6 w-6 text-[#363EE8]" />
          Competency Framework
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Module 3 — position requirements, change review, competency lookup, and audit history.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 bg-white rounded-xl border border-slate-200 p-2 shadow-sm">
        {SUBTABS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setActive(s.key)}
            className={`px-4 py-2 text-xs font-bold rounded-md transition ${
              active === s.key ? 'bg-[#363EE8] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {active === 'requirements' && <PMPositionRequirements />}
      {active === 'queue' && <PMReviewQueue />}
      {active === 'map' && <PMCompetencyMap />}
      {active === 'log' && <PMChangeLog />}
    </div>
  );
};

// ── 3.1 Position Requirements ─────────────────────────────────────────────────
const PMPositionRequirements = () => {
  const [reqs, setReqs] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Requirement | 'new' | null>(null);

  const reload = async () => {
    setLoading(true);
    setError('');
    const res = await listRequirements();
    if (res.ok) setReqs(res.data);
    else if ('error' in res) setError(res.error);
    setLoading(false);
  };
  useEffect(() => { void reload(); }, []);

  const flash = (m: string) => { setBanner(m); setTimeout(() => setBanner(''), 5000); };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reqs;
    return reqs.filter(
      (r) => r.position.toLowerCase().includes(q) || r.competency_name.toLowerCase().includes(q),
    );
  }, [reqs, search]);

  const byPosition = useMemo(() => {
    const map = new Map<string, Requirement[]>();
    for (const r of filtered) {
      const list = map.get(r.position) ?? [];
      list.push(r);
      map.set(r.position, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const remove = async (r: Requirement) => {
    const res = await removeRequirement({ requirement: r, by: getCurrentAdminEmail() });
    if (res.ok) { flash(`✓ Removed "${r.competency_name}" from ${r.position}.`); void reload(); }
    else if ('error' in res) setError(res.error);
  };

  return (
    <div className="space-y-4">
      {banner && <Banner ok msg={banner} />}
      {error && <Banner ok={false} msg={error} />}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by position or competency…"
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#363EE8]"
          />
        </div>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="flex items-center gap-1.5 bg-[#363EE8] hover:bg-[#2e35d4] text-white rounded-lg px-4 py-2 text-xs font-semibold shadow transition"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Requirement
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-12 text-center text-sm text-slate-500">
          Loading requirements…
        </div>
      ) : byPosition.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-12 text-center text-sm text-slate-500">
          {reqs.length === 0
            ? 'No competency requirements yet. Use "Add Requirement".'
            : 'No requirements match your search.'}
        </div>
      ) : (
        byPosition.map(([position, items]) => (
          <div key={position} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <CardHeader
              icon={<ListChecks className="h-4 w-4" />}
              title={position}
              aside={
                <span className="text-xs font-medium text-slate-500">{items.length} competencies</span>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {items.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-semibold text-slate-800 w-1/4">{r.competency_name}</td>
                      <td className="px-4 py-3 text-slate-500">{r.description || '—'}</td>
                      <td className="px-4 py-3 w-28">
                        <LevelPill level={r.proficiency_level} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap w-24">
                        <button
                          type="button"
                          onClick={() => setEditing(r)}
                          className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 mr-1.5 transition"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(r)}
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
          </div>
        ))
      )}

      {editing && (
        <PMRequirementModal
          existing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={(m) => { flash(m); setEditing(null); void reload(); }}
        />
      )}
    </div>
  );
};

const PMRequirementModal = ({
  existing,
  onClose,
  onDone,
}: {
  existing: Requirement | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) => {
  const [position, setPosition] = useState(existing?.position ?? '');
  const [competency, setCompetency] = useState(existing?.competency_name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [level, setLevel] = useState<ProficiencyLevel>(existing?.proficiency_level ?? 'Basic');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    if (!existing && !position) return setErr('Select a position.');
    if (!existing && !competency.trim()) return setErr('Enter a competency name.');
    setSaving(true);
    const by = getCurrentAdminEmail();
    const res = existing
      ? await updateRequirement({ id: existing.id, description: description || null, proficiencyLevel: level, by, prev: existing })
      : await createRequirement({ position, competencyName: competency.trim(), description: description || null, proficiencyLevel: level, by });
    setSaving(false);
    if (!res.ok) return setErr('error' in res ? res.error : 'Failed to save.');
    onDone(`✓ Requirement ${existing ? 'updated' : 'added'}.`);
  };

  return (
    <Dialog open onClose={onClose} title={existing ? 'Edit Requirement' : 'Add Requirement'}>
      <div className="space-y-1">
        <FormField label="Position">
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            disabled={Boolean(existing)}
            className={fieldCls}
          >
            <option value="">Select a position…</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
            {existing && !POSITIONS.includes(existing.position as any) && (
              <option value={existing.position}>{existing.position}</option>
            )}
          </select>
        </FormField>
        <FormField label="Competency">
          <input
            list="pm-competency-suggestions"
            value={competency}
            onChange={(e) => setCompetency(e.target.value)}
            disabled={Boolean(existing)}
            placeholder="e.g. Data and Records Management"
            className={fieldCls}
          />
          <datalist id="pm-competency-suggestions">
            {COMPETENCIES.map((c) => <option key={c} value={c} />)}
          </datalist>
        </FormField>
        <FormField label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What this competency entails"
            className={`${fieldCls} resize-y`}
          />
        </FormField>
        <FormField label="Proficiency level">
          <select value={level} onChange={(e) => setLevel(e.target.value as ProficiencyLevel)} className={fieldCls}>
            {PROFICIENCY_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </FormField>
        {err && <Banner ok={false} msg={err} />}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={saving} className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-lg px-4 py-2 text-xs font-semibold transition">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={saving} className="bg-[#363EE8] hover:bg-[#2e35d4] text-white rounded-lg px-4 py-2 text-xs font-semibold shadow transition">
            {saving ? 'Saving…' : existing ? 'Save changes' : 'Add'}
          </button>
        </div>
      </div>
    </Dialog>
  );
};

// ── 3.2 Review Queue ──────────────────────────────────────────────────────────
const PMReviewQueue = () => {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [reqs, setReqs] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');
  const [showPropose, setShowPropose] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<Proposal | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [busyId, setBusyId] = useState('');

  const reload = async () => {
    setLoading(true);
    setError('');
    const [pRes, rRes] = await Promise.all([listProposals(), listRequirements()]);
    if (pRes.ok) setProposals(pRes.data);
    else if ('error' in pRes) setError(pRes.error);
    if (rRes.ok) setReqs(rRes.data);
    setLoading(false);
  };
  useEffect(() => { void reload(); }, []);

  const flash = (m: string) => { setBanner(m); setTimeout(() => setBanner(''), 5000); };

  const approve = async (p: Proposal) => {
    setBusyId(p.id);
    const res = await approveProposal(p, getCurrentAdminEmail());
    setBusyId('');
    if (res.ok) { flash('✓ Proposal approved and applied to Position Requirements.'); void reload(); }
    else if ('error' in res) setError(res.error);
  };

  const doReject = async () => {
    if (!rejectTarget) return;
    setBusyId(rejectTarget.id);
    const res = await rejectProposal(rejectTarget.id, getCurrentAdminEmail(), rejectNote.trim());
    setBusyId('');
    setRejectTarget(null);
    setRejectNote('');
    if (res.ok) { flash('✓ Proposal rejected.'); void reload(); }
    else if ('error' in res) setError(res.error);
  };

  const pending = proposals.filter((p) => p.status === 'Pending');
  const reviewed = proposals.filter((p) => p.status !== 'Pending');

  return (
    <div className="space-y-4">
      {banner && <Banner ok msg={banner} />}
      {error && <Banner ok={false} msg={error} />}

      <div className="flex items-center gap-3">
        <p className="text-xs text-slate-500 flex-1">
          Proposed changes wait here for PM validation before the live Position Requirements list updates.
        </p>
        <button
          type="button"
          onClick={() => setShowPropose(true)}
          className="flex items-center gap-1.5 bg-[#363EE8] hover:bg-[#2e35d4] text-white rounded-lg px-4 py-2 text-xs font-semibold shadow transition"
        >
          <Plus className="h-3.5 w-3.5" />
          Propose Change
        </button>
      </div>

      {/* Pending proposals */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <CardHeader
          icon={<FileClock className="h-4 w-4" />}
          title="Pending"
          aside={
            !loading && (
              <span className="text-xs font-medium text-slate-500">{pending.length}</span>
            )
          }
        />
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">Loading…</div>
        ) : pending.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">No pending proposals.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map((p) => (
              <li key={p.id} className="flex items-start gap-3 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <ActionPill action={p.action} />
                    <strong className="text-xs text-slate-800">{p.competency_name}</strong>
                    <span className="text-xs text-slate-500">· {p.position}</span>
                    {p.proficiency_level && <LevelPill level={p.proficiency_level} />}
                    {p.rsp_input && (
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                        RSP input
                      </span>
                    )}
                  </div>
                  {p.description && (
                    <p className="text-xs text-slate-500 mb-1">{p.description}</p>
                  )}
                  <p className="text-[11px] text-slate-400">
                    Submitted by {p.submitted_by || 'unknown'} · {new Date(p.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => approve(p)}
                    disabled={busyId === p.id}
                    className="flex items-center gap-1 bg-[#363EE8] hover:bg-[#2e35d4] text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"
                  >
                    <ShieldCheck className="h-3 w-3" />
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectTarget(p)}
                    disabled={busyId === p.id}
                    className="flex items-center gap-1 border border-red-200 bg-white hover:bg-red-50 text-red-700 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"
                  >
                    <X className="h-3 w-3" />
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Reviewed proposals */}
      {reviewed.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <CardHeader icon={<History className="h-4 w-4" />} title="Reviewed" />
          <ul className="divide-y divide-slate-100">
            {reviewed.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-xs">
                <ActionPill action={p.action} />
                <span className="text-slate-700">
                  <strong>{p.competency_name}</strong> · {p.position}
                </span>
                <span
                  className={`ml-auto font-semibold ${p.status === 'Approved' ? 'text-emerald-700' : 'text-red-700'}`}
                >
                  {p.status}
                  {p.reviewed_by ? ` · ${p.reviewed_by}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showPropose && (
        <PMProposeModal
          requirements={reqs}
          onClose={() => setShowPropose(false)}
          onDone={(m) => { flash(m); setShowPropose(false); void reload(); }}
        />
      )}

      <Dialog open={Boolean(rejectTarget)} onClose={() => setRejectTarget(null)} title="Reject Proposal">
        {rejectTarget && (
          <div className="space-y-3">
            <p className="text-xs text-slate-600 leading-relaxed">
              Reject the proposal to {rejectTarget.action} &ldquo;{rejectTarget.competency_name}&rdquo; for{' '}
              {rejectTarget.position}?
            </p>
            <FormField label="Reason (optional)">
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                rows={2}
                className={`${fieldCls} resize-y`}
              />
            </FormField>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRejectTarget(null)} className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-lg px-4 py-2 text-xs font-semibold transition">
                Cancel
              </button>
              <button type="button" onClick={doReject} className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-xs font-semibold shadow transition">
                Reject
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};

const PMProposeModal = ({
  requirements,
  onClose,
  onDone,
}: {
  requirements: Requirement[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) => {
  const [action, setAction] = useState<ProposalAction>('add');
  const [position, setPosition] = useState('');
  const [competency, setCompetency] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState<ProficiencyLevel>('Basic');
  const [targetId, setTargetId] = useState('');
  const [rspInput, setRspInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const onPickTarget = (id: string) => {
    setTargetId(id);
    const t = requirements.find((r) => r.id === id);
    if (t) {
      setPosition(t.position);
      setCompetency(t.competency_name);
      setDescription(t.description ?? '');
      setLevel(t.proficiency_level);
    }
  };

  const submit = async () => {
    setErr('');
    if (action === 'add') {
      if (!position) return setErr('Select a position.');
      if (!competency.trim()) return setErr('Enter a competency name.');
    } else if (!targetId) {
      return setErr('Select the requirement to ' + action + '.');
    }
    setSaving(true);
    const res = await submitProposal({
      action,
      position,
      competencyName: competency.trim(),
      description: description || null,
      proficiencyLevel: action === 'remove' ? null : level,
      targetRequirementId: action === 'add' ? null : targetId,
      rspInput,
      by: getCurrentAdminEmail(),
    });
    setSaving(false);
    if (!res.ok) return setErr('error' in res ? res.error : 'Failed to submit.');
    onDone('✓ Proposal submitted to the Review Queue.');
  };

  return (
    <Dialog open onClose={onClose} title="Propose Competency Change">
      <div className="space-y-1">
        <FormField label="Change type">
          <select
            value={action}
            onChange={(e) => { setAction(e.target.value as ProposalAction); setTargetId(''); }}
            className={fieldCls}
          >
            <option value="add">Add a new competency</option>
            <option value="revise">Revise an existing one</option>
            <option value="remove">Remove one</option>
          </select>
        </FormField>

        {action === 'add' ? (
          <>
            <FormField label="Position">
              <select value={position} onChange={(e) => setPosition(e.target.value)} className={fieldCls}>
                <option value="">Select a position…</option>
                {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </FormField>
            <FormField label="Competency">
              <input
                value={competency}
                onChange={(e) => setCompetency(e.target.value)}
                placeholder="e.g. Data and Records Management"
                className={fieldCls}
              />
            </FormField>
          </>
        ) : (
          <FormField label="Target requirement">
            <select value={targetId} onChange={(e) => onPickTarget(e.target.value)} className={fieldCls}>
              <option value="">Select a requirement…</option>
              {requirements.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.position} — {r.competency_name} ({r.proficiency_level})
                </option>
              ))}
            </select>
          </FormField>
        )}

        {action !== 'remove' && (
          <>
            <FormField label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className={`${fieldCls} resize-y`}
              />
            </FormField>
            <FormField label="Proficiency level">
              <select value={level} onChange={(e) => setLevel(e.target.value as ProficiencyLevel)} className={fieldCls}>
                {PROFICIENCY_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </FormField>
          </>
        )}

        <label className="flex items-center gap-2 mb-3 cursor-pointer text-xs text-slate-700">
          <input
            type="checkbox"
            checked={rspInput}
            onChange={(e) => setRspInput(e.target.checked)}
            className="rounded"
          />
          Flag as RSP input (for PM visibility)
        </label>

        {err && <Banner ok={false} msg={err} />}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={saving} className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-lg px-4 py-2 text-xs font-semibold transition">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={saving} className="bg-[#363EE8] hover:bg-[#2e35d4] text-white rounded-lg px-4 py-2 text-xs font-semibold shadow transition">
            {saving ? 'Submitting…' : 'Submit proposal'}
          </button>
        </div>
      </div>
    </Dialog>
  );
};

// ── 3.3 Competency Map ────────────────────────────────────────────────────────
const PMCompetencyMap = () => {
  const [reqs, setReqs] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await listRequirements();
      if (res.ok) setReqs(res.data);
      else if ('error' in res) setError(res.error);
      setLoading(false);
    })();
  }, []);

  const positions = useMemo(() => Array.from(new Set(reqs.map((r) => r.position))).sort(), [reqs]);

  const view = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reqs.filter(
      (r) =>
        (!positionFilter || r.position === positionFilter) &&
        (!levelFilter || r.proficiency_level === levelFilter) &&
        (!q ||
          r.competency_name.toLowerCase().includes(q) ||
          (r.description ?? '').toLowerCase().includes(q)),
    );
  }, [reqs, positionFilter, levelFilter, search]);

  return (
    <div className="space-y-4">
      {error && <Banner ok={false} msg={error} />}

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search competency…"
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#363EE8]"
          />
        </div>
        <select
          value={positionFilter}
          onChange={(e) => setPositionFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#363EE8]"
        >
          <option value="">All positions</option>
          {positions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#363EE8]"
        >
          <option value="">All levels</option>
          {PROFICIENCY_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <CardHeader
          icon={<Grid3x3 className="h-4 w-4" />}
          title="Competency Map"
          aside={
            !loading && (
              <span className="text-xs font-medium text-slate-500">{view.length} rows</span>
            )
          }
        />
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">Loading…</div>
        ) : view.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            No requirements match the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold">
                  <th className="px-4 py-2.5">Position</th>
                  <th className="px-4 py-2.5">Competency</th>
                  <th className="px-4 py-2.5">Level</th>
                  <th className="px-4 py-2.5">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {view.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-semibold text-slate-800">{r.position}</td>
                    <td className="px-4 py-3">{r.competency_name}</td>
                    <td className="px-4 py-3"><LevelPill level={r.proficiency_level} /></td>
                    <td className="px-4 py-3 text-slate-500">{r.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ── 3.4 Change Log ────────────────────────────────────────────────────────────
const PMChangeLog = () => {
  const [entries, setEntries] = useState<ChangeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setEntries(await listChangeLog());
      setLoading(false);
    })();
  }, []);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <CardHeader
        icon={<ShieldCheck className="h-4 w-4" />}
        title="Change Log"
        aside={
          !loading && (
            <span className="text-xs font-medium text-slate-500">{entries.length} entries</span>
          )
        }
      />
      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-500">No changes recorded yet.</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start gap-3 px-5 py-3">
              <ActionPill action={e.action} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-700">{e.summary || '—'}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {e.approved_by || 'unknown'} ·{' '}
                  {e.source === 'review-queue' ? 'via Review Queue' : 'direct edit'} ·{' '}
                  {new Date(e.created_at).toLocaleString()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
