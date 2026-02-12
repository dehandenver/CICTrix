/**
 * Employee Profile & Dashboard Page Component
 * Displays comprehensive employee information in an organized, professional layout
 */

import { useState } from 'react';
import {
  LogOut,
  Menu,
  X,
  User,
  FileText,
  Phone,
  MapPin,
  Calendar,
  Heart,
  Home,
  IdCard,
  Mail,
} from 'lucide-react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Employee, EmployeeSession } from '../../types/employee.types';
import hrisLogo from '../../assets/hris-logo.svg';
import '../../styles/admin.css';

interface EmployeePageProps {
  currentUser: Employee;
  onLogout: () => void;
}

type NavigationTab = 'profile' | 'documents';

export const EmployeePage: React.FC<EmployeePageProps> = ({
  currentUser,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<NavigationTab>('profile');
  const [sidebarOpen, setOpenSidebar] = useState(true);

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
          icon={<User size={20} />}
          label="My Profile"
          active={activeTab === 'profile'}
          onClick={() => setActiveTab('profile')}
          sidebarOpen={sidebarOpen}
        />
        <NavLink
          icon={<FileText size={20} />}
          label="Documents"
          active={activeTab === 'documents'}
          onClick={() => setActiveTab('documents')}
          sidebarOpen={sidebarOpen}
        />
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
  }: {
    icon: React.ReactNode;
    label: string;
    active: boolean;
    onClick: () => void;
    sidebarOpen: boolean;
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
              {activeTab === 'profile' ? 'My Profile' : 'Documents'}
            </h2>
            <div className="flex items-center gap-4">
              <img src={hrisLogo} alt="Logo" className="h-10 w-10 rounded" />
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">
                  {currentUser.fullName}
                </p>
                <p className="text-xs text-gray-600">{currentUser.email}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-8">
          {activeTab === 'profile' ? (
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
          ) : (
            // Documents Tab
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-md border border-gray-200 p-12 text-center">
                <FileText
                  size={48}
                  className="mx-auto text-gray-400 mb-4"
                />
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Documents Section
                </h3>
                <p className="text-gray-600 mb-6">
                  Document management features coming soon. You'll be able to
                  download and manage your employment documents here.
                </p>
                <Button variant="outline" size="md">
                  Request Document
                </Button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
