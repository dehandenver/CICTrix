import { useState, useEffect } from 'react';
import { ChevronLeft, Copy, FilePlus2, Heart, Lock, Mail, MapPin, Phone, X } from 'lucide-react';
import { supabase as supabaseClient } from '../../../lib/supabase';

// Bypass auto-generated Supabase types resolving to `never`. Same escape hatch
// used elsewhere in the codebase.
const supabase = supabaseClient as any;
import {
  createPassword,
  findEmployeePortalAccount,
  getEmployeePortalAccounts,
  upsertEmployeePortalAccount,
} from '../../../lib/employeePortalData';
import { createDocumentRequest } from '../../../lib/employeeDocuments';
import ChangePositionModal from './ChangePositionModal';

interface Employee {
  id: string;
  employee_id: string;
  full_name: string;
  current_position: string;
  department: string;
  current_department?: string;
  status: string;
  email: string;
  mobile_number: string;
  hire_date: string;
  photo_url?: string;
  date_of_birth?: string;
  place_of_birth?: string;
  gender?: string;
  civil_status?: string;
  home_address?: string;
  emergency_contact_name?: string;
  emergency_relationship?: string;
  emergency_contact_number?: string;
}

/** Derive 2-letter initials from a full_name string. */
const getInitials = (name: string): string => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

interface Props {
  employee: Employee;
  onBack: () => void;
  onRefresh: () => void;
}

type TabType = 'personal' | 'documents';

export default function EmployeeDetailPage({ employee, onBack, onRefresh }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('personal');
  const [showChangePositionModal, setShowChangePositionModal] = useState(false);
  const [documents, setDocuments] = useState<any[]>([]);
  const [fullEmployee, setFullEmployee] = useState<Employee>(employee);

  // Reset password flow
  const [resetState, setResetState] = useState<'idle' | 'confirm' | 'working' | 'done' | 'error'>('idle');
  const [resetPasswordValue, setResetPasswordValue] = useState<string | null>(null);
  const [resetUsername, setResetUsername] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  // Request Document flow — HR creates an hr_request row that lands in the
  // employee's Submission Bin.
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestName, setRequestName] = useState('');
  const [requestDescription, setRequestDescription] = useState('');
  const [requestDueDate, setRequestDueDate] = useState('');
  const [requestSaving, setRequestSaving] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    // Check if this is a newly hired applicant or an established employee
    if (employee.id.startsWith('applicant-')) {
      // For newly hired applicants, fetch from applicants table
      fetchApplicantDetails();
    } else {
      // For established employees, fetch from employees table
      fetchEmployeeDetails();
    }
    fetchDocuments();
  }, [employee.id]);

  const fetchEmployeeDetails = async () => {
    try {
      // Read through the view so `department` (canonical name) is present.
      const { data, error } = await supabase
        .from('employees_with_department')
        .select('*')
        .eq('id', employee.id)
        .single();

      if (error) throw error;
      if (data) {
        setFullEmployee(data);
      }
    } catch (error) {
      console.error('Error fetching employee details:', error);
    }
  };

  const fetchApplicantDetails = async () => {
    try {
      const applicantId = employee.id.replace('applicant-', '');
      const { data, error } = await supabase
        .from('applicants')
        .select('*')
        .eq('id', applicantId)
        .single();

      if (error) throw error;
      if (data) {
        // Transform applicant data to match Schema B Employee shape
        setFullEmployee({
          ...employee,
          full_name: `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim(),
          current_position: data.position,
          department: data.office,
          mobile_number: data.contact_number,
          email: data.email,
          status: 'Pending Onboarding',
          employee_id: employee.employee_id,
          hire_date: data.created_at,
        });
      }
    } catch (error) {
      console.error('Error fetching applicant details:', error);
    }
  };

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('employee_documents')
        .select('*')
        .eq('employee_id', employee.id);

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  const calculateAge = (dateOfBirth: string | undefined) => {
    if (!dateOfBirth) return null;
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const age = calculateAge(fullEmployee.date_of_birth);

  /**
   * Locate the Employee Portal account for this employee. Portal accounts are
   * keyed by employee_id / email, so we try the most reliable identifiers
   * in order.
   */
  const findPortalAccountForEmployee = () => {
    const accounts = getEmployeePortalAccounts();
    const empId = String(fullEmployee.employee_id ?? '').trim();
    const email = String(fullEmployee.email ?? '').trim().toLowerCase();

    return (
      accounts.find((account) =>
        String(account.employee.employeeId ?? '').trim() === empId,
      ) ??
      accounts.find((account) =>
        String(account.employee.email ?? '').trim().toLowerCase() === email,
      ) ??
      null
    );
  };

  const handleResetPasswordConfirm = async () => {
    setResetState('working');
    setResetError(null);

    try {
      const account = findPortalAccountForEmployee();
      if (!account) {
        setResetError(
          `No employee-portal account exists for ${fullEmployee.employee_id} / ${fullEmployee.email}. ` +
            `Generate credentials from Newly Hired first.`,
        );
        setResetState('error');
        return;
      }

      const newPassword = createPassword();

      upsertEmployeePortalAccount({
        id: account.id,
        username: account.username,
        password: newPassword,
        employee: account.employee,
      });

      // Sanity check that the new credential pair works for login.
      const verify = findEmployeePortalAccount(account.username, newPassword);
      if (!verify) {
        setResetError('Password was generated but could not be verified. Please retry.');
        setResetState('error');
        return;
      }

      setResetUsername(account.username);
      setResetPasswordValue(newPassword);
      setResetState('done');
    } catch (error) {
      console.error('handleResetPasswordConfirm: failed', error);
      setResetError(error instanceof Error ? error.message : String(error));
      setResetState('error');
    }
  };

  const closeResetModal = () => {
    setResetState('idle');
    setResetPasswordValue(null);
    setResetUsername(null);
    setResetError(null);
  };

  const closeRequestModal = () => {
    setRequestModalOpen(false);
    setRequestName('');
    setRequestDescription('');
    setRequestDueDate('');
    setRequestError(null);
  };

  const handleCreateRequest = async () => {
    setRequestError(null);

    if (!requestName.trim()) {
      setRequestError('Document name is required.');
      return;
    }

    setRequestSaving(true);
    const result = await createDocumentRequest({
      employeeId: fullEmployee.id,
      email: fullEmployee.email,
      documentName: requestName,
      description: requestDescription,
      dueDate: requestDueDate,
      requestedBy: 'HR Department',
    });
    setRequestSaving(false);

    if (result.success === false) {
      setRequestError(result.error);
      return;
    }

    closeRequestModal();
    await fetchDocuments();
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.warn('clipboard write failed', error);
    }
  };

  const getStatusColor = (status: string, id?: string) => {
    // Newly hired applicants get orange/amber status
    if (id?.startsWith('applicant-')) {
      return 'bg-orange-100 text-orange-800';
    }
    
    switch (status) {
      case 'Active':
        return 'bg-green-100 text-green-800';
      case 'On Leave':
        return 'bg-yellow-100 text-yellow-800';
      case 'Pending Onboarding':
        return 'bg-blue-100 text-blue-800';
      case 'Resigned':
      case 'Terminated':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header with Back Button */}
        <div className="mb-6">
          <button
            onClick={onBack}
            className="text-blue-600 hover:text-blue-700 flex items-center gap-2 font-medium mb-6"
          >
            <ChevronLeft size={20} />
            Back to Employees
          </button>
        </div>

        {/* Employee Header Card */}
        <div className="bg-white rounded-lg border border-gray-200 p-8 mb-6">
          <div className="flex items-start gap-6">
            {/* Photo/Avatar */}
            <div className="w-32 h-32 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-5xl">
                {getInitials(fullEmployee.full_name)}
              </span>
            </div>

            {/* Employee Info */}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-1">
                {fullEmployee.full_name}
              </h1>
              <p className="text-lg text-gray-600 mb-4">{fullEmployee.current_position}</p>

              <div className="flex flex-wrap gap-3 mb-6">
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                  {fullEmployee.department}
                </span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(fullEmployee.status, fullEmployee.id)}`}>
                  {fullEmployee.id.startsWith('applicant-') ? 'Pending Onboarding' : fullEmployee.status}
                </span>
                <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium font-mono">
                  {fullEmployee.employee_id}
                </span>
              </div>
            </div>

            {/* Edit Button */}
            <button
              onClick={() => setShowChangePositionModal(true)}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
            >
              ↑ Edit
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg border border-gray-200 mb-6">
          <div className="border-b border-gray-200 flex">
            <button
              onClick={() => setActiveTab('personal')}
              className={`px-6 py-4 font-medium transition-colors ${
                activeTab === 'personal'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Personal Details
            </button>
            <button
              onClick={() => setActiveTab('documents')}
              className={`px-6 py-4 font-medium transition-colors relative ${
                activeTab === 'documents'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Documents & Requirements
              {documents.length > 0 && (
                <span className="absolute top-2 right-4 w-6 h-6 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center font-semibold">
                  {documents.length}
                </span>
              )}
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-8">
            {activeTab === 'personal' && (
              <div className="space-y-8">
                {/* Contact Information */}
                <div>
                  <div className="flex items-center gap-2 mb-6">
                    <Mail className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg font-semibold text-gray-900">Contact Information</h2>
                  </div>

                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">Email Address</label>
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-gray-400" />
                        <p className="text-gray-900">{fullEmployee.email}</p>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">Contact Number</label>
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-gray-400" />
                        <p className="text-gray-900">{fullEmployee.mobile_number || 'N/A'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <label className="block text-sm text-gray-600 mb-2">Address</label>
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                      <div>
                        {fullEmployee.home_address ? (
                          <p className="text-gray-900">{fullEmployee.home_address}</p>
                        ) : (
                          <p className="text-gray-600">No address on file</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Employment Details */}
                <div className="pt-6 border-t border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900 mb-6">Employment Details</h2>

                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">Employee ID</label>
                      <p className="text-gray-900 font-mono font-semibold">{fullEmployee.employee_id}</p>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">Position</label>
                      <p className="text-gray-900">{fullEmployee.current_position}</p>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">Department</label>
                      <p className="text-gray-900">{fullEmployee.department}</p>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">Hire Date</label>
                      <p className="text-gray-900">
                        {fullEmployee.hire_date ? new Date(fullEmployee.hire_date).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">Status</label>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(fullEmployee.status, fullEmployee.id)}`}>
                        {fullEmployee.id.startsWith('applicant-') ? 'Pending Onboarding' : fullEmployee.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Personal Details */}
                <div className="pt-6 border-t border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900 mb-6">Personal Details</h2>

                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">Date of Birth</label>
                      <p className="text-gray-900">
                        {fullEmployee.date_of_birth
                          ? new Date(fullEmployee.date_of_birth).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">Place of Birth</label>
                      <p className="text-gray-900">{fullEmployee.place_of_birth || 'N/A'}</p>
                    </div>
                    {age !== null && (
                      <div>
                        <label className="block text-sm text-gray-600 mb-2">Age</label>
                        <p className="text-gray-900">{age} years old</p>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">Gender</label>
                      <p className="text-gray-900">{fullEmployee.gender || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">Civil Status</label>
                      <div className="flex items-center gap-2">
                        <Heart className="w-4 h-4 text-gray-400" />
                        <p className="text-gray-900">{fullEmployee.civil_status || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Emergency Contact */}
                {(fullEmployee.emergency_contact_name || fullEmployee.emergency_contact_number) && (
                  <div className="pt-6 border-t border-gray-200">
                    <div className="flex items-center gap-2 mb-6">
                      <AlertCircle className="w-5 h-5 text-red-600" />
                      <h2 className="text-lg font-semibold text-gray-900">Emergency Contact</h2>
                    </div>

                    <div className="grid grid-cols-2 gap-8">
                      <div>
                        <label className="block text-sm text-gray-600 mb-2">Contact Person</label>
                        <p className="text-gray-900">{fullEmployee.emergency_contact_name || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-2">Relationship</label>
                        <p className="text-gray-900">{fullEmployee.emergency_relationship || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-2">Phone Number</label>
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-gray-400" />
                          <p className="text-gray-900">{fullEmployee.emergency_contact_number || 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Reset Password Button */}
                <div className="pt-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => { setResetState('confirm'); setResetError(null); }}
                    className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium flex items-center gap-2 transition-colors"
                  >
                    <Lock size={18} />
                    Reset Password
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'documents' && (
              <div>
                <div className="mb-6 flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    Documents uploaded by the employee, plus any documents you've requested from them.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setRequestModalOpen(true); setRequestError(null); }}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    <FilePlus2 size={16} />
                    Request Document
                  </button>
                </div>

                {documents.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No documents uploaded or requested yet.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {documents.map((doc) => {
                      const isRequest = doc.category === 'hr_request';
                      const hasFile = Boolean(doc.file_url);
                      const cardBase =
                        'p-4 border rounded-lg transition-all block ' +
                        (hasFile
                          ? 'border-gray-200 hover:border-blue-400 hover:shadow-md'
                          : 'border-amber-200 bg-amber-50');

                      const body = (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-gray-900 mb-1">{doc.document_name}</p>
                            <span
                              className={
                                'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ' +
                                (doc.status === 'Approved'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : doc.status === 'Submitted'
                                    ? 'bg-blue-100 text-blue-700'
                                    : doc.status === 'Rejected'
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-amber-100 text-amber-700')
                              }
                            >
                              {doc.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">
                            {isRequest ? 'HR Request' : doc.document_type}
                          </p>
                          {doc.description && (
                            <p className="mt-1 text-sm text-gray-500">{doc.description}</p>
                          )}
                          {doc.due_date && (
                            <p className="mt-1 text-xs text-gray-500">
                              Due: {String(doc.due_date).slice(0, 10)}
                            </p>
                          )}
                          {!hasFile && (
                            <p className="mt-1 text-xs font-medium text-amber-700">
                              Awaiting employee upload
                            </p>
                          )}
                        </>
                      );

                      return hasFile ? (
                        <a
                          key={doc.id}
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cardBase}
                        >
                          {body}
                        </a>
                      ) : (
                        <div key={doc.id} className={cardBase}>
                          {body}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Change Position Modal */}
      {showChangePositionModal && (
        <ChangePositionModal
          employee={fullEmployee}
          onClose={() => setShowChangePositionModal(false)}
          onSuccess={() => {
            setShowChangePositionModal(false);
            fetchEmployeeDetails();
            onRefresh();
          }}
        />
      )}

      {requestModalOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 px-4"
          onClick={() => { if (!requestSaving) closeRequestModal(); }}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h3 className="text-base font-semibold text-slate-900">Request a Document</h3>
              <button
                type="button"
                onClick={closeRequestModal}
                disabled={requestSaving}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <p className="text-sm text-slate-600">
                This will appear in {fullEmployee.full_name.split(' ')[0]}'s Submission Bin as a pending request.
              </p>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Document Name
                </span>
                <input
                  type="text"
                  value={requestName}
                  onChange={(e) => setRequestName(e.target.value)}
                  disabled={requestSaving}
                  placeholder="e.g. Medical Certificate"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:bg-slate-100"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Description
                </span>
                <textarea
                  value={requestDescription}
                  onChange={(e) => setRequestDescription(e.target.value)}
                  disabled={requestSaving}
                  rows={3}
                  placeholder="What exactly does the employee need to submit?"
                  className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:bg-slate-100"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Due Date
                </span>
                <input
                  type="date"
                  value={requestDueDate}
                  onChange={(e) => setRequestDueDate(e.target.value)}
                  disabled={requestSaving}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:bg-slate-100"
                />
              </label>

              {requestError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {requestError}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeRequestModal}
                  disabled={requestSaving}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateRequest}
                  disabled={requestSaving || !requestName.trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {requestSaving ? 'Creating…' : 'Send Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {resetState !== 'idle' && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 px-4"
          onClick={() => { if (resetState !== 'working') closeResetModal(); }}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h3 className="text-base font-semibold text-slate-900">
                {resetState === 'done' ? 'New Password Generated' : 'Reset Employee Password'}
              </h3>
              <button
                type="button"
                onClick={closeResetModal}
                disabled={resetState === 'working'}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              {resetState === 'confirm' && (
                <>
                  <p className="text-sm text-slate-700">
                    Generate a new password for{' '}
                    <span className="font-semibold">
                      {fullEmployee.full_name}
                    </span>{' '}
                    ({fullEmployee.employee_id})? The old password will stop working immediately.
                  </p>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeResetModal}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleResetPasswordConfirm}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                    >
                      Yes, reset password
                    </button>
                  </div>
                </>
              )}

              {resetState === 'working' && (
                <p className="text-sm text-slate-600">Generating new password…</p>
              )}

              {resetState === 'done' && resetPasswordValue && (
                <>
                  <p className="text-sm text-slate-700">
                    Password reset successfully. Share these credentials with the employee — they
                    won't be shown again.
                  </p>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="mb-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Username</p>
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-mono text-sm font-semibold text-slate-900">{resetUsername}</p>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(resetUsername ?? '')}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <Copy size={14} /> Copy
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">New Password</p>
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-mono text-sm font-semibold text-red-600">{resetPasswordValue}</p>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(resetPasswordValue)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <Copy size={14} /> Copy
                        </button>
                      </div>
                    </div>
                  </div>

                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    The employee should change this password on their first login.
                  </p>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={closeResetModal}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Done
                    </button>
                  </div>
                </>
              )}

              {resetState === 'error' && (
                <>
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {resetError ?? 'Something went wrong. Please try again.'}
                  </p>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={closeResetModal}
                      className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                    >
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Alert Circle Icon (fallback)
function AlertCircle({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4v2m0 0v2m0-6v2m0 0v-2m0 0H9m3 0h3" />
    </svg>
  );
}
