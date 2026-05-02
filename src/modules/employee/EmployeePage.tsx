import {
    Bell,
    ChevronRight,
    Clock,
    Eye,
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
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    EMPLOYEE_DOCUMENTS_UPDATED_EVENT,
    EMPLOYEE_DOC_TYPES,
    dispatchEmployeeDocumentsUpdated,
    listEmployeeDocumentsForEmployee,
    uploadEmployeeDocument,
    type EmployeeDocumentRow,
    type EmployeeDocumentType,
} from '../../lib/employeeDocuments';
import { DocumentPreviewModal } from '../../components/DocumentPreviewModal';
import { updateEmployeePortalEmployee } from '../../lib/employeePortalData';
import { Employee } from '../../types/employee.types';

interface EmployeePageProps {
  currentUser: Employee;
  onLogout: () => void;
}

type PortalTab = 'personal' | 'documents' | 'submission';

interface TabConfig {
  id: PortalTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  route: string;
  count?: number;
}

interface RequirementItem {
  id: EmployeeDocumentType;
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
  const [profile, setProfile] = useState<Employee>(currentUser);
  const [editingSection, setEditingSection] = useState<EditableSection>(null);
  const [contactDraft, setContactDraft] = useState<ContactDraft>(getContactDraft(currentUser));
  const [emergencyDraft, setEmergencyDraft] = useState<EmergencyDraft>(getEmergencyDraft(currentUser));
  const [governmentDraft, setGovernmentDraft] = useState<GovernmentDraft>(getGovernmentDraft(currentUser));
  const [personalDraft, setPersonalDraft] = useState<PersonalDetailsDraft>(getPersonalDetailsDraft(currentUser));

  const profileSyncVersion = `${currentUser.employeeId}|${currentUser.updatedAt ?? ''}`;

  useEffect(() => {
    setProfile(currentUser);
    setContactDraft(getContactDraft(currentUser));
    setEmergencyDraft(getEmergencyDraft(currentUser));
    setGovernmentDraft(getGovernmentDraft(currentUser));
    setPersonalDraft(getPersonalDetailsDraft(currentUser));
    setEditingSection(null);
  }, [profileSyncVersion]);

  const tabs: TabConfig[] = useMemo(
    () => [
      { id: 'personal', label: 'Personal Information', icon: User, route: '/employee/profile' },
      { id: 'documents', label: 'Document Requirements', icon: FileText, route: '/employee/documents/requirements' },
      { id: 'submission', label: 'Submission Bin', icon: Bell, route: '/employee/documents/submission', count: 3 },
    ],
    []
  );

  const activeTab = useMemo<PortalTab>(() => {
    if (location.pathname.includes('/documents/requirements')) return 'documents';
    if (location.pathname.includes('/documents/submission')) return 'submission';
    if (location.pathname.includes('/profile')) return 'personal';
    return 'personal';
  }, [location.pathname]);

  const requirementItems: RequirementItem[] = useMemo(
    () =>
      EMPLOYEE_DOC_TYPES.map((type) => ({
        id: type.id,
        title: type.label,
        description: type.description,
      })),
    [],
  );

  // Index of the most-recent submission per document type, so the requirements
  // tab can show "Uploaded" / "Replace" without re-rendering the whole list.
  const latestByType = useMemo(() => {
    const map = new Map<string, EmployeeDocumentRow>();
    for (const doc of employeeDocuments) {
      const existing = map.get(doc.document_type);
      if (!existing || new Date(doc.uploaded_at) > new Date(existing.uploaded_at)) {
        map.set(doc.document_type, doc);
      }
    }
    return map;
  }, [employeeDocuments]);

  const pendingDocuments = useMemo(
    () => employeeDocuments.filter((d) => d.status === 'Pending'),
    [employeeDocuments],
  );

  const submittedDocuments = useMemo(
    () => employeeDocuments.filter((d) => d.status === 'Approved'),
    [employeeDocuments],
  );

  const refreshEmployeeDocuments = async () => {
    if (!currentUser?.employeeId && !currentUser?.email) return;
    const rows = await listEmployeeDocumentsForEmployee(
      currentUser.employeeId,
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

  const handleUpload = async (id: EmployeeDocumentType) => {
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
    });

    setUploadingId(null);

    if (result.success === false) {
      setUploadError(result.error);
      return;
    }

    setSelectedFile((prev) => ({ ...prev, [id]: null }));
    setUploadSuccess(`Uploaded "${file.name}" for ${id}. RSP will see it under Reports → ${id}.`);
    await refreshEmployeeDocuments();
    dispatchEmployeeDocumentsUpdated();
  };

  const persistProfilePatch = (patch: Partial<Employee>) => {
    const nowIso = new Date().toISOString();
    const nextProfile = { ...profile, ...patch, updatedAt: nowIso };
    setProfile(nextProfile);
    updateEmployeePortalEmployee(profile.employeeId, patch);
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
    persistProfilePatch({
      email: contactDraft.email.trim(),
      mobileNumber: contactDraft.mobileNumber.trim(),
      homeAddress: contactDraft.homeAddress.trim(),
    });
    setEditingSection(null);
  };

  const saveEmergencyInfo = () => {
    persistProfilePatch({
      emergencyContactName: emergencyDraft.emergencyContactName.trim(),
      emergencyRelationship: emergencyDraft.emergencyRelationship.trim(),
      emergencyContactNumber: emergencyDraft.emergencyContactNumber.trim(),
    });
    setEditingSection(null);
  };

  const saveGovernmentInfo = () => {
    persistProfilePatch({
      sssNumber: governmentDraft.sssNumber.trim(),
      philhealthNumber: governmentDraft.philhealthNumber.trim(),
      pagibigNumber: governmentDraft.pagibigNumber.trim(),
      tinNumber: governmentDraft.tinNumber.trim(),
    });
    setEditingSection(null);
  };

  const savePersonalInfo = () => {
    persistProfilePatch({
      fullName: personalDraft.fullName.trim(),
      dateOfBirth: personalDraft.dateOfBirth.trim(),
      placeOfBirth: personalDraft.placeOfBirth.trim(),
      gender: personalDraft.gender.trim(),
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
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Document Requirements</h2>
                  <p className="text-sm text-slate-500">Submit all required documents for profile completion.</p>
                </div>
                <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  {requirementItems.length} total
                </span>
              </div>

              {uploadError && (
                <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {uploadError}
                </p>
              )}

              {uploadSuccess && (
                <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {uploadSuccess}
                </p>
              )}

              <div className="space-y-3">
                {requirementItems.map((item) => {
                  const latest = latestByType.get(item.id);
                  const pickedFile = selectedFile[item.id] ?? null;
                  const isUploading = uploadingId === item.id;

                  return (
                    <article
                      key={item.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <h3 className="font-semibold text-slate-900">{item.title}</h3>
                          <p className="text-sm text-slate-500">{item.description}</p>
                          {latest && (
                            <p className="mt-1 text-xs text-emerald-700">
                              Last submitted: {latest.file_name} —{' '}
                              {new Date(latest.uploaded_at).toLocaleDateString()} (
                              {latest.status})
                            </p>
                          )}
                        </div>

                        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
                          {latest && (
                            <button
                              type="button"
                              onClick={() => setPreviewDocument(latest)}
                              className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
                            >
                              <Eye className="h-4 w-4" />
                              View Submitted
                            </button>
                          )}

                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                            <input
                              type="file"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0] ?? null;
                                handleFileSelect(item.id, file);
                              }}
                            />
                            <FileText className="h-4 w-4" />
                            {pickedFile ? 'Change File' : latest ? 'Replace File' : 'Select File'}
                          </label>

                          <button
                            type="button"
                            onClick={() => handleUpload(item.id)}
                            disabled={!pickedFile || isUploading}
                            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                          >
                            <Upload className="h-4 w-4" />
                            {isUploading ? 'Uploading...' : 'Upload'}
                          </button>
                        </div>
                      </div>

                      {pickedFile && (
                        <p className="mt-3 text-xs text-slate-500">
                          Selected file: {pickedFile.name} ({Math.round(pickedFile.size / 1024)} KB)
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'submission' && (
          <div className="space-y-5">
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">Pending Submissions</h2>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                  {pendingDocuments.length}
                </span>
              </div>

              <div className="space-y-3">
                {pendingDocuments.length === 0 && (
                  <p className="text-sm text-slate-500">No pending submissions.</p>
                )}
                {pendingDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-start justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
                  >
                    <div>
                      <p className="font-semibold text-amber-900">{doc.document_type}</p>
                      <p className="text-sm text-amber-800">
                        {doc.file_name} — submitted{' '}
                        {new Date(doc.uploaded_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Clock className="h-4 w-4 text-amber-700" />
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">Submitted Documents</h2>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  {submittedDocuments.length}
                </span>
              </div>

              <div className="space-y-3">
                {submittedDocuments.length === 0 && (
                  <p className="text-sm text-slate-500">No approved documents yet.</p>
                )}
                {submittedDocuments.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => setPreviewDocument(doc)}
                    className="flex w-full items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-left hover:bg-emerald-100"
                  >
                    <div>
                      <p className="font-semibold text-emerald-900">{doc.document_type}</p>
                      <p className="text-sm text-emerald-800">
                        {doc.file_name} — approved{' '}
                        {new Date(doc.uploaded_at).toLocaleDateString()}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-emerald-700" />
                  </button>
                ))}
              </div>
            </section>

            <p className="text-sm text-slate-500">
              For concerns about your pending documents, contact the HR office for verification updates.
            </p>
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
