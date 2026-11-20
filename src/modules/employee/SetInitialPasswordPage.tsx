import { Eye, EyeOff, KeyRound, Loader2, Lock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ActionFeedback } from '../../components/action-feedback';
import {
  changeEmployeePortalPassword,
  getEmployeePortalAccountByEmployeeNumber,
} from '../../lib/employeePortalData';

interface SetInitialPasswordPageProps {
  employeeNumber: string;
  username: string;
  fullName: string;
  onDone: () => void;
}

type PasswordFailure = { message: string; nextStep: string };

export const SetInitialPasswordPage: React.FC<SetInitialPasswordPageProps> = ({
  employeeNumber,
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
  const [failure, setFailure] = useState<PasswordFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);
  const employeeNumberRef = useRef(String(employeeNumber ?? '').trim());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    employeeNumberRef.current = String(employeeNumber ?? '').trim();
    submittingRef.current = false;
    setSaving(false);
    setFailure(null);
  }, [employeeNumber]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || saving) return;
    setFailure(null);

    if (!tempPassword) {
      setFailure({
        message: 'Enter the temporary password from your onboarding email.',
        nextStep: 'Find it in that email, then paste it here.',
      });
      return;
    }
    if (newPassword.length < 8) {
      setFailure({
        message: 'Your new password is too short.',
        nextStep: 'Use at least 8 characters, then try again.',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFailure({
        message: "The two new passwords don't match.",
        nextStep: 'Retype both and try again.',
      });
      return;
    }
    if (newPassword === tempPassword) {
      setFailure({
        message: 'Your new password is the same as the temporary one.',
        nextStep: 'Choose a different password, then try again.',
      });
      return;
    }

    const activeEmployeeNumber = String(employeeNumber ?? '').trim();
    if (!activeEmployeeNumber) {
      setFailure({
        message: 'Your employee session is missing an employee number.',
        nextStep: 'Sign out and sign in again, or contact HR for assistance.',
      });
      return;
    }

    submittingRef.current = true;
    setSaving(true);
    try {
      const lookup = await getEmployeePortalAccountByEmployeeNumber(activeEmployeeNumber);
      if (!mountedRef.current || employeeNumberRef.current !== activeEmployeeNumber) return;

      if (lookup.ok === false) {
        setFailure({
          message:
            lookup.kind === 'not_found'
              ? 'We could not find your employee portal account.'
              : lookup.kind === 'ambiguous_account'
                ? 'Multiple portal accounts matched your employee number.'
                : 'We could not reach the account service right now.',
          nextStep:
            lookup.kind === 'lookup_unavailable'
              ? 'Check your connection and try again.'
              : 'Contact HR to verify your employee portal account.',
        });
        return;
      }

      const result = await changeEmployeePortalPassword(
        {
          accountId: lookup.account.id,
          employeeNumber: activeEmployeeNumber,
          expectedRevision: lookup.account.updatedAt,
        },
        tempPassword,
        newPassword,
      );
      if (!mountedRef.current || employeeNumberRef.current !== activeEmployeeNumber) return;

      if (result.ok === false) {
        setFailure({
          message: result.error,
          nextStep:
            result.kind === 'unconfirmed'
              ? 'Try signing in with your new password before submitting this form again.'
              : 'Check the temporary password and try again. If it keeps failing, contact your administrator.',
        });
        return;
      }

      onDone();
    } finally {
      submittingRef.current = false;
      if (mountedRef.current && employeeNumberRef.current === activeEmployeeNumber) {
        setSaving(false);
      }
    }
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

          {failure && (
            <ActionFeedback
              title="We couldn't set your password."
              message={failure.message}
              nextStep={failure.nextStep}
              onDismiss={() => setFailure(null)}
            />
          )}

          <button
            type="submit"
            disabled={saving}
            aria-busy={saving || undefined}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving
              ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Set Password and Continue</>
              : 'Set Password and Continue'}
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
