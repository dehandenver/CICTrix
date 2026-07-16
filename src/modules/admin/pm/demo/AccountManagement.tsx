/**
 * IPCR Demo — PM Admin Account Management panel (Stage 1).
 *
 * PM Admin creates every login here: no account exists until it's created. The
 * Office field is a dropdown sourced from demo_offices — no free-text entry and
 * no "add department" here, per the department single-source rule. Created
 * accounts appear immediately in the list with Edit / Deactivate actions.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  listAccounts,
  createAccount,
  updateAccount,
  setAccountStatus,
  listOffices,
} from './api';
import { DEMO_ROLES, roleLabel } from './types';
import type { DemoAccount, DemoOffice, DemoRole, NewAccountInput } from './types';

const EMPTY: NewAccountInput = {
  full_name: '',
  employee_code: '',
  email: '',
  password: '',
  role: 'Employee',
  office: '',
  position_title: '',
  date_hired: '',
};

const genCode = () => `EMP-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

export function AccountManagement({ pmId }: { pmId: string }) {
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [offices, setOffices] = useState<DemoOffice[]>([]);
  const [form, setForm] = useState<NewAccountInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<DemoAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const res = await listAccounts();
    if (res.ok) setAccounts(res.data);
    else setError(res.error);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    listOffices().then((r) => {
      if (r.ok) setOffices(r.data);
    });
  }, []);

  const set = <K extends keyof NewAccountInput>(key: K, value: NewAccountInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const officeRequired = form.role !== 'PMAdmin';

  const canSubmit = useMemo(
    () =>
      form.full_name.trim() &&
      form.email.trim() &&
      form.password.trim() &&
      form.role &&
      (!officeRequired || (form.office ?? '').trim()),
    [form, officeRequired],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    const payload: NewAccountInput = {
      ...form,
      office: officeRequired ? form.office : null,
      date_hired: form.date_hired || null,
      employee_code: form.employee_code.trim() || genCode(),
    };
    const res = await createAccount(payload, pmId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNotice(`Account created for ${res.data.full_name}.`);
    setForm(EMPTY);
    refresh();
  };

  return (
    <div className="space-y-8">
      {/* ── Create form ─────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Create Account</h2>
        <p className="text-sm text-slate-500">PM Admin fills this in for each person.</p>

        <form onSubmit={submit} className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Full Name" required>
            <input className={inputCls} value={form.full_name} onChange={(e) => set('full_name', e.target.value)} required />
          </Field>

          <Field label="Employee Code">
            <div className="flex gap-2">
              <input className={inputCls} value={form.employee_code} onChange={(e) => set('employee_code', e.target.value)} placeholder="Auto-generated if blank" />
              <button type="button" onClick={() => set('employee_code', genCode())} className="shrink-0 rounded-xl border border-slate-300 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">
                Auto
              </button>
            </div>
          </Field>

          <Field label="Email Address" required>
            <input type="email" className={inputCls} value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="name@lgu.gov" required />
          </Field>

          <Field label="Password" required>
            <input className={inputCls} value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Set by PM Admin" required />
          </Field>

          <Field label="Role" required>
            <select className={inputCls} value={form.role} onChange={(e) => set('role', e.target.value as DemoRole)}>
              {DEMO_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Office / Department" required={officeRequired}>
            <select
              className={inputCls}
              value={form.office ?? ''}
              onChange={(e) => set('office', e.target.value)}
              disabled={!officeRequired}
            >
              <option value="">{officeRequired ? 'Select office…' : '— (not applicable)'}</option>
              {offices.map((o) => (
                <option key={o.id} value={o.name}>{o.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Position Title">
            <input className={inputCls} value={form.position_title} onChange={(e) => set('position_title', e.target.value)} />
          </Field>

          <Field label="Date Hired">
            <input type="date" className={inputCls} value={form.date_hired ?? ''} onChange={(e) => set('date_hired', e.target.value)} />
          </Field>

          <div className="md:col-span-2 flex items-center gap-3 pt-2">
            <button type="submit" disabled={busy || !canSubmit} className="h-11 rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {busy ? 'Creating…' : 'Create Account'}
            </button>
            {error && <span className="text-sm text-red-600">{error}</span>}
            {notice && <span className="text-sm text-emerald-600">{notice}</span>}
          </div>
        </form>
      </section>

      {/* ── Account list ────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Accounts</h2>
          <span className="text-sm text-slate-400">{accounts.length} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 bg-slate-50">
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Office</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Created</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-400">Loading…</td></tr>
              ) : accounts.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-400">No accounts yet. Create the first one above.</td></tr>
              ) : (
                accounts.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="px-6 py-3 font-medium text-slate-800">{a.full_name}</td>
                    <td className="px-6 py-3 text-slate-600">{a.email}</td>
                    <td className="px-6 py-3 text-slate-600">{roleLabel(a.role)}</td>
                    <td className="px-6 py-3 text-slate-600">{a.office ?? '—'}</td>
                    <td className="px-6 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${a.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-500">{a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td>
                    <td className="px-6 py-3">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditing(a)} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            await setAccountStatus(a.id, a.status === 'Active' ? 'Inactive' : 'Active');
                            refresh();
                          }}
                          className={`rounded-lg px-3 py-1 text-xs font-medium ${a.status === 'Active' ? 'border border-red-200 text-red-600 hover:bg-red-50' : 'border border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}
                        >
                          {a.status === 'Active' ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <EditModal
          account={editing}
          offices={offices}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

const inputCls =
  'w-full h-11 rounded-xl border border-slate-300 px-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

function EditModal({
  account,
  offices,
  onClose,
  onSaved,
}: {
  account: DemoAccount;
  offices: DemoOffice[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [full_name, setFullName] = useState(account.full_name);
  const [employee_code, setCode] = useState(account.employee_code ?? '');
  const [role, setRole] = useState<DemoRole>(account.role);
  const [office, setOffice] = useState(account.office ?? '');
  const [position_title, setPosition] = useState(account.position_title ?? '');
  const [date_hired, setDateHired] = useState(account.date_hired ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const officeRequired = role !== 'PMAdmin';

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await updateAccount(account.id, {
      full_name,
      employee_code: employee_code || null,
      role,
      office: officeRequired ? office : null,
      position_title,
      date_hired: date_hired || null,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-slate-900">Edit Account</h3>
        <p className="text-sm text-slate-500">{account.email}</p>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full Name"><input className={inputCls} value={full_name} onChange={(e) => setFullName(e.target.value)} /></Field>
          <Field label="Employee Code"><input className={inputCls} value={employee_code} onChange={(e) => setCode(e.target.value)} /></Field>
          <Field label="Role">
            <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as DemoRole)}>
              {DEMO_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>
          <Field label="Office / Department">
            <select className={inputCls} value={office} onChange={(e) => setOffice(e.target.value)} disabled={!officeRequired}>
              <option value="">{officeRequired ? 'Select office…' : '— (not applicable)'}</option>
              {offices.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="Position Title"><input className={inputCls} value={position_title} onChange={(e) => setPosition(e.target.value)} /></Field>
          <Field label="Date Hired"><input type="date" className={inputCls} value={date_hired} onChange={(e) => setDateHired(e.target.value)} /></Field>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="h-10 rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={busy} className="h-10 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
            {busy ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
