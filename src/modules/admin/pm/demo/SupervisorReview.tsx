/**
 * IPCR Demo — Office Account review (Stages 4 & 7).
 *
 * Supervisor / Dept Head land here. A pending list surfaces every employee whose
 * submission is awaiting review (Phase 1 targets or Phase 2 accomplishments).
 * Opening one shows the side-by-side editor: the employee's original input on the
 * left (read-only) and an editable copy on the right. Any field changed from the
 * original auto-flags "Revised by Office Account". A ≥10-char Remarks note is
 * mandatory before Verify & Forward to PM.
 */

import { useEffect, useMemo, useState } from 'react';
import { listAccounts } from './api';
import {
  listSchedules,
  listTargets,
  listAccomplishments,
  verifyTargets,
  verifyAccomplishments,
  officialMfo,
  officialIndicator,
  type TargetRevision,
  type AccomplishmentRevision,
} from './workflow';
import type { DemoAccount, Schedule, TargetRow, AccomplishmentRow } from './types';

const inputCls = 'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none';

type Pending = { schedule: Schedule; account: DemoAccount; phase: 1 | 2 };

export function SupervisorReview({ account, readOnly = false }: { account: DemoAccount; readOnly?: boolean }) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [active, setActive] = useState<Pending | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const [s, a] = await Promise.all([listSchedules(), listAccounts()]);
    if (s.ok) setSchedules(s.data);
    if (a.ok) setAccounts(a.data);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const pending: Pending[] = schedules
    .filter((s) => s.status === 'Phase1 Submitted' || s.status === 'Phase2 Submitted')
    .map((s) => ({ schedule: s, account: byId.get(s.employee_id)!, phase: (s.status === 'Phase2 Submitted' ? 2 : 1) as 1 | 2 }))
    .filter((p) => p.account);

  if (active) {
    return (
      <ReviewEditor
        pending={active}
        reviewer={account}
        onBack={() => setActive(null)}
        onDone={() => {
          setActive(null);
          refresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{readOnly ? 'IPCR Oversight' : 'IPCR Review'}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {readOnly ? 'Read-only view of every employee IPCR in the cycle.' : 'Employees awaiting your review. Open one to edit and forward to PM.'}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4 text-sm font-semibold text-slate-800">Pending Review</div>
        {loading ? (
          <p className="px-6 py-8 text-center text-sm text-slate-400">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-slate-400">Nothing awaiting review right now.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-6 py-3">Employee</th>
                <th className="px-6 py-3">Office</th>
                <th className="px-6 py-3">Phase</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p.schedule.id} className="border-t border-slate-100">
                  <td className="px-6 py-3 font-medium text-slate-800">{p.account.full_name}</td>
                  <td className="px-6 py-3 text-slate-600">{p.account.office ?? '—'}</td>
                  <td className="px-6 py-3 text-slate-600">{p.phase === 1 ? 'Target Setting' : 'Accomplishment'}</td>
                  <td className="px-6 py-3 text-right">
                    <button onClick={() => setActive(p)} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── The side-by-side editor ─────────────────────────────────────────────────
function ReviewEditor({ pending, reviewer, onBack, onDone }: { pending: Pending; reviewer: DemoAccount; onBack: () => void; onDone: () => void }) {
  const { account, phase } = pending;
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [accs, setAccs] = useState<AccomplishmentRow[]>([]);
  const [edits, setEdits] = useState<Record<string, { mfo?: string; indicator?: string; actual?: string }>>({});
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const t = await listTargets(account.id);
      if (t.ok) setTargets(t.data);
      if (phase === 2) {
        const a = await listAccomplishments(account.id);
        if (a.ok) setAccs(a.data);
      }
    })();
  }, [account.id, phase]);

  const setEdit = (id: string, patch: { mfo?: string; indicator?: string; actual?: string }) =>
    setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));

  const remarksValid = remarks.trim().length >= 10;

  const submit = async () => {
    setError(null);
    if (!remarksValid) return;
    setBusy(true);
    let res;
    if (phase === 1) {
      const revisions: TargetRevision[] = targets.map((t) => ({
        id: t.id,
        revised_mfo_pap: edits[t.id]?.mfo ?? t.original_mfo_pap ?? t.mfo_pap ?? '',
        revised_success_indicator: edits[t.id]?.indicator ?? t.original_success_indicator ?? t.success_indicator ?? '',
      }));
      res = await verifyTargets(account.id, revisions, remarks.trim(), reviewer.id);
    } else {
      const revisions: AccomplishmentRevision[] = accs.map((a) => ({
        id: a.id,
        revised_accomplishment: edits[a.id]?.actual ?? a.original_accomplishment ?? a.actual_accomplishment ?? '',
      }));
      res = await verifyAccomplishments(account.id, revisions, remarks.trim(), reviewer.id);
    }
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Verify failed.');
      return;
    }
    onDone();
  };

  const accByTarget = new Map(accs.map((a) => [a.target_id, a]));

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">← Back to pending</button>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Review — {account.full_name}</h1>
        <p className="text-sm text-slate-500">{phase === 1 ? 'Phase 1 · Target Setting' : 'Phase 2 · Accomplishment Rating'} · {account.office}</p>
      </div>

      <div className="space-y-4">
        {targets.map((t) => {
          const acc = phase === 2 ? accByTarget.get(t.id) : undefined;
          return (
            <div key={t.id} className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
              {/* Left — original (read only) */}
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Employee's Submission</div>
                {phase === 1 ? (
                  <>
                    <FieldBlock label="MFO / PAP" value={t.original_mfo_pap ?? t.mfo_pap} />
                    <FieldBlock label="Success Indicator" value={t.original_success_indicator ?? t.success_indicator} />
                  </>
                ) : (
                  <>
                    <FieldBlock label="Locked Target" value={officialMfo(t)} />
                    <FieldBlock label="Actual Accomplishment" value={acc?.original_accomplishment ?? acc?.actual_accomplishment ?? ''} />
                    <p className="mt-1 text-xs text-slate-500">Q {acc?.q_rating} · E {acc?.e_rating} · T {acc?.t_rating}</p>
                  </>
                )}
              </div>

              {/* Right — editable */}
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Office Account (editable)</div>
                {phase === 1 ? (
                  <>
                    <EditBlock
                      label="MFO / PAP"
                      original={t.original_mfo_pap ?? t.mfo_pap ?? ''}
                      value={edits[t.id]?.mfo ?? t.original_mfo_pap ?? t.mfo_pap ?? ''}
                      onChange={(v) => setEdit(t.id, { mfo: v })}
                      disabled={busy}
                    />
                    <EditBlock
                      label="Success Indicator"
                      original={t.original_success_indicator ?? t.success_indicator ?? ''}
                      value={edits[t.id]?.indicator ?? t.original_success_indicator ?? t.success_indicator ?? ''}
                      onChange={(v) => setEdit(t.id, { indicator: v })}
                      disabled={busy}
                    />
                  </>
                ) : (
                  acc && (
                    <EditBlock
                      label="Actual Accomplishment"
                      original={acc.original_accomplishment ?? acc.actual_accomplishment ?? ''}
                      value={edits[acc.id]?.actual ?? acc.original_accomplishment ?? acc.actual_accomplishment ?? ''}
                      onChange={(v) => setEdit(acc.id, { actual: v })}
                      disabled={busy}
                    />
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Remarks + forward */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Remarks <span className="text-red-500">*</span> <span className="text-xs font-normal text-slate-400">(minimum 10 characters)</span></span>
          <textarea className={inputCls} rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Why the revisions were made…" />
        </label>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex items-center gap-3">
          <button onClick={submit} disabled={busy || !remarksValid} className="h-11 rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
            {busy ? 'Forwarding…' : 'Verify & Forward to PM'}
          </button>
          {!remarksValid && <span className="text-sm text-red-600">Remarks must be at least 10 characters.</span>}
        </div>
      </div>
    </div>
  );
}

function FieldBlock({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="mb-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <p className="text-sm text-slate-700">{value}</p>
    </div>
  );
}

function EditBlock({ label, original, value, onChange, disabled }: { label: string; original: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const changed = value.trim() !== original.trim();
  return (
    <div className="mb-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <textarea
        className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-1 ${changed ? 'border-orange-400 focus:border-orange-500 focus:ring-orange-500' : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-500'}`}
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      {changed && (
        <p className="mt-1 text-xs font-semibold text-orange-600">⚠ Revised by Office Account</p>
      )}
    </div>
  );
}
