import React, { useState, useEffect } from 'react';
import { ChevronLeft, Mail, Phone, MapPin, Heart, Lock } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import ChangePositionModal from './ChangePositionModal';

interface Employee {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  position: string;
  department: string;
  status: string;
  email: string;
  phone: string;
  date_hired: string;
  employment_status: string;
  photo_url?: string;
  date_of_birth?: string;
  place_of_birth?: string;
  sex?: string;
  civil_status?: string;
  emergency_contact_name?: string;
  emergency_contact_relationship?: string;
  emergency_contact_phone?: string;
  current_address_street?: string;
  current_address_barangay?: string;
  current_address_city?: string;
  current_address_province?: string;
  current_address_zipcode?: string;
}

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
      const { data, error } = await supabase
        .from('employees')
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
        // Transform applicant data to match employee format
        setFullEmployee({
          ...employee,
          ...data,
          department: data.office,
          phone: data.contact_number,
          status: 'Pending Onboarding',
          employee_number: employee.employee_number,
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
      case 'Suspended':
        return 'bg-red-100 text-red-800';
      case 'Pending Onboarding':
        return 'bg-blue-100 text-blue-800';
      case 'Separated':
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
                {fullEmployee.first_name[0]}{fullEmployee.last_name[0]}
              </span>
            </div>

            {/* Employee Info */}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-1">
                {fullEmployee.first_name} {fullEmployee.last_name}
              </h1>
              <p className="text-lg text-gray-600 mb-4">{fullEmployee.position}</p>

              <div className="flex flex-wrap gap-3 mb-6">
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                  {fullEmployee.department}
                </span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(fullEmployee.status, fullEmployee.id)}`}>
                  {fullEmployee.id.startsWith('applicant-') ? 'Pending Onboarding' : fullEmployee.status}
                </span>
                <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium font-mono">
                  {fullEmployee.employee_number}
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
                        <p className="text-gray-900">{fullEmployee.phone || 'N/A'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <label className="block text-sm text-gray-600 mb-2">Address</label>
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                      <div>
                        {fullEmployee.current_address_street && (
                          <p className="text-gray-900">
                            {fullEmployee.current_address_street}
                            {fullEmployee.current_address_barangay && `, ${fullEmployee.current_address_barangay}`}
                            {fullEmployee.current_address_city && `, ${fullEmployee.current_address_city}`}
                          </p>
                        )}
                        {!fullEmployee.current_address_street && <p className="text-gray-600">No address on file</p>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Employment Details */}
                <div className="pt-6 border-t border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900 mb-6">Employment Details</h2>

                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">Employee Number</label>
                      <p className="text-gray-900 font-mono font-semibold">{fullEmployee.employee_number}</p>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">Position</label>
                      <p className="text-gray-900">{fullEmployee.position}</p>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">Department</label>
                      <p className="text-gray-900">{fullEmployee.department}</p>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">Date Hired</label>
                      <p className="text-gray-900">
                        {fullEmployee.date_hired ? new Date(fullEmployee.date_hired).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">Employment Status</label>
                      <p className="text-gray-900">{fullEmployee.employment_status}</p>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">Account Status</label>
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
                      <label className="block text-sm text-gray-600 mb-2">Sex</label>
                      <p className="text-gray-900">{fullEmployee.sex || 'N/A'}</p>
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
                {(fullEmployee.emergency_contact_name || fullEmployee.emergency_contact_phone) && (
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
                        <p className="text-gray-900">{fullEmployee.emergency_contact_relationship || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-2">Phone Number</label>
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-gray-400" />
                          <p className="text-gray-900">{fullEmployee.emergency_contact_phone || 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Reset Password Button */}
                <div className="pt-6 border-t border-gray-200">
                  <button className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium flex items-center gap-2 transition-colors">
                    <Lock size={18} />
                    Reset Password
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'documents' && (
              <div>
                {documents.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No documents uploaded yet.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {documents.map((doc) => (
                      <a
                        key={doc.id}
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-4 border border-gray-200 rounded-lg hover:border-blue-400 hover:shadow-md transition-all"
                      >
                        <p className="font-medium text-gray-900 mb-1">{doc.document_name}</p>
                        <p className="text-sm text-gray-600">{doc.document_type}</p>
                      </a>
                    ))}
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
