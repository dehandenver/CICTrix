/**
 * IPCR Demo — root shell mounted at /pm-demo.
 *
 * Self-contained: its own login (accounts table) and its own session, separate
 * from the app's admin/employee auth. Routes the signed-in account to a
 * role-appropriate view for the full 8-stage IPCR cycle:
 *   PM Admin   → console: Account Management + Target Setting / Incoming / Vault,
 *                with the Demo Time Control banner.
 *   Employee   → their IPCR tab (Phase 1 form → revised view → Phase 2 form).
 *   Supervisor → Office Account review (side-by-side editor).
 *   Dept Head  → read-only oversight of every employee's IPCR.
 * Every signed-in account gets the notification bell.
 */

import { useEffect, useState } from 'react';
import { DemoLogin } from './DemoLogin';
import { AccountManagement } from './AccountManagement';
import { NotificationBell } from './NotificationBell';
import { DemoTimeBanner } from './DemoTimeBanner';
import { EmployeeIPCR } from './EmployeeIPCR';
import { SupervisorReview } from './SupervisorReview';
import { PMTargetSetting, PMIncoming, PMVault } from './PMWorkflow';
import { loadDemoOffset } from './api';
import { loadDemoSession, saveDemoSession, clearDemoSession } from './session';
import { roleLabel } from './types';
import type { DemoAccount } from './types';

type PMTab = 'accounts' | 'target' | 'incoming' | 'vault';

export function DemoRoot() {
  const [account, setAccount] = useState<DemoAccount | null>(() => loadDemoSession());
  const [pmTab, setPmTab] = useState<PMTab>('accounts');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadDemoOffset().then(() => setReady(true));
  }, []);

  const onLogin = (acc: DemoAccount) => {
    saveDemoSession(acc);
    setAccount(acc);
  };

  const signOut = () => {
    clearDemoSession();
    setAccount(null);
  };

  if (!account) {
    return <DemoLogin onLogin={onLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-indigo-600 px-2 py-1 text-xs font-bold text-white">IPCR DEMO</span>
            <span className="text-sm font-semibold text-slate-800">Performance Management</span>
          </div>
          <div className="flex items-center gap-4">
            <NotificationBell accountId={account.id} />
            <div className="text-right">
              <div className="text-sm font-medium text-slate-800">{account.full_name}</div>
              <div className="text-xs text-slate-500">
                {roleLabel(account.role)}{account.office ? ` · ${account.office}` : ''}
              </div>
            </div>
            <button onClick={signOut} className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {!ready ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : account.role === 'PMAdmin' ? (
          <PMConsole account={account} tab={pmTab} setTab={setPmTab} />
        ) : account.role === 'Employee' ? (
          <EmployeeIPCR account={account} />
        ) : (
          /* Supervisor and Dept Head are both Office Accounts (all offices). */
          <SupervisorReview account={account} />
        )}
      </main>
    </div>
  );
}

function PMConsole({ account, tab, setTab }: { account: DemoAccount; tab: PMTab; setTab: (t: PMTab) => void }) {
  // `tick` bumps to force the workflow tabs (and vault eligibility) to re-read
  // after a time jump or a state-advancing action.
  const [tick, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);

  return (
    <div>
      <DemoTimeBanner onChange={bump} />

      <h1 className="text-2xl font-bold text-slate-900">PM Admin Console</h1>
      <p className="mt-1 text-sm text-slate-500">Manage accounts and drive the full IPCR cycle end to end.</p>

      <nav className="mt-6 flex flex-wrap gap-1 border-b border-slate-200">
        <TabButton active={tab === 'accounts'} onClick={() => setTab('accounts')}>Account Management</TabButton>
        <TabButton active={tab === 'target'} onClick={() => setTab('target')}>Target Setting</TabButton>
        <TabButton active={tab === 'incoming'} onClick={() => setTab('incoming')}>Incoming Submissions</TabButton>
        <TabButton active={tab === 'vault'} onClick={() => setTab('vault')}>Cold Storage Vault</TabButton>
      </nav>

      <div className="mt-6">
        {tab === 'accounts' && <AccountManagement pmId={account.id} />}
        {tab === 'target' && <PMTargetSetting pmId={account.id} tick={tick} onChange={bump} />}
        {tab === 'incoming' && <PMIncoming pmId={account.id} tick={tick} onChange={bump} />}
        {tab === 'vault' && <PMVault pmId={account.id} tick={tick} onChange={bump} />}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
        active ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}
