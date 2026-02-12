/**
 * Employee Profile & Dashboard Page Component
 * Displays comprehensive employee information in an organized, professional layout
 */

import {
    AlertCircle,
    Calendar,
    Check,
    Clock,
    FileText,
    Heart,
    Home,
    IdCard,
    Lock,
    LogOut,
    Mail,
    Menu,
    Phone,
    Upload,
    User,
    X,
} from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import hrisLogo from '../../assets/hris-logo.svg';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import '../../styles/admin.css';
import { Employee } from '../../types/employee.types';

interface EmployeePageProps {
  currentUser: Employee;
  onLogout: () => void;
}

type NavigationTab =
  | 'dashboard'
  | 'profile'
  | 'document-requirements'
  | 'submission-bin';
type DocumentStatus = 'pending' | 'verified' | 'missing';

type RequiredDocument = {
  id: string;
  name: string;
  status: DocumentStatus;
};

export const EmployeePage: React.FC<EmployeePageProps> = ({
  currentUser,
  onLogout,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setOpenSidebar] = useState(true);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRequirement, setSelectedRequirement] = useState('pds');
  const [uploadError, setUploadError] = useState('');

  // Define required documents
  const requiredDocuments: RequiredDocument[] = [
    { id: 'pds', name: 'Personal Data Sheet (PDS)', status: 'verified' },
    { id: 'medical', name: 'Medical Certificate', status: 'missing' },
    { id: 'nbi', name: 'NBI Clearance', status: 'missing' },
    { id: 'birth', name: 'Birth Certificate', status: 'missing' },
  ];

  const handleFileUpload = (file: File | null) => {
    if (!file) return;

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Only PDF or JPG files are allowed.');
      return;
    }

    setUploadError('');
    setUploadedFiles((prev) =>
      prev.includes(selectedRequirement) ? prev : [...prev, selectedRequirement]
    );
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 2500);
  };

  const handleSubmitForReview = () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
  };

  const getDocumentStatus = (doc: RequiredDocument): DocumentStatus => {
    if (uploadedFiles.includes(doc.id)) {
      return 'pending';
    }
    return doc.status;
  };

  const pendingCount = requiredDocuments.filter(
    (doc) => getDocumentStatus(doc) === 'missing'
  ).length;

  const getActiveTab = (pathname: string): NavigationTab => {
    if (pathname.includes('/employee/documents/requirements')) {
      return 'document-requirements';
    }
    if (pathname.includes('/employee/documents/submission')) {
      return 'submission-bin';
    }
    if (pathname.includes('/employee/profile')) {
      return 'profile';
    }
    return 'dashboard';
  };

  const activeTab = getActiveTab(location.pathname);

  const StatusBadge = ({ status }: { status: DocumentStatus }) => {
    const badgeStyles: Record<DocumentStatus, string> = {
      verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      pending: 'bg-amber-50 text-amber-700 border-amber-200',
      missing: 'bg-rose-50 text-rose-700 border-rose-200',
    };

    const statusIcon =
      status === 'verified' ? (
        <Check size={14} />
      ) : status === 'pending' ? (
        <Clock size={14} />
      ) : (
        <AlertCircle size={14} />
      );

    const label = status.charAt(0).toUpperCase() + status.slice(1);

    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${badgeStyles[status]}`}
      >
        {statusIcon}
        {label}
      </span>
    );
  };

  // Format date to readable format
  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return 'Not provided';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  // Data Grid Item Component
  const DataGridItem = ({
    label,
    value,
    icon: Icon,
  }: {
    label: string;
    value: string | number;
    icon?: React.ReactNode;
  }) => (
    <div className="flex flex-col space-y-1 pb-3 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2">
        {Icon && <span className="text-blue-600">{Icon}</span>}
        <p className="text-sm font-medium text-gray-600">{label}</p>
      </div>
      <p className="text-base font-semibold text-gray-900 pl-6">{value || '—'}</p>
    </div>
  );

  // Profile Header Card
  const ProfileHeader = () => (
    <div className="mb-6 bg-gradient-to-r from-blue-600 to-blue-800 rounded-2xl p-6 text-white shadow-lg">
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-md">
          <User size={40} className="text-blue-600" />
        </div>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{currentUser.fullName}</h1>
          <p className="text-blue-100 text-sm mt-1">
            Employee ID: <span className="font-semibold">{currentUser.employeeId}</span>
          </p>
          <p className="text-blue-100 text-sm">{currentUser.email}</p>
        </div>
      </div>
    </div>
  );

  // Sidebar Navigation
  const Sidebar = () => (
    <aside
      className={`${
        sidebarOpen ? 'w-56' : 'w-20'
      } bg-slate-900 text-white transition-all duration-300 flex flex-col h-screen fixed left-0 top-0 z-40 shadow-xl border-r border-slate-800`}
    >
      {/* Sidebar Header */}
      <div className="p-4 flex items-center justify-between border-b border-slate-700">
        {sidebarOpen && <span className="font-bold text-lg">Menu</span>}
        <button
          onClick={() => setOpenSidebar(!sidebarOpen)}
          className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          title={sidebarOpen ? 'Collapse' : 'Expand'}
        >
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 p-4 space-y-2">
        <NavLink
          icon={<Home size={20} />}
          label="Dashboard"
          active={activeTab === 'dashboard'}
          onClick={() => navigate('/employee/dashboard')}
          sidebarOpen={sidebarOpen}
        />
        <NavLink
          icon={<User size={20} />}
          label="My Profile"
          active={activeTab === 'profile'}
          onClick={() => navigate('/employee/profile')}
          sidebarOpen={sidebarOpen}
        />
        <NavLink
          icon={<FileText size={20} />}
          label="Document Requirements"
          active={activeTab === 'document-requirements'}
          onClick={() => navigate('/employee/documents/requirements')}
          sidebarOpen={sidebarOpen}
        />
        <NavLink
          icon={<Upload size={20} />}
          label="Submission Bin"
          active={activeTab === 'submission-bin'}
          onClick={() => navigate('/employee/documents/submission')}
          sidebarOpen={sidebarOpen}
        >
          {pendingCount > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
              {pendingCount}
            </span>
          )}
        </NavLink>
      </nav>

      {/* Logout Button */}
      <div className="p-4 border-t border-slate-700">
        <Button
          variant="ghost"
          className={`w-full justify-start gap-3 text-red-400 hover:text-red-300 hover:bg-red-900/20 ${
            !sidebarOpen && 'px-2'
          }`}
          onClick={onLogout}
          title="Logout"
        >
          <LogOut size={20} />
          {sidebarOpen && <span>Logout</span>}
        </Button>
      </div>
    </aside>
  );

  // Navigation Link Item
  const NavLink = ({
    icon,
    label,
    active,
    onClick,
    sidebarOpen,
    children,
  }: {
    icon: React.ReactNode;
    label: string;
    active: boolean;
    onClick: () => void;
    sidebarOpen: boolean;
    children?: React.ReactNode;
  }) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
      }`}
      title={!sidebarOpen ? label : undefined}
    >
      {icon}
      {sidebarOpen && <span className="font-medium">{label}</span>}
      {children && sidebarOpen && <span className="ml-auto">{children}</span>}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className={`${sidebarOpen ? 'ml-56' : 'ml-20'} transition-all duration-300`}>
        {/* Top Header Bar */}
        <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-30">
          <div className="px-8 py-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">
              {activeTab === 'dashboard'
                ? 'Dashboard'
                : activeTab === 'profile'
                  ? 'My Profile'
                  : activeTab === 'document-requirements'
                    ? 'Document Requirements'
                    : 'Submission Bin'}
            </h2>
            <div className="flex items-center gap-4">
              <img src={hrisLogo} alt="Logo" className="h-10 w-10 rounded" />
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">
                  {currentUser.fullName}
                </p>
                <p className="text-xs text-gray-600">{currentUser.email}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={onLogout}
              >
                <LogOut size={16} />
                Logout
              </Button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-8">
          {activeTab === 'dashboard' ? (
            <div className="space-y-6">
              <ProfileHeader />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Card title="Quick Summary">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <User size={18} className="text-blue-600" />
                      <div>
                        <p className="text-sm text-gray-600">Profile Status</p>
                        <p className="text-base font-semibold text-gray-900">
                          Active Employee
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail size={18} className="text-blue-600" />
                      <div>
                        <p className="text-sm text-gray-600">Email</p>
                        <p className="text-base font-semibold text-gray-900">
                          {currentUser.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <FileText size={18} className="text-blue-600" />
                      <div>
                        <p className="text-sm text-gray-600">Documents Submitted</p>
                        <p className="text-base font-semibold text-gray-900">
                          {uploadedFiles.length} / {requiredDocuments.length}
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card title="Security Notice">
                  <div className="flex items-start gap-3">
                    <Lock size={18} className="text-blue-600" />
                    <div className="space-y-2">
                      <p className="text-sm text-gray-700">
                        Your records are protected with encryption at rest and
                        role-based access controls.
                      </p>
                      <p className="text-xs text-gray-500">
                        Please keep your credentials confidential.
                      </p>
                    </div>
                  </div>
                </Card>

                <Card title="Next Steps">
                  <div className="space-y-2 text-sm text-gray-600">
                    <p>1. Review your profile details.</p>
                    <p>2. Submit required documents.</p>
                    <p>3. Wait for HRMO verification.</p>
                  </div>
                </Card>
              </div>
            </div>
          ) : activeTab === 'profile' ? (
            <div className="space-y-6">
              {/* Profile Header */}
              <ProfileHeader />

              {/* Grid Layout for Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Personal Information Card */}
                <Card title="Personal Information" className="lg:col-span-1">
                  <div className="space-y-3">
                    <DataGridItem
                      label="Date of Birth"
                      value={formatDate(currentUser.dateOfBirth)}
                      icon={<Calendar size={16} />}
                    />
                    <DataGridItem
                      label="Age"
                      value={currentUser.age}
                      icon={<User size={16} />}
                    />
                    <DataGridItem
                      label="Gender"
                      value={currentUser.gender}
                      icon={<User size={16} />}
                    />
                    <DataGridItem
                      label="Civil Status"
                      value={currentUser.civilStatus}
                      icon={<Heart size={16} />}
                    />
                    <DataGridItem
                      label="Nationality"
                      value={currentUser.nationality}
                      icon={<User size={16} />}
                    />
                  </div>
                </Card>

                {/* Contact & Address Card */}
                <Card title="Contact & Address" className="lg:col-span-1">
                  <div className="space-y-3">
                    <DataGridItem
                      label="Mobile Number"
                      value={currentUser.mobileNumber}
                      icon={<Phone size={16} />}
                    />
                    <DataGridItem
                      label="Email"
                      value={currentUser.email}
                      icon={<Mail size={16} />}
                    />
                    <DataGridItem
                      label="Home Address"
                      value={currentUser.homeAddress}
                      icon={<Home size={16} />}
                    />
                  </div>
                </Card>

                {/* Emergency Contact Card */}
                <Card title="Emergency Contact" className="lg:col-span-1">
                  <div className="space-y-3">
                    <DataGridItem
                      label="Contact Name"
                      value={currentUser.emergencyContactName}
                      icon={<User size={16} />}
                    />
                    <DataGridItem
                      label="Relationship"
                      value={currentUser.emergencyRelationship}
                      icon={<Heart size={16} />}
                    />
                    <DataGridItem
                      label="Contact Number"
                      value={currentUser.emergencyContactNumber}
                      icon={<Phone size={16} />}
                    />
                  </div>
                </Card>

                {/* Government Identifiers Card - Spans full width on mobile/tablet */}
                <Card
                  title="Government Identifiers"
                  className="md:col-span-2 lg:col-span-3"
                >
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="flex flex-col space-y-2">
                      <div className="flex items-center gap-2">
                        <IdCard size={16} className="text-blue-600" />
                        <p className="text-xs font-medium text-gray-600">
                          SSS Number
                        </p>
                      </div>
                      <p className="text-sm font-mono font-bold text-gray-900">
                        {currentUser.sssNumber || '—'}
                      </p>
                    </div>

                    <div className="flex flex-col space-y-2">
                      <div className="flex items-center gap-2">
                        <IdCard size={16} className="text-blue-600" />
                        <p className="text-xs font-medium text-gray-600">
                          PhilHealth No.
                        </p>
                      </div>
                      <p className="text-sm font-mono font-bold text-gray-900">
                        {currentUser.philhealthNumber || '—'}
                      </p>
                    </div>

                    <div className="flex flex-col space-y-2">
                      <div className="flex items-center gap-2">
                        <IdCard size={16} className="text-blue-600" />
                        <p className="text-xs font-medium text-gray-600">
                          PAG-IBIG No.
                        </p>
                      </div>
                      <p className="text-sm font-mono font-bold text-gray-900">
                        {currentUser.pagibigNumber || '—'}
                      </p>
                    </div>

                    <div className="flex flex-col space-y-2">
                      <div className="flex items-center gap-2">
                        <IdCard size={16} className="text-blue-600" />
                        <p className="text-xs font-medium text-gray-600">
                          TIN Number
                        </p>
                      </div>
                      <p className="text-sm font-mono font-bold text-gray-900">
                        {currentUser.tinNumber || '—'}
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          ) : activeTab === 'document-requirements' ? (
            <div className="space-y-6">
              <Card title="Document Requirements">
                <div className="space-y-4">
                  {requiredDocuments.map((doc) => {
                    const status = getDocumentStatus(doc);
                    return (
                      <div
                        key={doc.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 border border-gray-100 rounded-lg"
                      >
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {doc.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            Accepted formats: PDF, JPG
                          </p>
                        </div>
                        <StatusBadge status={status} />
                      </div>
                    );
                  })}

                  <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-gray-500">
                      All documents are stored with encryption at rest.
                    </p>
                    <Button
                      variant="primary"
                      size="sm"
                      className="gap-2"
                      onClick={handleSubmitForReview}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Submitted' : 'Submit for Review'}
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          ) : (
            <div className="space-y-6">
              {showSuccessToast && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg flex items-center gap-2">
                  <Check size={16} />
                  File uploaded successfully. Your document is now pending review.
                </div>
              )}

              <Card title="Submission Bin">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Select requirement
                    </label>
                    <select
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                      value={selectedRequirement}
                      onChange={(event) => setSelectedRequirement(event.target.value)}
                    >
                      {requiredDocuments.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label
                    htmlFor="document-upload"
                    className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/40 px-4 py-8 text-center cursor-pointer"
                  >
                    <Upload size={24} className="text-blue-500" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        Drag & drop or click to upload
                      </p>
                      <p className="text-xs text-gray-500">PDF or JPG only</p>
                    </div>
                    <input
                      id="document-upload"
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg"
                      onChange={(event) =>
                        handleFileUpload(event.target.files?.[0] ?? null)
                      }
                    />
                  </label>

                  {uploadError && (
                    <div className="text-xs text-rose-600 flex items-center gap-2">
                      <AlertCircle size={14} />
                      {uploadError}
                    </div>
                  )}

                  <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-500">
                    <p className="font-semibold text-gray-700 mb-1">Security</p>
                    <p>Files are scanned and encrypted at rest for your safety.</p>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
