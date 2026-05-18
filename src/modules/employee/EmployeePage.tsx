import {
    Bell,
    Calendar,
    CheckCircle2,
    Clock,
    Eye,
    EyeOff,
    FileText,
    Home,
    Lock,
    LogOut,
    Pencil,
    Save,
    Upload,
    User,
    X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    APPLICATION_DOC_TYPES,
    EMPLOYEE_DOCUMENTS_UPDATED_EVENT,
    dispatchEmployeeDocumentsUpdated,
    listEmployeeDocumentsForEmployee,
    uploadEmployeeDocument,
    type ApplicationDocumentType,
    type EmployeeDocumentRow,
} from '../../lib/employeeDocuments';
import { DocumentPreviewModal } from '../../components/DocumentPreviewModal';
import {
  changeEmployeePortalPassword,
  changeEmployeePortalUsername,
  findEmployeeByEmployeeId,
  findEmployeePortalAccount,
  updateEmployeePortalEmployee,
} from '../../lib/employeePortalData';
import { Employee } from '../../types/employee.types';
import {
  fetchPortalEmployeeById,
  patchPortalEmployee,
} from '../../lib/api/employeePortal';

interface EmployeePageProps {
  currentUser: Employee;
  onLogout: () => void;
}

type PortalTab = 'personal' | 'documents' | 'submission' | 'account';

interface TabConfig {
  id: PortalTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  route: string;
  count?: number;
}

interface RequirementItem {
  id: ApplicationDocumentType;
  title: string;
  description: string;
}

type EditableSection = 'personal' | 'contact' | 'emergency' | 'government' | null;

type ContactDraft = {
  email: string;
  mobileNumber: string;
  homeAddress: string;
};

type EmergencyDraft = {
  emergencyContactName: string;
  emergencyRelationship: string;
  emergencyContactNumber: string;
};

type GovernmentDraft = {
  sssNumber: string;
  philhealthNumber: string;
  pagibigNumber: string;
  tinNumber: string;
};

type PersonalDetailsDraft = {
  fullName: string;
  dateOfBirth: string;
  placeOfBirth: string;
  gender: string;
  homeAddress: string;
};

interface EditableInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}

const getContactDraft = (employee: Employee): ContactDraft => ({
  email: employee.email || '',
  mobileNumber: employee.mobileNumber || '',
  homeAddress: employee.homeAddress || '',
});

const getEmergencyDraft = (employee: Employee): EmergencyDraft => ({
  emergencyContactName: employee.emergencyContactName || '',
  emergencyRelationship: employee.emergencyRelationship || '',
  emergencyContactNumber: employee.emergencyContactNumber || '',
});

const getGovernmentDraft = (employee: Employee): GovernmentDraft => ({
  sssNumber: employee.sssNumber || '',
  philhealthNumber: employee.philhealthNumber || '',
  pagibigNumber: employee.pagibigNumber || '',
  tinNumber: employee.tinNumber || '',
});

// Figma shows ISO-style dates (e.g. "2026-02-20"). Keep it timezone-safe by
// reading the date parts rather than constructing a Date in local time.
const formatPortalDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const iso = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Date(value).toISOString().slice(0, 10);
};

// Whole-day countdown to a due date. Negative => overdue.
const daysUntil = (dueDate: string | null | undefined): number | null => {
  if (!dueDate) return null;
  const due = new Date(`${String(dueDate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
};

const dueLabel = (dueDate: string | null | undefined): string => {
  const days = daysUntil(dueDate);
  if (days === null) return '';
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return 'due today';
  return `${days} day${days === 1 ? '' : 's'} left`;
};

const getPersonalDetailsDraft = (employee: Employee): PersonalDetailsDraft => ({
  fullName: employee.fullName || '',
  dateOfBirth: employee.dateOfBirth || '',
  placeOfBirth: employee.placeOfBirth || '',
  gender: employee.gender || '',
  homeAddress: employee.homeAddress || '',
});

const EditableInput: React.FC<EditableInputProps> = ({ label, value, onChange, type = 'text', disabled = false }) => (
  <label className="block">
    <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
    />
  </label>
);

export const EmployeePage: React.FC<EmployeePageProps> = ({ currentUser, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedFile, setSelectedFile] = useState<Record<string, File | null>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [employeeDocuments, setEmployeeDocuments] = useState<EmployeeDocumentRow[]>([]);
  const [previewDocument, setPreviewDocument] = useState<EmployeeDocumentRow | null>(null);

  // Account & Security tab — username + password change forms
  const portalAccountAtMount = useMemo(
    () => (currentUser?.employeeId ? findEmployeeByEmployeeId(currentUser.employeeId) : null),
    [currentUser?.employeeId],
  );
  const [currentPortalUsername, setCurrentPortalUsername] = useState<string>(
    portalAccountAtMount?.username ?? '',
  );
  const [usernameDraft, setUsernameDraft] = useState<string>(portalAccountAtMount?.username ?? '');
  const [usernameMessage, setUsernameMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const [currentPasswordInput, setCurrentPasswordInput] = useState<string>('');
  const [newPasswordInput, setNewPasswordInput] = useState<string>('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState<string>('');
  const [passwordMessage, setPasswordMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Re-authentication gate for the Account & Security tab.
  // Locked by default and re-locks every time the user leaves the tab,
  // so a colleague walking up to the screen can't change credentials.
  const [accountTabUnlocked, setAccountTabUnlocked] = useState(false);
  const [confirmLoginUsername, setConfirmLoginUsername] = useState('');
  const [confirmLoginPassword, setConfirmLoginPassword] = useState('');
  const [confirmLoginError, setConfirmLoginError] = useState<string | null>(null);
  const [confirmLoginVerifying, setConfirmLoginVerifying] = useState(false);

  // Per-field "show password" toggles for the four password inputs.
  const [showConfirmLoginPw, setShowConfirmLoginPw] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmNewPw, setShowConfirmNewPw] = useState(false);

  const handleConfirmLogin = (event?: React.FormEvent) => {
    event?.preventDefault();
    setConfirmLoginError(null);

    if (!currentPortalUsername) {
      setConfirmLoginError(
        'No portal account was found for your record. Contact HR to generate your credentials first.',
      );
      return;
    }

    if (!confirmLoginUsername.trim()) {
      setConfirmLoginError('Please enter your username.');
      return;
    }

    if (!confirmLoginPassword) {
      setConfirmLoginError('Please enter your password.');
      return;
    }

    setConfirmLoginVerifying(true);
    const verified = findEmployeePortalAccount(confirmLoginUsername.trim(), confirmLoginPassword);
    setConfirmLoginVerifying(false);

    if (!verified) {
      setConfirmLoginError('Username or password is incorrect.');
      return;
    }

    // The credentials must belong to the *currently logged-in* employee — not any
    // other portal account that happens to authenticate.
    const verifiedEmployeeId = String(verified.employee.employeeId ?? '').trim();
    const sessionEmployeeId = String(currentUser?.employeeId ?? '').trim();
    if (verifiedEmployeeId && sessionEmployeeId && verifiedEmployeeId !== sessionEmployeeId) {
      setConfirmLoginError("These credentials don't match the account you're logged in as.");
      return;
    }

    setAccountTabUnlocked(true);
    setConfirmLoginUsername('');
    setConfirmLoginPassword('');
  };


  const handleSaveUsername = () => {
    setUsernameMessage(null);
    const result = changeEmployeePortalUsername(currentPortalUsername, usernameDraft);
    if (result.ok === false) {
      setUsernameMessage({ kind: 'error', text: result.error });
      return;
    }
    setCurrentPortalUsername(result.account.username);
    setUsernameDraft(result.account.username);
    setUsernameMessage({
      kind: 'success',
      text: `Username updated to "${result.account.username}". Use it the next time you log in.`,
    });
  };

  const handleSavePassword = () => {
    setPasswordMessage(null);

    if (newPasswordInput !== confirmPasswordInput) {
      setPasswordMessage({ kind: 'error', text: 'New password and confirmation do not match.' });
      return;
    }

    const result = changeEmployeePortalPassword(
      currentPortalUsername,
      currentPasswordInput,
      newPasswordInput,
    );
    if (result.ok === false) {
      setPasswordMessage({ kind: 'error', text: result.error });
      return;
    }

    setCurrentPasswordInput('');
    setNewPasswordInput('');
    setConfirmPasswordInput('');
    setPasswordMessage({
      kind: 'success',
      text: 'Password updated. Use the new password the next time you log in.',
    });
  };
  const [profile, setProfile] = useState<Employee>(currentUser);
  const [editingSection, setEditingSection] = useState<EditableSection>(null);
  const [contactDraft, setContactDraft] = useState<ContactDraft>(getContactDraft(currentUser));
  const [emergencyDraft, setEmergencyDraft] = useState<EmergencyDraft>(getEmergencyDraft(currentUser));
  const [governmentDraft, setGovernmentDraft] = useState<GovernmentDraft>(getGovernmentDraft(currentUser));
  const [personalDraft, setPersonalDraft] = useState<PersonalDetailsDraft>(getPersonalDetailsDraft(currentUser));

  // DB-hydration state — true while the initial Supabase fetch is in-flight.
  const [profileLoading, setProfileLoading] = useState(false);
  // Save feedback banners for profile edits.
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  // Track whether the initial DB fetch has completed, to suppress the
  // profileSyncVersion watcher from overwriting freshly-fetched data.
  const dbHydrated = useRef(false);

  const profileSyncVersion = `${currentUser.employeeId}|${currentUser.updatedAt ?? ''}`;

  useEffect(() => {
    // Suppress the sync when the DB hydration has already applied fresher data.
    if (dbHydrated.current) return;
    setProfile(currentUser);
    setContactDraft(getContactDraft(currentUser));
    setEmergencyDraft(getEmergencyDraft(currentUser));
    setGovernmentDraft(getGovernmentDraft(currentUser));
    setPersonalDraft(getPersonalDetailsDraft(currentUser));
    setEditingSection(null);
  }, [profileSyncVersion]);

  // ── DB hydration (mount-only) ──────────────────────────────────────────────
  // Fetch the live Supabase row once on mount using the internal UUID.
  // This overwrites any stub data that App.tsx passed via `currentUser`.
  useEffect(() => {
    if (!currentUser.supabaseId) return; // No DB row available (demo account)
    setProfileLoading(true);
    fetchPortalEmployeeById(currentUser.supabaseId).then((result) => {
      if (result.ok) {
        const live = result.data;
        dbHydrated.current = true;
        setProfile(live);
        setContactDraft(getContactDraft(live));
        setEmergencyDraft(getEmergencyDraft(live));
        setGovernmentDraft(getGovernmentDraft(live));
        setPersonalDraft(getPersonalDetailsDraft(live));
      }
      setProfileLoading(false);
    });
    // Intentionally empty deps — run only on mount, regardless of prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // HR-created document requests drive the Submission Bin tab.
  const hrRequests = useMemo(
    () => employeeDocuments.filter((d) => d.category === 'hr_request'),
    [employeeDocuments],
  );

  const pendingRequests = useMemo(
    () => hrRequests.filter((d) => d.status === 'Pending' || d.status === 'Rejected'),
    [hrRequests],
  );

  const submittedRequests = useMemo(
    () => hrRequests.filter((d) => d.status === 'Submitted' || d.status === 'Approved'),
    [hrRequests],
  );

  const tabs: TabConfig[] = useMemo(
    () => [
      { id: 'personal', label: 'Personal Information', icon: User, route: '/employee/profile' },
      { id: 'documents', label: 'Document Requirements', icon: FileText, route: '/employee/documents/requirements' },
      {
        id: 'submission',
        label: 'Submission Bin',
        icon: Bell,
        route: '/employee/documents/submission',
        count: pendingRequests.length || undefined,
      },
      { id: 'account', label: 'Account & Security', icon: Lock, route: '/employee/account' },
    ],
    [pendingRequests.length]
  );

  const activeTab = useMemo<PortalTab>(() => {
    if (location.pathname.includes('/documents/requirements')) return 'documents';
    if (location.pathname.includes('/documents/submission')) return 'submission';
    if (location.pathname.includes('/account')) return 'account';
    if (location.pathname.includes('/profile')) return 'personal';
    return 'personal';
  }, [location.pathname]);

  // Re-lock the Account & Security tab whenever the user navigates away.
  // Coming back forces another password confirmation.
  useEffect(() => {
    if (activeTab !== 'account') {
      setAccountTabUnlocked(false);
      setConfirmLoginUsername('');
      setConfirmLoginPassword('');
      setConfirmLoginError(null);
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
      setUsernameMessage(null);
      setPasswordMessage(null);
      setShowConfirmLoginPw(false);
      setShowCurrentPw(false);
      setShowNewPw(false);
      setShowConfirmNewPw(false);
    }
  }, [activeTab]);

  const requirementItems: RequirementItem[] = useMemo(
    () =>
      APPLICATION_DOC_TYPES.map((type) => ({
        id: type.id,
        title: type.label,
        description: type.description,
      })),
    [],
  );

  // Index of the most-recent application-document submission per type, so the
  // Document Requirements tab can show "Uploaded" / "Replace" without
  // re-rendering the whole list.
  const latestByType = useMemo(() => {
    const map = new Map<string, EmployeeDocumentRow>();
    for (const doc of employeeDocuments) {
      if (doc.category !== 'application') continue;
      const existing = map.get(doc.document_type);
      if (!existing || new Date(doc.uploaded_at) > new Date(existing.uploaded_at)) {
        map.set(doc.document_type, doc);
      }
    }
    return map;
  }, [employeeDocuments]);

  const refreshEmployeeDocuments = async () => {
    // Prefer the internal Supabase UUID (resolves the UUID FK correctly).
    // Fall back to the text employeeId for demo accounts without a DB row.
    const idToUse = currentUser.supabaseId ?? currentUser.employeeId;
    if (!idToUse && !currentUser?.email) return;
    const rows = await listEmployeeDocumentsForEmployee(
      idToUse,
      currentUser.email,
    );
    setEmployeeDocuments(rows);
  };

  useEffect(() => {
    void refreshEmployeeDocuments();
    const handler = () => { void refreshEmployeeDocuments(); };
    window.addEventListener(EMPLOYEE_DOCUMENTS_UPDATED_EVENT, handler);
    return () => window.removeEventListener(EMPLOYEE_DOCUMENTS_UPDATED_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.employeeId]);

  const handleTabSelect = (tab: TabConfig) => {
    navigate(tab.route);
  };

  const handleFileSelect = (id: string, file: File | null) => {
    setSelectedFile((prev) => ({ ...prev, [id]: file }));
  };

  const handleUpload = async (id: ApplicationDocumentType) => {
    const file = selectedFile[id];
    if (!file) {
      setUploadError('Please choose a file before clicking Upload.');
      setUploadSuccess(null);
      return;
    }

    setUploadingId(id);
    setUploadError(null);
    setUploadSuccess(null);

    const result = await uploadEmployeeDocument({
      employeeId: currentUser.employeeId,
      email: currentUser.email,
      documentType: id,
      file,
      category: 'application',
    });

    setUploadingId(null);

    if (result.success === false) {
      setUploadError(result.error);
      return;
    }

    setSelectedFile((prev) => ({ ...prev, [id]: null }));
    setUploadSuccess(`Uploaded "${file.name}" for ${id}.`);
    await refreshEmployeeDocuments();
    dispatchEmployeeDocumentsUpdated();
  };

  // Submission Bin: attach a file to an HR-created request (status -> 'Submitted').
  const handleRequestUpload = async (request: EmployeeDocumentRow, file: File | null) => {
    if (!file) return;

    setUploadingId(request.id);
    setUploadError(null);
    setUploadSuccess(null);

    const result = await uploadEmployeeDocument({
      employeeId: currentUser.employeeId,
      email: currentUser.email,
      documentType: request.document_type,
      file,
      category: 'hr_request',
      requestId: request.id,
    });

    setUploadingId(null);

    if (result.success === false) {
      setUploadError(result.error);
      return;
    }

    setUploadSuccess(`Submitted "${file.name}" for ${request.document_name}.`);
    await refreshEmployeeDocuments();
    dispatchEmployeeDocumentsUpdated();
  };

  const persistProfilePatch = async (patch: Partial<Employee>) => {
    const nowIso = new Date().toISOString();
    // Optimistic local update.
    const nextProfile = { ...profile, ...patch, updatedAt: nowIso };
    setProfile(nextProfile);
    setSaveError(null);
    setSaveSuccess(null);

    if (currentUser.supabaseId) {
      // Write to Supabase.
      const result = await patchPortalEmployee(currentUser.supabaseId, patch);
      if (result.ok === false) {
        setSaveError(result.error ?? 'Failed to save changes. Please try again.');
        // Rollback optimistic update.
        setProfile(profile);
        return;
      }
      setSaveSuccess('Changes saved successfully.');
    } else {
      // Fallback: demo account — persist to localStorage only.
      updateEmployeePortalEmployee(profile.employeeId, patch);
    }
  };

  const startEditing = (section: Exclude<EditableSection, null>) => {
    if (section === 'personal') {
      setPersonalDraft(getPersonalDetailsDraft(profile));
    }
    if (section === 'contact') {
      setContactDraft(getContactDraft(profile));
    }
    if (section === 'emergency') {
      setEmergencyDraft(getEmergencyDraft(profile));
    }
    if (section === 'government') {
      setGovernmentDraft(getGovernmentDraft(profile));
    }
    setEditingSection(section);
  };

  const cancelEditing = () => {
    setContactDraft(getContactDraft(profile));
    setEmergencyDraft(getEmergencyDraft(profile));
    setGovernmentDraft(getGovernmentDraft(profile));
    setPersonalDraft(getPersonalDetailsDraft(profile));
    setEditingSection(null);
  };

  const saveContactInfo = () => {
    void persistProfilePatch({
      email: contactDraft.email.trim(),
      mobileNumber: contactDraft.mobileNumber.trim(),
      homeAddress: contactDraft.homeAddress.trim(),
    });
    setEditingSection(null);
  };

  const saveEmergencyInfo = () => {
    void persistProfilePatch({
      emergencyContactName: emergencyDraft.emergencyContactName.trim(),
      emergencyRelationship: emergencyDraft.emergencyRelationship.trim(),
      emergencyContactNumber: emergencyDraft.emergencyContactNumber.trim(),
    });
    setEditingSection(null);
  };

  const saveGovernmentInfo = () => {
    void persistProfilePatch({
      sssNumber: governmentDraft.sssNumber.trim(),
      philhealthNumber: governmentDraft.philhealthNumber.trim(),
      pagibigNumber: governmentDraft.pagibigNumber.trim(),
      tinNumber: governmentDraft.tinNumber.trim(),
    });
    setEditingSection(null);
  };

  const savePersonalInfo = () => {
    const trimmedGender = personalDraft.gender.trim();
    const allowedGenders: Employee['gender'][] = ['Male', 'Female', 'Other', 'Prefer not to say'];
    const safeGender: Employee['gender'] = (allowedGenders as string[]).includes(trimmedGender)
      ? (trimmedGender as Employee['gender'])
      : 'Prefer not to say';

    void persistProfilePatch({
      fullName: personalDraft.fullName.trim(),
      dateOfBirth: personalDraft.dateOfBirth.trim(),
      placeOfBirth: personalDraft.placeOfBirth.trim(),
      gender: safeGender,
      homeAddress: personalDraft.homeAddress.trim(),
      personalDetailsFinalized: true, // Lock editing after first save
    });
    setEditingSection(null);
  };

  const FieldRow: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
    <div className="grid grid-cols-1 gap-1 py-2 md:grid-cols-[210px_1fr] md:gap-3">
      <div className="text-sm font-semibold text-slate-600">{label}:</div>
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
        {value?.trim() || 'Not provided'}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Home className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Employee Self-Service Portal</h1>
              <p className="text-sm text-slate-500">Human Resources Information System</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-700">Welcome, {currentUser.fullName}</p>
              <p className="text-xs text-slate-500">Employee ID: {currentUser.employeeId}</p>
            </div>
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="flex flex-wrap gap-2 py-3">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTab;
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabSelect(tab)}
                  className={[
                    'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition',
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  {tab.count ? (
                    <span
                      className={[
                        'rounded-full px-2 py-0.5 text-xs font-bold',
                        isActive ? 'bg-white text-blue-700' : 'bg-rose-100 text-rose-700',
                      ].join(' ')}
                    >
                      {tab.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        {activeTab === 'personal' && (
          <div className="space-y-5">
            {/* Loading skeleton */}
            {profileLoading && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 animate-pulse">
                <div className="h-5 w-48 rounded bg-slate-200 mb-4" />
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((n) => (
                    <div key={n} className="grid grid-cols-[210px_1fr] gap-3">
                      <div className="h-4 rounded bg-slate-200" />
                      <div className="h-8 rounded bg-slate-100" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Save feedback banners */}
            {saveError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                {saveError}
              </p>
            )}
            {saveSuccess && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                {saveSuccess}
              </p>
            )}
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Personal Information</h2>
                  <p className="text-sm text-slate-500">
                    {profile.personalDetailsFinalized
                      ? 'Your personal details have been finalized and cannot be edited.'
                      : 'Edit your personal details. You can only do this once.'}
                  </p>
                </div>
                {!profile.personalDetailsFinalized ? (
                  editingSection === 'personal' ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={savePersonalInfo}
                        className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        <Save className="h-3.5 w-3.5" />
                        Save
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEditing('personal')}
                      className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-200"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  )
                ) : (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Locked</span>
                )}
              </div>
              {editingSection === 'personal' ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <EditableInput
                    label="Full Name"
                    value={personalDraft.fullName}
                    onChange={(value) => setPersonalDraft((prev) => ({ ...prev, fullName: value }))}
                  />
                  <EditableInput
                    label="Date of Birth"
                    value={personalDraft.dateOfBirth}
                    type="date"
                    onChange={(value) => setPersonalDraft((prev) => ({ ...prev, dateOfBirth: value }))}
                  />
                  <EditableInput
                    label="Place of Birth"
                    value={personalDraft.placeOfBirth}
                    onChange={(value) => setPersonalDraft((prev) => ({ ...prev, placeOfBirth: value }))}
                  />
                  <EditableInput
                    label="Gender"
                    value={personalDraft.gender}
                    onChange={(value) => setPersonalDraft((prev) => ({ ...prev, gender: value }))}
                  />
                  <div className="md:col-span-2">
                    <EditableInput
                      label="Address"
                      value={personalDraft.homeAddress}
                      onChange={(value) => setPersonalDraft((prev) => ({ ...prev, homeAddress: value }))}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <FieldRow label="Full Name" value={profile.fullName} />
                  <FieldRow label="Employee ID" value={profile.employeeId} />
                  <FieldRow label="Date of Birth" value={profile.dateOfBirth} />
                  <FieldRow label="Place of Birth" value={profile.placeOfBirth || '--'} />
                  <FieldRow label="Gender" value={profile.gender || '--'} />
                  <FieldRow label="Address" value={profile.homeAddress} />
                  <FieldRow label="Position" value="Employee" />
                </>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Contact Information</h2>
                  <p className="text-sm text-slate-500">You can edit and save your latest contact details.</p>
                </div>
                {editingSection === 'contact' ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={cancelEditing}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveContactInfo}
                      className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startEditing('contact')}
                    className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-200"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                )}
              </div>
              {editingSection === 'contact' ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <EditableInput
                    label="Mobile Number"
                    value={contactDraft.mobileNumber}
                    onChange={(value) => setContactDraft((prev) => ({ ...prev, mobileNumber: value }))}
                  />
                  <EditableInput
                    label="Email Address"
                    value={contactDraft.email}
                    type="email"
                    onChange={(value) => setContactDraft((prev) => ({ ...prev, email: value }))}
                  />
                  <div className="md:col-span-2">
                    <EditableInput
                      label="Home Address"
                      value={contactDraft.homeAddress}
                      onChange={(value) => setContactDraft((prev) => ({ ...prev, homeAddress: value }))}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <FieldRow label="Email Address" value={profile.email} />
                  <FieldRow label="Phone Number" value={profile.mobileNumber} />
                  <FieldRow label="Home Address" value={profile.homeAddress} />
                </>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Emergency Contact</h2>
                  <p className="text-sm text-slate-500">Update your emergency contact person and details.</p>
                </div>
                {editingSection === 'emergency' ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={cancelEditing}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveEmergencyInfo}
                      className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startEditing('emergency')}
                    className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-200"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                )}
              </div>
              {editingSection === 'emergency' ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <EditableInput
                    label="Contact Person Name"
                    value={emergencyDraft.emergencyContactName}
                    onChange={(value) => setEmergencyDraft((prev) => ({ ...prev, emergencyContactName: value }))}
                  />
                  <EditableInput
                    label="Relationship"
                    value={emergencyDraft.emergencyRelationship}
                    onChange={(value) => setEmergencyDraft((prev) => ({ ...prev, emergencyRelationship: value }))}
                  />
                  <EditableInput
                    label="Contact Number"
                    value={emergencyDraft.emergencyContactNumber}
                    onChange={(value) => setEmergencyDraft((prev) => ({ ...prev, emergencyContactNumber: value }))}
                  />
                </div>
              ) : (
                <>
                  <FieldRow label="Contact Name" value={profile.emergencyContactName} />
                  <FieldRow label="Relationship" value={profile.emergencyRelationship} />
                  <FieldRow label="Phone Number" value={profile.emergencyContactNumber} />
                </>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Government Identification</h2>
                  <p className="text-sm text-slate-500">Update your government membership and tax identifiers.</p>
                </div>
                {editingSection === 'government' ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={cancelEditing}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveGovernmentInfo}
                      className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startEditing('government')}
                    className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-200"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                )}
              </div>
              {editingSection === 'government' ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <EditableInput
                    label="SSS Number"
                    value={governmentDraft.sssNumber}
                    onChange={(value) => setGovernmentDraft((prev) => ({ ...prev, sssNumber: value }))}
                  />
                  <EditableInput
                    label="PhilHealth Number"
                    value={governmentDraft.philhealthNumber}
                    onChange={(value) => setGovernmentDraft((prev) => ({ ...prev, philhealthNumber: value }))}
                  />
                  <EditableInput
                    label="Pag-IBIG Number"
                    value={governmentDraft.pagibigNumber}
                    onChange={(value) => setGovernmentDraft((prev) => ({ ...prev, pagibigNumber: value }))}
                  />
                  <EditableInput
                    label="TIN Number"
                    value={governmentDraft.tinNumber}
                    onChange={(value) => setGovernmentDraft((prev) => ({ ...prev, tinNumber: value }))}
                  />
                </div>
              ) : (
                <>
                  <FieldRow label="SSS Number" value={profile.sssNumber} />
                  <FieldRow label="PhilHealth Number" value={profile.philhealthNumber} />
                  <FieldRow label="Pag-IBIG Number" value={profile.pagibigNumber} />
                  <FieldRow label="TIN Number" value={profile.tinNumber} />
                </>
              )}
            </section>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-800">
              Manage your original application documents. You can upload or update the required documents below.
            </div>

            {uploadError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {uploadError}
              </p>
            )}

            {uploadSuccess && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {uploadSuccess}
              </p>
            )}

            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-xl font-bold text-slate-900">Requirements Upload Bin</h2>
              <p className="mt-1 text-sm text-slate-500">
                Upload or update the documents. Only the document types listed below are allowed.
              </p>

              <div className="mt-5 space-y-4">
                {requirementItems.map((item) => {
                  const latest = latestByType.get(item.id);
                  const pickedFile = selectedFile[item.id] ?? null;
                  const isUploading = uploadingId === item.id;

                  return (
                    <article
                      key={item.id}
                      className="rounded-xl border border-slate-200 bg-white px-5 py-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <FileText className="h-5 w-5 shrink-0 text-indigo-500" />
                            <h3 className="font-semibold text-slate-900">{item.title}</h3>
                          </div>

                          {latest ? (
                            <div className="mt-2 space-y-1 pl-7 text-sm text-slate-500">
                              <p className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-slate-400" />
                                {latest.file_name}
                              </p>
                              <p className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-slate-400" />
                                Uploaded: {formatPortalDate(latest.uploaded_at)}
                              </p>
                            </div>
                          ) : (
                            <p className="mt-2 pl-7 text-sm text-slate-400">No file uploaded yet</p>
                          )}

                          {pickedFile && (
                            <p className="mt-2 pl-7 text-xs text-indigo-600">
                              Selected: {pickedFile.name} ({Math.round(pickedFile.size / 1024)} KB)
                            </p>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {latest && (
                            <button
                              type="button"
                              onClick={() => setPreviewDocument(latest)}
                              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                            >
                              <Eye className="h-4 w-4" />
                              Preview
                            </button>
                          )}

                          {pickedFile ? (
                            <button
                              type="button"
                              onClick={() => handleUpload(item.id)}
                              disabled={isUploading}
                              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                            >
                              <Upload className="h-4 w-4" />
                              {isUploading ? 'Uploading…' : 'Confirm Upload'}
                            </button>
                          ) : (
                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                              <input
                                type="file"
                                className="hidden"
                                onChange={(e) => handleFileSelect(item.id, e.target.files?.[0] ?? null)}
                              />
                              <Upload className="h-4 w-4" />
                              {latest ? 'Replace' : 'Upload'}
                            </label>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                <span className="font-semibold">Note:</span> Accepted file formats: PDF, DOC, DOCX, JPG, PNG.
                Maximum file size: 10MB. You can replace an uploaded document at any time — please ensure you
                upload the correct file.
              </div>
            </section>
          </div>
        )}

        {activeTab === 'submission' && (
          <div className="space-y-4">
            {pendingRequests.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
                HR has requested additional documents. Please review and submit the required documents by the due date.
              </div>
            )}

            {uploadError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {uploadError}
              </p>
            )}

            {uploadSuccess && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {uploadSuccess}
              </p>
            )}

            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-xl font-bold text-slate-900">Submission Bin</h2>
              <p className="mt-1 text-sm text-slate-500">
                HR may request additional documents from time to time. Upload the requested documents by the due date.
              </p>

              {/* Pending Submissions */}
              <div className="mt-6 flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-500" />
                <h3 className="font-semibold text-slate-900">
                  Pending Submissions ({pendingRequests.length})
                </h3>
              </div>

              <div className="mt-3 space-y-3">
                {pendingRequests.length === 0 && (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    No pending document requests.
                  </p>
                )}
                {pendingRequests.map((request) => {
                  const isUploading = uploadingId === request.id;
                  const days = daysUntil(request.due_date);
                  const overdue = days !== null && days < 0;

                  return (
                    <article
                      key={request.id}
                      className="rounded-xl border border-amber-200 border-l-4 border-l-amber-400 bg-amber-50/60 px-5 py-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-semibold text-slate-900">{request.document_name}</h4>
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                              <Clock className="h-3 w-3" />
                              {request.status === 'Rejected' ? 'Needs Resubmission' : 'Pending'}
                            </span>
                          </div>
                          {request.description && (
                            <p className="mt-1 text-sm text-slate-600">{request.description}</p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
                            <span>
                              Requested by:{' '}
                              <span className="font-medium text-slate-700">
                                {request.requested_by || 'HR Department'}
                              </span>
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              Due: {formatPortalDate(request.due_date)}
                              {request.due_date && (
                                <span className={overdue ? 'font-semibold text-red-600' : 'font-semibold text-amber-700'}>
                                  {' '}({dueLabel(request.due_date)})
                                </span>
                              )}
                            </span>
                          </div>
                        </div>

                        <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 self-start rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                          <input
                            type="file"
                            className="hidden"
                            disabled={isUploading}
                            onChange={(e) => void handleRequestUpload(request, e.target.files?.[0] ?? null)}
                          />
                          <Upload className="h-4 w-4" />
                          {isUploading ? 'Uploading…' : 'Upload'}
                        </label>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Submitted Documents */}
              <div className="mt-7 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <h3 className="font-semibold text-slate-900">
                  Submitted Documents ({submittedRequests.length})
                </h3>
              </div>

              <div className="mt-3 space-y-3">
                {submittedRequests.length === 0 && (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    No submitted documents yet.
                  </p>
                )}
                {submittedRequests.map((request) => {
                  const isUploading = uploadingId === request.id;

                  return (
                    <article
                      key={request.id}
                      className="rounded-xl border border-emerald-200 border-l-4 border-l-emerald-400 bg-emerald-50/60 px-5 py-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-semibold text-slate-900">{request.document_name}</h4>
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              {request.status === 'Approved' ? 'Approved' : 'Submitted'}
                            </span>
                          </div>
                          {request.description && (
                            <p className="mt-1 text-sm text-slate-600">{request.description}</p>
                          )}
                          {request.file_name && (
                            <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                              <FileText className="h-4 w-4 text-slate-400" />
                              {request.file_name}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
                            <span>Submitted: {formatPortalDate(request.uploaded_at)}</span>
                            {request.due_date && <span>Due date: {formatPortalDate(request.due_date)}</span>}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2 self-start">
                          {request.file_url && (
                            <button
                              type="button"
                              onClick={() => setPreviewDocument(request)}
                              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                            >
                              <Eye className="h-4 w-4" />
                              Preview
                            </button>
                          )}
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50">
                            <input
                              type="file"
                              className="hidden"
                              disabled={isUploading}
                              onChange={(e) => void handleRequestUpload(request, e.target.files?.[0] ?? null)}
                            />
                            <Upload className="h-4 w-4" />
                            {isUploading ? 'Uploading…' : 'Resubmit'}
                          </label>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                <span className="font-semibold">Important:</span> Please submit all requested documents before
                the due date. Late submissions may affect your employment records. Contact HR if you need an
                extension or have questions about the requirements.
              </div>
            </section>
          </div>
        )}

        {activeTab === 'account' && !accountTabUnlocked && (
          <div className="space-y-5">
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="rounded-lg bg-blue-100 p-2 text-blue-700">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Confirm It's You</h2>
                  <p className="text-sm text-slate-500">
                    For your security, please re-enter your password before changing your username or password.
                  </p>
                </div>
              </div>

              {!currentPortalUsername && (
                <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  No portal account was found for your record. Contact HR to generate your credentials first.
                </p>
              )}

              <form
                onSubmit={handleConfirmLogin}
                className="space-y-3"
                autoComplete="off"
                data-form-type="other"
              >
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Username
                  </span>
                  <input
                    type="text"
                    value={confirmLoginUsername}
                    onChange={(e) => setConfirmLoginUsername(e.target.value)}
                    disabled={!currentPortalUsername || confirmLoginVerifying}
                    autoFocus
                    autoComplete="off"
                    name="cictrix-confirm-id-field"
                    data-form-type="other"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                    placeholder="Enter your username"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Password
                  </span>
                  <div className="relative">
                    {/* Use type="text" with text-security CSS masking instead of
                        type="password" so the browser doesn't recognize this as a
                        login form and offer the saved-credentials dropdown. */}
                    <input
                      type="text"
                      value={confirmLoginPassword}
                      onChange={(e) => setConfirmLoginPassword(e.target.value)}
                      disabled={!currentPortalUsername || confirmLoginVerifying}
                      autoComplete="off"
                      name="cictrix-confirm-secret-field"
                      data-form-type="other"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      style={{
                        // @ts-expect-error: webkit-only text masking
                        WebkitTextSecurity: showConfirmLoginPw ? 'none' : 'disc',
                        textSecurity: showConfirmLoginPw ? 'none' : 'disc',
                        fontFamily: showConfirmLoginPw ? undefined : 'text-security-disc, inherit',
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-sm text-slate-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                      placeholder="Enter your current password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmLoginPw((v) => !v)}
                      tabIndex={-1}
                      aria-label={showConfirmLoginPw ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    >
                      {showConfirmLoginPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>

                {confirmLoginError && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {confirmLoginError}
                  </p>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={
                      !currentPortalUsername ||
                      !confirmLoginUsername.trim() ||
                      !confirmLoginPassword ||
                      confirmLoginVerifying
                    }
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {confirmLoginVerifying ? 'Verifying…' : 'Continue'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {activeTab === 'account' && accountTabUnlocked && (
          <div className="space-y-5">
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4">
                <h2 className="text-lg font-bold text-slate-900">Change Username</h2>
                <p className="text-sm text-slate-500">
                  Pick a unique username you'll use to log in. Letters, digits, dot, underscore, and hyphen only.
                </p>
              </div>

              {!currentPortalUsername && (
                <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  No portal account was found for your record. Contact HR to generate your credentials first.
                </p>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Current Username
                  </span>
                  <input
                    type="text"
                    value={currentPortalUsername}
                    disabled
                    className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    New Username
                  </span>
                  <input
                    type="text"
                    value={usernameDraft}
                    onChange={(e) => setUsernameDraft(e.target.value)}
                    disabled={!currentPortalUsername}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                    placeholder="e.g. mariasantos"
                  />
                </label>
              </div>

              {usernameMessage && (
                <p
                  className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                    usernameMessage.kind === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {usernameMessage.text}
                </p>
              )}

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveUsername}
                  disabled={!currentPortalUsername || usernameDraft.trim() === currentPortalUsername}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  Save Username
                </button>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4">
                <h2 className="text-lg font-bold text-slate-900">Change Password</h2>
                <p className="text-sm text-slate-500">
                  Enter your current password, then choose a new one. Minimum 6 characters.
                </p>
              </div>

              <div className="grid gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Current Password
                  </span>
                  <div className="relative">
                    <input
                      type={showCurrentPw ? 'text' : 'password'}
                      value={currentPasswordInput}
                      onChange={(e) => setCurrentPasswordInput(e.target.value)}
                      disabled={!currentPortalUsername}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-sm text-slate-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPw((v) => !v)}
                      tabIndex={-1}
                      aria-label={showCurrentPw ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    >
                      {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      New Password
                    </span>
                    <div className="relative">
                      <input
                        type={showNewPw ? 'text' : 'password'}
                        value={newPasswordInput}
                        onChange={(e) => setNewPasswordInput(e.target.value)}
                        disabled={!currentPortalUsername}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-sm text-slate-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPw((v) => !v)}
                        tabIndex={-1}
                        aria-label={showNewPw ? 'Hide password' : 'Show password'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      >
                        {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Confirm New Password
                    </span>
                    <div className="relative">
                      <input
                        type={showConfirmNewPw ? 'text' : 'password'}
                        value={confirmPasswordInput}
                        onChange={(e) => setConfirmPasswordInput(e.target.value)}
                        disabled={!currentPortalUsername}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-sm text-slate-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmNewPw((v) => !v)}
                        tabIndex={-1}
                        aria-label={showConfirmNewPw ? 'Hide password' : 'Show password'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      >
                        {showConfirmNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </label>
                </div>
              </div>

              {passwordMessage && (
                <p
                  className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                    passwordMessage.kind === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {passwordMessage.text}
                </p>
              )}

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleSavePassword}
                  disabled={
                    !currentPortalUsername ||
                    !currentPasswordInput ||
                    !newPasswordInput ||
                    !confirmPasswordInput
                  }
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  Save Password
                </button>
              </div>
            </section>
          </div>
        )}
      </main>

      <DocumentPreviewModal
        open={previewDocument !== null}
        fileUrl={previewDocument?.file_url ?? ''}
        fileName={previewDocument?.file_name ?? ''}
        fileType={previewDocument?.file_type ?? null}
        title={previewDocument ? previewDocument.document_type : ''}
        subtitle={
          previewDocument
            ? `${previewDocument.file_name} — uploaded ${new Date(previewDocument.uploaded_at).toLocaleDateString()} (${previewDocument.status})`
            : ''
        }
        onClose={() => setPreviewDocument(null)}
      />
    </div>
  );
};

export default EmployeePage;
