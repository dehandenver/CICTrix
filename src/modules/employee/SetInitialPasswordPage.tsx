import { Eye, EyeOff, KeyRound, Lock } from 'lucide-react';
import { useState } from 'react';
import { changeEmployeePortalPassword } from '../../lib/employeePortalData';

interface SetInitialPasswordPageProps {
  username: string;
  fullName: string;
  onDone: () => void;
}

export const SetInitialPasswordPage: React.FC<SetInitialPasswordPageProps> = ({
  username,
  fullName,
  onDone,
}) => {
  const [tempPassword, setTempPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showTemp, setShowTemp] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!tempPassword) {
      setError('Enter the temporary password from your onboarding email.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (newPassword === tempPassword) {
      setError('New password must differ from the temporary password.');
      return;
    }

    setSaving(true);
    const result = changeEmployeePortalPassword(username, tempPassword, newPassword);
    setSaving(false);

    if (!result.ok) {
      setError('error' in result ? result.error : 'Could not update password.');
      return;
    }

    onDone();
  };

  return (
    <div
      className="min-h-screen w-full bg-slate-50 text-slate-900 flex items-center justify-center p-4"
      style={{ fontFamily: "'Poppins', system-ui, -apple-system, sans-serif" }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200">
        <div className="rounded-t-2xl bg-gradient-to-br from-blue-700 to-blue-900 px-6 py-5 text-white">
          <div className="flex items-center gap-2 mb-1">
            <KeyRound className="h-5 w-5" />
            <h1 className="text-lg font-semibold">Set Your Password</h1>
          </div>
          <p className="text-xs text-blue-100">
            Welcome, {fullName || username}. Before you can access any module, please replace your temporary password.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <PasswordField
            label="Temporary Password"
            value={tempPassword}
            onChange={setTempPassword}
            show={showTemp}
            onToggle={() => setShowTemp((v) => !v)}
            autoFocus
          />
          <PasswordField
            label="New Password (min 8 characters)"
            value={newPassword}
            onChange={setNewPassword}
            show={showNew}
            onToggle={() => setShowNew((v) => !v)}
          />
          <PasswordField
            label="Confirm New Password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            show={showConfirm}
            onToggle={() => setShowConfirm((v) => !v)}
          />

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Set Password and Continue'}
          </button>
        </form>
      </div>
    </div>
  );
};

type PasswordFieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  autoFocus?: boolean;
};

const PasswordField = ({ label, value, onChange, show, onToggle, autoFocus }: PasswordFieldProps) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
      {label}
    </label>
    <div className="relative">
      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        className="w-full rounded-lg border border-slate-300 pl-9 pr-9 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  </div>
);
