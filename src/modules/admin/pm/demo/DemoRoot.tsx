/**
 * IPCR Demo — root shell mounted at /pm-demo.
 *
 * Self-contained: its own login (accounts table) and its own session, separate
 * from the app's admin/employee auth. Routes the signed-in account to a
 * role-appropriate view. PM Admin gets the management console (Account
 * Management is live; the rest of the 7-stage workflow lands in later slices).
 */

import { useEffect, useState } from 'react';
import { DemoLogin } from './DemoLogin';
import { AccountManagement } from './AccountManagement';
import { loadDemoOffset } from './api';
import { loadDemoSession, saveDemoSession, clearDemoSession } from './session';
import { roleLabel } from './types';
import type { DemoAccount } from './types';

type PMTab = 'accounts';

export function DemoRoot() {
  const [account, setAccount] = useState<DemoAccount | null>(() => loadDemoSession());
  const [pmTab, setPmTab] = useState<PMTab>('accounts');

  useEffect(() => {
    loadDemoOffset();
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
        {account.role === 'PMAdmin' ? (
          <PMConsole account={account} tab={pmTab} setTab={setPmTab} />
        ) : (
          <RolePlaceholder account={account} />
        )}
      </main>
    </div>
  );
}

function PMConsole({
  account,
  tab,
  setTab,
}: {
  account: DemoAccount;
  tab: PMTab;
  setTab: (t: PMTab) => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">PM Admin Console</h1>
      <p className="mt-1 text-sm text-slate-500">Create and manage all demo accounts. The workflow stages unlock in the next build slices.</p>

      <nav className="mt-6 flex gap-1 border-b border-slate-200">
        <TabButton active={tab === 'accounts'} onClick={() => setTab('accounts')}>Account Management</TabButton>
      </nav>

      <div className="mt-6">
        {tab === 'accounts' && <AccountManagement pmId={account.id} />}
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

function RolePlaceholder({ account }: { account: DemoAccount }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-xl font-bold text-slate-900">Welcome, {account.full_name.split(' ')[0]}</h1>
      <p className="mt-2 text-sm text-slate-500">
        You're signed in as <span className="font-medium">{roleLabel(account.role)}</span>
        {account.office ? ` · ${account.office}` : ''}.
      </p>
      <p className="mt-4 text-sm text-slate-500">
        Your IPCR tab will appear here once the PM Admin opens Phase 1 — that stage is being built next.
      </p>
    </div>
  );
}
