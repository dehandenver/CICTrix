/**
 * IPCR Demo — PM Admin workflow (Stages 2, 5, 6, 8).
 *
 * Three sub-tabs the PM drives the cycle from:
 *   Target Setting      → open Phase 1, notify employees, watch statuses roll in
 *   Incoming Submissions→ review Office-verified IPCRs; Accept & Lock (P1) /
 *                          Close Cycle (P2)
 *   Cold Storage Vault  → locked targets + Phase-2-eligible dates; open Phase 2
 *                          and notify once the +6mo jump crosses eligibility
 *
 * getSimulatedDate() (via the Time Banner) drives every eligibility check.
 */

import { useEffect, useMemo, useState } from 'react';
import { listAccounts } from './api';
import {
  getCycleState,
  openPhase1,
  openPhase2,
  listEmployees,
  listSchedules,
  sendPhase1Notification,
  sendPhase2Notification,
  listTargets,
  listAccomplishments,
  acceptAndLock,
  closeCycle,
  listVault,
  isPhase2Eligible,
  officialMfo,
  officialIndicator,
} from './workflow';
import { RevisedField } from './EmployeeIPCR';
import type { DemoAccount, Schedule, CycleState, VaultRow, TargetRow, AccomplishmentRow, ScheduleStatus } from './types';

export type PMWorkflowTab = 'target' | 'incoming' | 'vault';

const statusPill = (s: ScheduleStatus | undefined) => {
  const map: Record<string, string> = {
    'Phase1 Open': 'bg-indigo-50 text-indigo-700',
    'Phase1 Submitted': 'bg-amber-50 text-amber-700',
    'Phase1 Verified': 'bg-sky-50 text-sky-700',
    'Phase1 Locked': 'bg-emerald-50 text-emerald-700',
    'Phase2 Open': 'bg-indigo-50 text-indigo-700',
    'Phase2 Submitted': 'bg-amber-50 text-amber-700',
    'Phase2 Verified': 'bg-sky-50 text-sky-700',
    'Cycle Completed': 'bg-emerald-100 text-emerald-800',
  };
  return map[s ?? ''] ?? 'bg-slate-100 text-slate-500';
};

// ── Shared data hook ────────────────────────────────────────────────────────
function useWorkflowData(tick: number) {
  const [employees, setEmployees] = useState<DemoAccount[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [state, setState] = useState<CycleState | null>(null);
  const [vault, setVault] = useState<VaultRow[]>([]);

  const refresh = async () => {
    const [e, s, c, v] = await Promise.all([listEmployees(), listSchedules(), getCycleState(), listVault()]);
    if (e.ok) setEmployees(e.data);
    if (s.ok) setSchedules(s.data);
    if (c.ok) setState(c.data);
    if (v.ok) setVault(v.data);
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const schedById = useMemo(() => new Map(schedules.map((s) => [s.employee_id, s])), [schedules]);
  return { employees, schedules, schedById, state, vault, refresh };
}

// ── Tab 1: Target Setting ───────────────────────────────────────────────────
export function PMTargetSetting({ pmId, tick, onChange }: { pmId: string; tick: number; onChange: () => void }) {
  const { employees, schedById, state } = useWorkflowData(tick);
  const [picking, setPicking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const open = state?.phase1_status === 'Open';

  const doOpen = async () => {
    await openPhase1();
    setNotice('Target Setting phase is now OPEN.');
    onChange();
  };

  const send = async (ids: string[]) => {
    const res = await sendPhase1Notification(ids, pmId);
    setPicking(false);
    if (res.ok) setNotice(`Notified ${res.data} employee(s).`);
    onChange();
  };

  return (
    <div className="space-y-6">
      <PhaseCard
        title="Phase 1 — Target Setting"
        open={open}
        onOpen={doOpen}
        onNotify={() => setPicking(true)}
        notifyLabel="Send Notification"
        notice={notice}
      />

      <StatusTable employees={employees} schedById={schedById} />

      {picking && (
        <EmployeePicker
          title="Send Target-Setting notification"
          employees={employees}
          onCancel={() => setPicking(false)}
          onConfirm={send}
        />
      )}
    </div>
  );
}

// ── Tab 2: Incoming Submissions ─────────────────────────────────────────────
export function PMIncoming({ pmId, tick, onChange }: { pmId: string; tick: number; onChange: () => void }) {
  const { employees, schedById, refresh } = useWorkflowData(tick);
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [reviewing, setReviewing] = useState<{ account: DemoAccount; phase: 1 | 2 } | null>(null);

  useEffect(() => {
    listAccounts().then((r) => r.ok && setAccounts(r.data));
  }, [tick]);

  const incoming = employees
    .map((e) => ({ account: e, sched: schedById.get(e.id) }))
    .filter((x) => x.sched?.status === 'Phase1 Verified' || x.sched?.status === 'Phase2 Verified')
    .map((x) => ({ account: x.account, phase: (x.sched!.status === 'Phase2 Verified' ? 2 : 1) as 1 | 2 }));

  if (reviewing) {
    return (
      <PMReview
        account={reviewing.account}
        phase={reviewing.phase}
        pmId={pmId}
        accounts={accounts}
        onBack={() => setReviewing(null)}
        onDone={() => {
          setReviewing(null);
          refresh();
          onChange();
        }}
      />
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4 text-sm font-semibold text-slate-800">Incoming Submissions</div>
      {incoming.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-slate-400">Nothing awaiting PM review. Office-verified IPCRs land here.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-6 py-3">Employee</th>
              <th className="px-6 py-3">Office</th>
              <th className="px-6 py-3">Phase</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {incoming.map(({ account, phase }) => (
              <tr key={account.id} className="border-t border-slate-100">
                <td className="px-6 py-3 font-medium text-slate-800">{account.full_name}</td>
                <td className="px-6 py-3 text-slate-600">{account.office ?? '—'}</td>
                <td className="px-6 py-3 text-slate-600">{phase === 1 ? 'Target Setting' : 'Accomplishment'}</td>
                <td className="px-6 py-3 text-slate-600">Awaiting PM Review</td>
                <td className="px-6 py-3 text-right">
                  <button onClick={() => setReviewing({ account, phase })} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
                    Review
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Tab 3: Cold Storage Vault ───────────────────────────────────────────────
export function PMVault({ pmId, tick, onChange }: { pmId: string; tick: number; onChange: () => void }) {
  const { employees, schedById, state, vault } = useWorkflowData(tick);
  const [picking, setPicking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const acctById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const open = state?.phase2_status === 'Open';

  const doOpen = async () => {
    await openPhase2();
    setNotice('Accomplishment Rating phase is now OPEN.');
    onChange();
  };

  const send = async (ids: string[]) => {
    const res = await sendPhase2Notification(ids, pmId);
    setPicking(false);
    if (res.ok) setNotice(`Notified ${res.data} employee(s) for Phase 2.`);
    onChange();
  };

  // Only locked employees can enter Phase 2.
  const lockedEmployees = employees.filter((e) => {
    const s = schedById.get(e.id)?.status;
    return s === 'Phase1 Locked' || s === 'Phase2 Open' || s?.startsWith('Phase2') || s === 'Cycle Completed';
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4 text-sm font-semibold text-slate-800">Cold Storage Vault 🔒</div>
        {vault.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-slate-400">Empty. Accept & Lock a verified IPCR to store it here.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-6 py-3">Employee</th>
                <th className="px-6 py-3">Locked At</th>
                <th className="px-6 py-3">Phase 2 Eligible</th>
                <th className="px-6 py-3">Eligibility</th>
              </tr>
            </thead>
            <tbody>
              {vault.map((v) => {
                const eligible = isPhase2Eligible(v);
                return (
                  <tr key={v.id} className="border-t border-slate-100">
                    <td className="px-6 py-3 font-medium text-slate-800">{acctById.get(v.employee_id)?.full_name ?? '—'}</td>
                    <td className="px-6 py-3 text-slate-600">{new Date(v.locked_at).toLocaleDateString()}</td>
                    <td className="px-6 py-3 text-slate-600">{v.phase2_eligible_date ? new Date(v.phase2_eligible_date + 'T00:00:00').toLocaleDateString() : '—'}</td>
                    <td className="px-6 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${eligible ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {eligible ? 'Phase 2 Eligible ✅' : 'Not yet eligible'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <PhaseCard
        title="Phase 2 — Accomplishment Rating"
        open={open}
        onOpen={doOpen}
        onNotify={() => setPicking(true)}
        notifyLabel="Send Notification"
        notice={notice}
        disabled={vault.length === 0}
        disabledHint="Lock at least one IPCR into the vault first."
      />

      {picking && (
        <EmployeePicker
          title="Open Accomplishment Rating for…"
          employees={lockedEmployees}
          onCancel={() => setPicking(false)}
          onConfirm={send}
        />
      )}
    </div>
  );
}

// ── PM review screen (read-only IPCR + Accept & Lock / Close Cycle) ──────────
function PMReview({
  account,
  phase,
  pmId,
  accounts,
  onBack,
  onDone,
}: {
  account: DemoAccount;
  phase: 1 | 2;
  pmId: string;
  accounts: DemoAccount[];
  onBack: () => void;
  onDone: () => void;
}) {
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [accs, setAccs] = useState<AccomplishmentRow[]>([]);
  const [busy, setBusy] = useState(false);
  const nameById = useMemo(() => new Map(accounts.map((a) => [a.id, a.full_name])), [accounts]);

  useEffect(() => {
    listTargets(account.id).then((r) => r.ok && setTargets(r.data));
    if (phase === 2) listAccomplishments(account.id).then((r) => r.ok && setAccs(r.data));
  }, [account.id, phase]);

  const accByTarget = new Map(accs.map((a) => [a.target_id, a]));

  const act = async () => {
    setBusy(true);
    const res = phase === 1 ? await acceptAndLock(account.id, pmId) : await closeCycle(account.id, pmId);
    setBusy(false);
    if (res.ok) onDone();
  };

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">← Back to incoming</button>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Review — {account.full_name}</h1>
        <p className="text-sm text-slate-500">{phase === 1 ? 'Phase 1 · Verified targets' : 'Phase 2 · Verified accomplishments'} · {account.office}</p>
      </div>

      <div className="space-y-3">
        {targets.map((t) => {
          const a = accByTarget.get(t.id);
          return (
            <div key={t.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.category} · Item {t.item_weight_pct}% · Category {t.category_weight_pct}%</div>
              <div className="mt-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">MFO / PAP</div>
                <RevisedField original={t.original_mfo_pap ?? t.mfo_pap} revised={t.revised_mfo_pap} isRevised={t.is_revised && !!t.revised_mfo_pap} />
              </div>
              <div className="mt-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Success Indicator</div>
                <RevisedField original={t.original_success_indicator ?? t.success_indicator} revised={t.revised_success_indicator} isRevised={t.is_revised && !!t.revised_success_indicator} />
              </div>
              {phase === 2 && a && (
                <div className="mt-3 rounded-xl bg-slate-50 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Accomplishment</div>
                  <RevisedField original={a.original_accomplishment ?? a.actual_accomplishment} revised={a.revised_accomplishment} isRevised={a.is_revised && !!a.revised_accomplishment} />
                  <p className="mt-1 text-xs text-slate-500">Q {a.q_rating} · E {a.e_rating} · T {a.t_rating}</p>
                </div>
              )}
              {t.is_revised && t.revised_by && (
                <p className="mt-2 text-xs text-slate-500">Revised by {nameById.get(t.revised_by) ?? 'Office Account'} · {t.revision_remarks}</p>
              )}
            </div>
          );
        })}
        {phase === 1 && <p className="text-sm text-slate-500">Left column shows the official (Office-verified) version, with revision markers preserved.</p>}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={act} disabled={busy} className="h-11 rounded-xl bg-emerald-600 px-6 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          {busy ? 'Working…' : phase === 1 ? 'Accept & Store in Vault 🔒' : 'Close Cycle 🏁'}
        </button>
      </div>
    </div>
  );
}

// ── Reusable bits ───────────────────────────────────────────────────────────
function PhaseCard({
  title,
  open,
  onOpen,
  onNotify,
  notifyLabel,
  notice,
  disabled,
  disabledHint,
}: {
  title: string;
  open: boolean;
  onOpen: () => void;
  onNotify: () => void;
  notifyLabel: string;
  notice: string | null;
  disabled?: boolean;
  disabledHint?: string;
}) {
  return (
    <div className={`rounded-2xl border p-6 shadow-sm ${open ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${open ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
            {open ? 'OPEN' : 'CLOSED'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!open ? (
            <button onClick={onOpen} disabled={disabled} className="h-11 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              Open {title.split('—')[1]?.trim() ?? 'Phase'}
            </button>
          ) : (
            <button onClick={onNotify} className="h-11 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700">
              {notifyLabel}
            </button>
          )}
        </div>
      </div>
      {disabled && disabledHint && <p className="mt-2 text-xs text-slate-500">{disabledHint}</p>}
      {notice && <p className="mt-3 text-sm font-medium text-emerald-700">{notice}</p>}
    </div>
  );
}

function StatusTable({ employees, schedById }: { employees: DemoAccount[]; schedById: Map<string, Schedule> }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4 text-sm font-semibold text-slate-800">Employee Cycle Status</div>
      {employees.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-slate-400">No employees yet. Create them in Account Management.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-6 py-3">Employee</th>
              <th className="px-6 py-3">Office</th>
              <th className="px-6 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const s = schedById.get(e.id)?.status;
              return (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-6 py-3 font-medium text-slate-800">{e.full_name}</td>
                  <td className="px-6 py-3 text-slate-600">{e.office ?? '—'}</td>
                  <td className="px-6 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusPill(s)}`}>{s ?? 'Not Started'}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function EmployeePicker({
  title,
  employees,
  onCancel,
  onConfirm,
}: {
  title: string;
  employees: DemoAccount[];
  onCancel: () => void;
  onConfirm: (ids: string[]) => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const allIds = employees.map((e) => e.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => sel.has(id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        {employees.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No eligible employees.</p>
        ) : (
          <>
            <button
              onClick={() => setSel(allSelected ? new Set() : new Set(allIds))}
              className="mt-3 text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              {allSelected ? 'Clear all' : 'Select all'}
            </button>
            <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">
              {employees.map((e) => (
                <label key={e.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={sel.has(e.id)} onChange={() => toggle(e.id)} />
                  <span className="font-medium text-slate-800">{e.full_name}</span>
                  <span className="ml-auto text-xs text-slate-400">{e.office}</span>
                </label>
              ))}
            </div>
          </>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onCancel} className="h-10 rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          <button
            onClick={() => onConfirm([...sel])}
            disabled={sel.size === 0}
            className="h-10 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Send ({sel.size})
          </button>
        </div>
      </div>
    </div>
  );
}
