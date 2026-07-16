/**
 * IPCR Demo — Employee IPCR tab (Stages 3, 5, 7).
 *
 * One screen that follows the employee's schedule status:
 *   Phase1 Open      → blank Target-Setting form (Add Row + live weight checks)
 *   Phase1 Submitted → read-only submission + "awaiting review" banner
 *   Phase1 Verified/Locked → the Office-Account-revised version, with the
 *                    "Revised by Office Account" marker on changed fields
 *   Phase2 Open      → Accomplishment form: locked targets left, Q/E/T right
 *   Phase2 Submitted → read-only accomplishments
 *   Phase2 Verified / Cycle Completed → final, with revision markers
 *
 * No content is pre-filled — the employee types everything live.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  getSchedule,
  listTargets,
  listAccomplishments,
  submitTargets,
  submitAccomplishments,
  type TargetInput,
  type AccomplishmentInput,
} from './workflow';
import {
  TARGET_CATEGORIES,
  STATUS_BANNER,
  officialMfo,
  officialIndicator,
  officialAccomplishment,
} from './types';
import type { DemoAccount, Schedule, TargetRow, AccomplishmentRow, TargetCategory } from './types';

const inputCls =
  'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none';

export function EmployeeIPCR({ account }: { account: DemoAccount }) {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [accs, setAccs] = useState<AccomplishmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const [s, t, a] = await Promise.all([
      getSchedule(account.id),
      listTargets(account.id),
      listAccomplishments(account.id),
    ]);
    if (s.ok) setSchedule(s.data);
    if (t.ok) setTargets(t.data);
    if (a.ok) setAccs(a.data);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id]);

  if (loading) return <Card><p className="text-sm text-slate-400">Loading your IPCR…</p></Card>;

  const status = schedule?.status;

  if (!status) {
    return (
      <Card>
        <h1 className="text-xl font-bold text-slate-900">My IPCR</h1>
        <p className="mt-2 text-sm text-slate-500">
          Your IPCR isn't open yet. When PM opens the Target-Setting phase and notifies you, the form will appear here.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <StatusBanner status={status} />

      {status === 'Phase1 Open' && <Phase1Form account={account} onSubmitted={refresh} />}
      {status === 'Phase1 Submitted' && <Phase1ReadOnly targets={targets} showOriginal />}
      {(status === 'Phase1 Verified' || status === 'Phase1 Locked') && <Phase1Revised targets={targets} />}
      {status === 'Phase2 Open' && <Phase2Form account={account} targets={targets} onSubmitted={refresh} />}
      {status === 'Phase2 Submitted' && <Phase2ReadOnly targets={targets} accs={accs} />}
      {(status === 'Phase2 Verified' || status === 'Cycle Completed') && <Phase2Final targets={targets} accs={accs} />}
    </div>
  );
}

// ── Banners & shell ─────────────────────────────────────────────────────────
function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>;
}

function StatusBanner({ status }: { status: keyof typeof STATUS_BANNER }) {
  const done = status === 'Cycle Completed';
  const submitted = status.includes('Submitted');
  const tone = done
    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
    : submitted
    ? 'bg-amber-50 text-amber-800 border-amber-200'
    : 'bg-indigo-50 text-indigo-800 border-indigo-200';
  return (
    <div className={`rounded-2xl border px-5 py-3 text-sm font-semibold ${tone}`}>
      {done ? '🏁 ' : submitted ? '✅ ' : ''}
      {STATUS_BANNER[status]}
    </div>
  );
}

// ── Phase 1 — Target Setting form ───────────────────────────────────────────
interface FormRow {
  key: string;
  mfo: string;
  indicator: string;
  category: TargetCategory;
  itemWeight: string;
}

let rowSeq = 0;
const newRow = (category: TargetCategory): FormRow => ({
  key: `r${++rowSeq}`,
  mfo: '',
  indicator: '',
  category,
  itemWeight: '',
});

function Phase1Form({ account, onSubmitted }: { account: DemoAccount; onSubmitted: () => void }) {
  const [rows, setRows] = useState<FormRow[]>([newRow('Core Function')]);
  const [catWeights, setCatWeights] = useState<Record<string, string>>({ 'Core Function': '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoriesInUse = useMemo(() => {
    const seen: TargetCategory[] = [];
    for (const r of rows) if (!seen.includes(r.category)) seen.push(r.category);
    return seen;
  }, [rows]);

  const setRow = (key: string, patch: Partial<FormRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addRow = () => setRows((rs) => [...rs, newRow(categoriesInUse[categoriesInUse.length - 1] ?? 'Core Function')]);
  const deleteRow = (key: string) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));

  // ── Validation ──
  const itemSumByCat = (cat: string) =>
    rows.filter((r) => r.category === cat).reduce((s, r) => s + (Number(r.itemWeight) || 0), 0);
  const catWeightSum = categoriesInUse.reduce((s, c) => s + (Number(catWeights[c]) || 0), 0);

  const itemErrors = categoriesInUse.filter((c) => Math.round(itemSumByCat(c)) !== 100);
  const catError = Math.round(catWeightSum) !== 100;
  const incomplete = rows.some((r) => !r.mfo.trim() || !r.indicator.trim() || !r.itemWeight.trim());
  const canSubmit = !itemErrors.length && !catError && !incomplete;

  const submit = async () => {
    setError(null);
    if (!canSubmit) return;
    setBusy(true);
    const payload: TargetInput[] = rows.map((r) => ({
      mfo_pap: r.mfo.trim(),
      success_indicator: r.indicator.trim(),
      category: r.category,
      item_weight_pct: Number(r.itemWeight),
      category_weight_pct: Number(catWeights[r.category]) || 0,
    }));
    const res = await submitTargets(account.id, payload);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Submit failed.');
      return;
    }
    onSubmitted();
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">My Targets — Phase 1</h1>
          <p className="text-sm text-slate-500">Add your MFO/PAP items per category, then submit for Office review.</p>
        </div>
        <button onClick={addRow} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          + Add Row
        </button>
      </div>

      {/* Category weights */}
      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Category Weights (must total 100%)</div>
        <div className="flex flex-wrap gap-4">
          {categoriesInUse.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm">
              <span className="text-slate-700">{c}</span>
              <input
                type="number"
                className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                value={catWeights[c] ?? ''}
                onChange={(e) => setCatWeights((w) => ({ ...w, [c]: e.target.value }))}
              />
              <span className="text-slate-400">%</span>
            </label>
          ))}
          <span className={`ml-auto self-center text-sm font-semibold ${catError ? 'text-red-600' : 'text-emerald-600'}`}>
            Total: {catWeightSum}% {catError ? '— must equal 100%' : '✅'}
          </span>
        </div>
      </div>

      {/* Item rows grouped by category */}
      <div className="mt-4 space-y-3">
        {rows.map((r) => (
          <div key={r.key} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-12">
            <div className="md:col-span-4">
              <Label>MFO / PAP</Label>
              <textarea className={inputCls} rows={2} value={r.mfo} onChange={(e) => setRow(r.key, { mfo: e.target.value })} placeholder="Task or duty description" />
            </div>
            <div className="md:col-span-4">
              <Label>Success Indicator</Label>
              <textarea className={inputCls} rows={2} value={r.indicator} onChange={(e) => setRow(r.key, { indicator: e.target.value })} placeholder="The target you are committing to" />
            </div>
            <div className="md:col-span-2">
              <Label>Category</Label>
              <select className={inputCls} value={r.category} onChange={(e) => setRow(r.key, { category: e.target.value as TargetCategory })}>
                {TARGET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <Label>Item Weight (%)</Label>
              <input type="number" className={inputCls} value={r.itemWeight} onChange={(e) => setRow(r.key, { itemWeight: e.target.value })} />
              <button onClick={() => deleteRow(r.key)} className="mt-2 text-xs font-medium text-red-500 hover:text-red-600">
                Delete row
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Per-category item totals */}
      <div className="mt-3 space-y-1">
        {categoriesInUse.map((c) => {
          const sum = itemSumByCat(c);
          const bad = Math.round(sum) !== 100;
          return (
            <div key={c} className={`text-sm font-medium ${bad ? 'text-red-600' : 'text-emerald-600'}`}>
              {c} item weights: {sum}% {bad ? '— must total 100% to submit' : '✅'}
            </div>
          );
        })}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy || !canSubmit}
          className="h-11 rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? 'Submitting…' : 'Submit IPCR Targets'}
        </button>
        {!canSubmit && <span className="text-sm text-red-600">Fix the weight totals and fill every field before submitting.</span>}
      </div>
    </Card>
  );
}

// ── Phase 1 — read-only views ───────────────────────────────────────────────
function Phase1ReadOnly({ targets, showOriginal }: { targets: TargetRow[]; showOriginal?: boolean }) {
  return (
    <Card>
      <h1 className="text-xl font-bold text-slate-900">My Targets — Submitted</h1>
      <div className="mt-4 space-y-3">
        {targets.map((t) => (
          <div key={t.id} className="rounded-xl border border-slate-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.category} · Item {t.item_weight_pct}% · Category {t.category_weight_pct}%</div>
            <p className="mt-1 text-sm font-medium text-slate-800">{showOriginal ? t.mfo_pap : officialMfo(t)}</p>
            <p className="mt-1 text-sm text-slate-600">{showOriginal ? t.success_indicator : officialIndicator(t)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Phase1Revised({ targets }: { targets: TargetRow[] }) {
  return (
    <Card>
      <h1 className="text-xl font-bold text-slate-900">My Targets — Office-Reviewed</h1>
      <p className="text-sm text-slate-500">Fields the Office Account revised are marked below.</p>
      <div className="mt-4 space-y-3">
        {targets.map((t) => (
          <div key={t.id} className="rounded-xl border border-slate-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.category} · Item {t.item_weight_pct}% · Category {t.category_weight_pct}%</div>
            <div className="mt-2">
              <FieldLabel>MFO / PAP</FieldLabel>
              <RevisedField original={t.original_mfo_pap ?? t.mfo_pap} revised={t.revised_mfo_pap} isRevised={t.is_revised && !!t.revised_mfo_pap} />
            </div>
            <div className="mt-2">
              <FieldLabel>Success Indicator</FieldLabel>
              <RevisedField original={t.original_success_indicator ?? t.success_indicator} revised={t.revised_success_indicator} isRevised={t.is_revised && !!t.revised_success_indicator} />
            </div>
            {t.is_revised && t.revision_remarks && (
              <p className="mt-2 text-xs text-slate-500"><span className="font-semibold">Office remarks:</span> {t.revision_remarks}</p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Phase 2 — Accomplishment form ───────────────────────────────────────────
interface AccForm {
  actual: string;
  q: string;
  e: string;
  t: string;
}

function Phase2Form({ account, targets, onSubmitted }: { account: DemoAccount; targets: TargetRow[]; onSubmitted: () => void }) {
  const [forms, setForms] = useState<Record<string, AccForm>>(() =>
    Object.fromEntries(targets.map((t) => [t.id, { actual: '', q: '', e: '', t: '' }])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setForm = (id: string, patch: Partial<AccForm>) => setForms((f) => ({ ...f, [id]: { ...f[id], ...patch } }));

  const complete = targets.every((t) => {
    const f = forms[t.id];
    return f && f.actual.trim() && f.q && f.e && f.t;
  });

  const submit = async () => {
    setError(null);
    if (!complete) return;
    setBusy(true);
    const payload: AccomplishmentInput[] = targets.map((t) => ({
      target_id: t.id,
      actual_accomplishment: forms[t.id].actual.trim(),
      q_rating: Number(forms[t.id].q),
      e_rating: Number(forms[t.id].e),
      t_rating: Number(forms[t.id].t),
    }));
    const res = await submitAccomplishments(account.id, payload);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Submit failed.');
      return;
    }
    onSubmitted();
  };

  return (
    <Card>
      <h1 className="text-xl font-bold text-slate-900">My Accomplishments — Phase 2</h1>
      <p className="text-sm text-slate-500">Your locked targets are on the left. Record what you actually did and rate Q / E / T.</p>

      <div className="mt-4 space-y-3">
        {targets.map((t) => (
          <div key={t.id} className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">🔒 Locked Target · {t.category}</div>
              <p className="mt-1 text-sm font-medium text-slate-800">{officialMfo(t)}</p>
              <p className="mt-1 text-sm text-slate-600">{officialIndicator(t)}</p>
            </div>
            <div>
              <Label>Actual Accomplishment</Label>
              <textarea className={inputCls} rows={3} value={forms[t.id]?.actual ?? ''} onChange={(e) => setForm(t.id, { actual: e.target.value })} placeholder="What you actually did against the target" />
              <div className="mt-2 flex gap-3">
                <Rating label="Q" value={forms[t.id]?.q ?? ''} onChange={(v) => setForm(t.id, { q: v })} />
                <Rating label="E" value={forms[t.id]?.e ?? ''} onChange={(v) => setForm(t.id, { e: v })} />
                <Rating label="T" value={forms[t.id]?.t ?? ''} onChange={(v) => setForm(t.id, { t: v })} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex items-center gap-3">
        <button onClick={submit} disabled={busy || !complete} className="h-11 rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          {busy ? 'Submitting…' : 'Submit Accomplishments'}
        </button>
        {!complete && <span className="text-sm text-red-600">Fill every accomplishment and all Q/E/T ratings before submitting.</span>}
      </div>
    </Card>
  );
}

function Phase2ReadOnly({ targets, accs }: { targets: TargetRow[]; accs: AccomplishmentRow[] }) {
  const byTarget = new Map(accs.map((a) => [a.target_id, a]));
  return (
    <Card>
      <h1 className="text-xl font-bold text-slate-900">My Accomplishments — Submitted</h1>
      <div className="mt-4 space-y-3">
        {targets.map((t) => {
          const a = byTarget.get(t.id);
          return (
            <div key={t.id} className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">🔒 {t.category}</div>
                <p className="mt-1 text-sm font-medium text-slate-800">{officialMfo(t)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-700">{a?.actual_accomplishment}</p>
                <p className="mt-1 text-xs text-slate-500">Q {a?.q_rating} · E {a?.e_rating} · T {a?.t_rating}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Phase2Final({ targets, accs }: { targets: TargetRow[]; accs: AccomplishmentRow[] }) {
  const byTarget = new Map(accs.map((a) => [a.target_id, a]));
  return (
    <Card>
      <h1 className="text-xl font-bold text-slate-900">My Accomplishments — Office-Reviewed</h1>
      <div className="mt-4 space-y-3">
        {targets.map((t) => {
          const a = byTarget.get(t.id);
          return (
            <div key={t.id} className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">🔒 {t.category}</div>
                <p className="mt-1 text-sm font-medium text-slate-800">{officialMfo(t)}</p>
              </div>
              <div>
                {a && <RevisedField original={a.original_accomplishment ?? a.actual_accomplishment} revised={a.revised_accomplishment} isRevised={a.is_revised && !!a.revised_accomplishment} />}
                <p className="mt-1 text-xs text-slate-500">Q {a?.q_rating} · E {a?.e_rating} · T {a?.t_rating}</p>
                {a?.is_revised && a?.revision_remarks && (
                  <p className="mt-1 text-xs text-slate-500"><span className="font-semibold">Office remarks:</span> {a.revision_remarks}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Small shared bits ───────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-xs font-medium text-slate-600">{children}</span>;
}
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{children}</span>;
}

function Rating({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1 text-sm">
      <span className="font-semibold text-slate-600">{label}</span>
      <select className="rounded-lg border border-slate-300 px-2 py-1 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">–</option>
        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );
}

/** The "Revised by Office Account" marker: strikethrough original + orange revised. */
export function RevisedField({ original, revised, isRevised }: { original: string | null; revised: string | null; isRevised: boolean }) {
  if (!isRevised) return <p className="text-sm text-slate-800">{original}</p>;
  return (
    <div>
      <p className="text-sm text-slate-400 line-through">{original}</p>
      <p className="mt-0.5 text-sm font-medium text-orange-600">
        <span className="mr-1 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-orange-700">⚠ Revised by Office Account</span>
        {revised}
      </p>
    </div>
  );
}
