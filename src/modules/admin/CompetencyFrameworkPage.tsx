import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, FileClock, Grid3x3, History, ListChecks, Pencil, Plus, Search, ShieldQuestion, Trash2 } from 'lucide-react';
import { AdminHeader } from '../../components/AdminHeader';
import { Dialog } from '../../components/Dialog';
import { Sidebar } from '../../components/Sidebar';
import { POSITIONS, COMPETENCIES } from '../../constants/positions';
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
} from '../../lib/api/competencyFramework';
import { Field, getCurrentAdminEmail, ui } from './moduleUi';
import '../../styles/admin.css';

const SUBTABS = [
  { key: 'requirements', label: 'Position Requirements' },
  { key: 'queue', label: 'Review Queue' },
  { key: 'map', label: 'Competency Map' },
  { key: 'log', label: 'Change Log' },
] as const;

const levelPill = (level: string | null): React.CSSProperties => {
  const tones: Record<string, { bg: string; fg: string }> = {
    Basic: { bg: 'rgba(107,114,128,0.15)', fg: '#4b5563' },
    Intermediate: { bg: 'rgba(54,62,232,0.1)', fg: '#363EE8' },
    Advanced: { bg: 'rgba(16,185,129,0.14)', fg: '#047857' },
  };
  const t = tones[level ?? ''] ?? tones.Basic;
  return { display: 'inline-block', padding: '2px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, background: t.bg, color: t.fg };
};

export const CompetencyFrameworkPage = () => {
  const [active, setActive] = useState<(typeof SUBTABS)[number]['key']>('requirements');

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <AdminHeader userName="Super Admin" divisionLabel="System Administrator" />
      <div className="admin-layout">
        <Sidebar activeModule="Super" userRole="super-admin" />
        <main className="admin-content">
          <div className="admin-header">
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ListChecks size={26} />
              Competency Framework
            </h1>
            <p className="admin-subtitle">
              Module 3 — position requirements, change review, competency lookup, and audit history.
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

          {active === 'requirements' && <PositionRequirements />}
          {active === 'queue' && <ReviewQueue />}
          {active === 'map' && <CompetencyMap />}
          {active === 'log' && <ChangeLog />}
        </main>
      </div>
    </div>
  );
};

// ── Subtab: Position Requirements ────────────────────────────────────────────
const PositionRequirements = () => {
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
  useEffect(() => {
    void reload();
  }, []);

  const flash = (m: string) => {
    setBanner(m);
    setTimeout(() => setBanner(''), 5000);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reqs;
    return reqs.filter((r) => r.position.toLowerCase().includes(q) || r.competency_name.toLowerCase().includes(q));
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
    if (res.ok) {
      flash(`✓ Removed “${r.competency_name}” from ${r.position}.`);
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

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '420px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by position or competency…" style={{ ...ui.input, paddingLeft: '36px' }} />
        </div>
        <button type="button" onClick={() => setEditing('new')} style={ui.primaryBtn}>
          <Plus size={15} />
          Add Requirement
        </button>
      </div>

      {loading ? (
        <div style={{ ...ui.card, ...ui.emptyBox }}>Loading requirements…</div>
      ) : byPosition.length === 0 ? (
        <div style={{ ...ui.card, ...ui.emptyBox }}>
          {reqs.length === 0
            ? 'No competency requirements yet. Use “Add Requirement”. (Ensure migration 016 has been run.)'
            : 'No requirements match your search.'}
        </div>
      ) : (
        byPosition.map(([position, items]) => (
          <div key={position} style={{ ...ui.card, marginBottom: '14px' }}>
            <div style={ui.cardHeader}>
              {position}
              <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 500, color: '#6b7280' }}>{items.length} competencies</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={{ ...ui.td, width: '28%', fontWeight: 600, color: '#1f2937' }}>{r.competency_name}</td>
                    <td style={{ ...ui.td, color: '#6b7280' }}>{r.description || '—'}</td>
                    <td style={{ ...ui.td, width: '130px' }}>
                      <span style={levelPill(r.proficiency_level)}>{r.proficiency_level}</span>
                    </td>
                    <td style={{ ...ui.td, width: '110px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" onClick={() => setEditing(r)} style={{ ...ui.secondaryBtn, padding: '6px 10px', marginRight: '6px' }} title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button type="button" onClick={() => remove(r)} style={{ ...ui.secondaryBtn, padding: '6px 10px', color: '#b91c1c', borderColor: '#fca5a5' }} title="Remove">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      {editing && (
        <RequirementModal
          existing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={(m) => {
            flash(m);
            setEditing(null);
            void reload();
          }}
        />
      )}
    </div>
  );
};

const RequirementModal = ({
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
      <div style={{ color: 'var(--text-primary)' }}>
        <Field label="Position">
          <select value={position} onChange={(e) => setPosition(e.target.value)} disabled={Boolean(existing)} style={ui.input}>
            <option value="">Select a position…</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            {existing && !POSITIONS.includes(existing.position as any) && <option value={existing.position}>{existing.position}</option>}
          </select>
        </Field>
        <Field label="Competency">
          <input list="competency-suggestions" value={competency} onChange={(e) => setCompetency(e.target.value)} disabled={Boolean(existing)} placeholder="e.g. Data and Records Management" style={ui.input} />
          <datalist id="competency-suggestions">
            {COMPETENCIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What this competency entails" style={{ ...ui.input, resize: 'vertical' }} />
        </Field>
        <Field label="Proficiency level">
          <select value={level} onChange={(e) => setLevel(e.target.value as ProficiencyLevel)} style={ui.input}>
            {PROFICIENCY_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        {err && <div style={{ ...ui.bannerErr, margin: '0 0 12px' }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" onClick={onClose} disabled={saving} style={ui.secondaryBtn}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={saving} style={ui.primaryBtn}>
            {saving ? 'Saving…' : existing ? 'Save changes' : 'Add'}
          </button>
        </div>
      </div>
    </Dialog>
  );
};

// ── Subtab: Review Queue ─────────────────────────────────────────────────────
const ReviewQueue = () => {
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
  useEffect(() => {
    void reload();
  }, []);

  const flash = (m: string) => {
    setBanner(m);
    setTimeout(() => setBanner(''), 5000);
  };

  const approve = async (p: Proposal) => {
    setBusyId(p.id);
    const res = await approveProposal(p, getCurrentAdminEmail());
    setBusyId('');
    if (res.ok) {
      flash('✓ Proposal approved and applied to Position Requirements.');
      void reload();
    } else if ('error' in res) {
      setError(res.error);
    }
  };

  const doReject = async () => {
    if (!rejectTarget) return;
    setBusyId(rejectTarget.id);
    const res = await rejectProposal(rejectTarget.id, getCurrentAdminEmail(), rejectNote.trim());
    setBusyId('');
    setRejectTarget(null);
    setRejectNote('');
    if (res.ok) {
      flash('✓ Proposal rejected.');
      void reload();
    } else if ('error' in res) {
      setError(res.error);
    }
  };

  const pending = proposals.filter((p) => p.status === 'Pending');
  const reviewed = proposals.filter((p) => p.status !== 'Pending');

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

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <p style={{ color: '#6b7280', fontSize: '14px', margin: 0, flex: 1 }}>
          Proposed changes wait here for PM validation before the live Position Requirements list updates.
        </p>
        <button type="button" onClick={() => setShowPropose(true)} style={ui.primaryBtn}>
          <Plus size={15} />
          Propose Change
        </button>
      </div>

      <div style={{ ...ui.card, marginBottom: '20px' }}>
        <div style={ui.cardHeader}>
          <FileClock size={18} />
          Pending
          <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 500, color: '#6b7280' }}>{loading ? '' : pending.length}</span>
        </div>
        {loading ? (
          <div style={ui.emptyBox}>Loading…</div>
        ) : pending.length === 0 ? (
          <div style={ui.emptyBox}>No pending proposals.</div>
        ) : (
          pending.map((p) => (
            <div key={p.id} style={{ borderTop: '1px solid #f0f0f0', padding: '14px 20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={actionPill(p.action)}>{p.action}</span>
                  <strong style={{ color: '#1f2937' }}>{p.competency_name}</strong>
                  <span style={{ color: '#6b7280', fontSize: '13px' }}>· {p.position}</span>
                  {p.proficiency_level && <span style={levelPill(p.proficiency_level)}>{p.proficiency_level}</span>}
                  {p.rsp_input && (
                    <span style={{ ...levelPill('Intermediate'), background: 'rgba(245,158,11,0.15)', color: '#b45309' }}>RSP input</span>
                  )}
                </div>
                {p.description && <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>{p.description}</div>}
                <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                  Submitted by {p.submitted_by || 'unknown'} · {new Date(p.created_at).toLocaleString()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => approve(p)} disabled={busyId === p.id} style={{ ...ui.primaryBtn, padding: '7px 12px' }}>
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => setRejectTarget(p)}
                  disabled={busyId === p.id}
                  style={{ ...ui.secondaryBtn, padding: '7px 12px', color: '#b91c1c', borderColor: '#fca5a5' }}
                >
                  Reject
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {reviewed.length > 0 && (
        <div style={ui.card}>
          <div style={ui.cardHeader}>
            <History size={18} />
            Reviewed
          </div>
          {reviewed.map((p) => (
            <div key={p.id} style={{ borderTop: '1px solid #f0f0f0', padding: '12px 20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span style={actionPill(p.action)}>{p.action}</span>
              <span style={{ fontSize: '13px', color: '#374151' }}>
                <strong>{p.competency_name}</strong> · {p.position}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: '12px', color: p.status === 'Approved' ? '#047857' : '#b91c1c', fontWeight: 600 }}>
                {p.status}
                {p.reviewed_by ? ` · ${p.reviewed_by}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {showPropose && (
        <ProposeModal
          requirements={reqs}
          onClose={() => setShowPropose(false)}
          onDone={(m) => {
            flash(m);
            setShowPropose(false);
            void reload();
          }}
        />
      )}

      <Dialog open={Boolean(rejectTarget)} onClose={() => setRejectTarget(null)} title="Reject Proposal">
        {rejectTarget && (
          <div style={{ color: 'var(--text-primary)' }}>
            <p style={{ marginTop: 0, lineHeight: 1.5 }}>
              Reject the proposal to {rejectTarget.action} “{rejectTarget.competency_name}” for {rejectTarget.position}?
            </p>
            <Field label="Reason (optional)">
              <textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={2} style={{ ...ui.input, resize: 'vertical' }} />
            </Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setRejectTarget(null)} style={ui.secondaryBtn}>
                Cancel
              </button>
              <button type="button" onClick={doReject} style={{ ...ui.primaryBtn, background: '#dc2626' }}>
                Reject
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};

const ProposeModal = ({
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
      <div style={{ color: 'var(--text-primary)' }}>
        <Field label="Change type">
          <select value={action} onChange={(e) => { setAction(e.target.value as ProposalAction); setTargetId(''); }} style={ui.input}>
            <option value="add">Add a new competency</option>
            <option value="revise">Revise an existing one</option>
            <option value="remove">Remove one</option>
          </select>
        </Field>

        {action === 'add' ? (
          <>
            <Field label="Position">
              <select value={position} onChange={(e) => setPosition(e.target.value)} style={ui.input}>
                <option value="">Select a position…</option>
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Competency">
              <input value={competency} onChange={(e) => setCompetency(e.target.value)} style={ui.input} />
            </Field>
          </>
        ) : (
          <Field label="Target requirement">
            <select value={targetId} onChange={(e) => onPickTarget(e.target.value)} style={ui.input}>
              <option value="">Select a requirement…</option>
              {requirements.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.position} — {r.competency_name} ({r.proficiency_level})
                </option>
              ))}
            </select>
          </Field>
        )}

        {action !== 'remove' && (
          <>
            <Field label="Description">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ ...ui.input, resize: 'vertical' }} />
            </Field>
            <Field label="Proficiency level">
              <select value={level} onChange={(e) => setLevel(e.target.value as ProficiencyLevel)} style={ui.input}>
                {PROFICIENCY_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', cursor: 'pointer' }}>
          <input type="checkbox" checked={rspInput} onChange={(e) => setRspInput(e.target.checked)} />
          <span style={{ fontSize: '13px' }}>Flag as RSP input (for PM visibility)</span>
        </label>

        {err && <div style={{ ...ui.bannerErr, margin: '0 0 12px' }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" onClick={onClose} disabled={saving} style={ui.secondaryBtn}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={saving} style={ui.primaryBtn}>
            {saving ? 'Submitting…' : 'Submit proposal'}
          </button>
        </div>
      </div>
    </Dialog>
  );
};

const actionPill = (action: string): React.CSSProperties => {
  const tones: Record<string, { bg: string; fg: string }> = {
    add: { bg: 'rgba(16,185,129,0.14)', fg: '#047857' },
    revise: { bg: 'rgba(54,62,232,0.1)', fg: '#363EE8' },
    remove: { bg: 'rgba(220,38,38,0.12)', fg: '#b91c1c' },
  };
  const t = tones[action] ?? tones.revise;
  return { display: 'inline-block', padding: '1px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', background: t.bg, color: t.fg };
};

// ── Subtab: Competency Map ───────────────────────────────────────────────────
const CompetencyMap = () => {
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
        (!q || r.competency_name.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q)),
    );
  }, [reqs, positionFilter, levelFilter, search]);

  return (
    <div>
      {error && (
        <div style={ui.bannerErr}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px', maxWidth: '360px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search competency…" style={{ ...ui.input, paddingLeft: '36px' }} />
        </div>
        <select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)} style={{ ...ui.input, width: 'auto' }}>
          <option value="">All positions</option>
          {positions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} style={{ ...ui.input, width: 'auto' }}>
          <option value="">All levels</option>
          {PROFICIENCY_LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>

      <div style={ui.card}>
        <div style={ui.cardHeader}>
          <Grid3x3 size={18} />
          Competency Map
          <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 500, color: '#6b7280' }}>{loading ? '' : `${view.length} rows`}</span>
        </div>
        {loading ? (
          <div style={ui.emptyBox}>Loading…</div>
        ) : view.length === 0 ? (
          <div style={ui.emptyBox}>No requirements match the current filters.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: '#f9fafb', textAlign: 'left', color: '#6b7280' }}>
                  <th style={ui.th}>Position</th>
                  <th style={ui.th}>Competency</th>
                  <th style={ui.th}>Level</th>
                  <th style={ui.th}>Description</th>
                </tr>
              </thead>
              <tbody>
                {view.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={{ ...ui.td, fontWeight: 600, color: '#1f2937' }}>{r.position}</td>
                    <td style={ui.td}>{r.competency_name}</td>
                    <td style={ui.td}>
                      <span style={levelPill(r.proficiency_level)}>{r.proficiency_level}</span>
                    </td>
                    <td style={{ ...ui.td, color: '#6b7280' }}>{r.description || '—'}</td>
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

// ── Subtab: Change Log ───────────────────────────────────────────────────────
const ChangeLog = () => {
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
    <div style={ui.card}>
      <div style={ui.cardHeader}>
        <ShieldQuestion size={18} />
        Change Log
        <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 500, color: '#6b7280' }}>{loading ? '' : `${entries.length} entries`}</span>
      </div>
      {loading ? (
        <div style={ui.emptyBox}>Loading…</div>
      ) : entries.length === 0 ? (
        <div style={ui.emptyBox}>No changes recorded yet.</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: '6px 0' }}>
          {entries.map((e) => (
            <li key={e.id} style={{ display: 'flex', gap: '12px', padding: '10px 20px', borderTop: '1px solid #f5f5f5' }}>
              <span style={actionPill(e.action)}>{e.action}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', color: '#374151' }}>{e.summary || '—'}</div>
                <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                  {e.approved_by || 'unknown'} · {e.source === 'review-queue' ? 'via Review Queue' : 'direct edit'} ·{' '}
                  {new Date(e.created_at).toLocaleString()}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
