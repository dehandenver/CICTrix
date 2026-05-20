import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Position {
  id: string;
  name: string;
  department: string;
  employee_count: number;
  employees?: Employee[];
}

interface Employee {
  id: string;
  employee_id: string;
  full_name: string;
  current_position: string;
  department: string;
  status: string;
  email: string;
  mobile_number: string;
  hire_date: string;
  photo_url?: string;
}

/** Derive 2-letter initials from a full_name string. */
const getInitials = (name: string): string => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

interface Props {
  position: Position;
  onEmployeeClick: (employee: Employee) => void;
  onBack: () => void;
}

export default function EmployeeListByPosition({ position, onEmployeeClick, onBack }: Props) {
  const [sortBy, setSortBy] = useState<'name' | 'number' | 'status'>('name');

  const sortedEmployees = [...(position.employees || [])].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return (a.full_name ?? '').localeCompare(b.full_name ?? '');
      case 'number':
        return (a.employee_id ?? '').localeCompare(b.employee_id ?? '');
      case 'status':
        return (a.status ?? '').localeCompare(b.status ?? '');
      default:
        return 0;
    }
  });

  const getStatusColor = (status: string, id: string) => {
    // Newly hired applicants get orange/amber status
    if (id.startsWith('applicant-')) {
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
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={onBack}
              className="text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium"
            >
              <ChevronLeft size={20} />
              Employees
            </button>
            <span className="text-gray-400">/</span>
            <span className="text-gray-700">{position.name}</span>
          </div>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">{position.name}</h1>
              <p className="text-gray-600">{position.employee_count} employees</p>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th
                  onClick={() => setSortBy('name')}
                  className="px-6 py-4 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                >
                  Employee Name
                </th>
                <th
                  onClick={() => setSortBy('number')}
                  className="px-6 py-4 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                >
                  Employee Number
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                  Position
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                  Department
                </th>
                <th
                  onClick={() => setSortBy('status')}
                  className="px-6 py-4 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-100"
                >
                  Status
                </th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedEmployees.map((employee) => (
                <tr
                  key={employee.id}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => onEmployeeClick(employee)}
                >
                  {/* Employee Name with Avatar */}
                  <td className="px-6 py-4 text-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-semibold text-sm">
                          {getInitials(employee.full_name)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {employee.full_name}
                        </p>
                        <p className="text-sm text-gray-500">{employee.email}</p>
                      </div>
                    </div>
                  </td>

                  {/* Employee ID */}
                  <td className="px-6 py-4 text-sm text-gray-900 font-mono">
                    {employee.employee_id}
                  </td>

                  {/* Position */}
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {employee.current_position}
                  </td>

                  {/* Department */}
                  <td className="px-6 py-4 text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                      <div className="w-3 h-3 rounded-full bg-blue-600" />
                      {employee.department}
                    </div>
                  </td>

                  {/* Status Badge */}
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(employee.status, employee.id)}`}>
                      {employee.id.startsWith('applicant-') ? 'Pending Onboarding' : employee.status}
                    </span>
                  </td>

                  {/* Action Arrow */}
                  <td className="px-6 py-4 text-right">
                    <ChevronRight className="w-5 h-5 text-gray-400 inline-block" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {sortedEmployees.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">No employees found for this position.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
