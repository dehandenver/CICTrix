import React, { useState, useEffect } from 'react';
import { Search, FileText, ChevronRight, Users, Briefcase, MapPin } from 'lucide-react';
import { supabase as supabaseClient } from '../../lib/supabase';

// Bypass auto-generated Supabase types resolving to `never`. Same escape hatch
// used elsewhere in the codebase.
const supabase = supabaseClient as any;
import EmployeeListByPosition from './components/EmployeeListByPosition';
import EmployeeDetailPage from './components/EmployeeDetailPage';

interface Position {
  id: string;
  name: string;
  department: string;
  employee_count: number;
  employees?: Employee[];
}

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
}

type ViewMode = 'directory' | 'position-list' | 'employee-detail';

export default function EmployeeDirectory() {
  const [viewMode, setViewMode] = useState<ViewMode>('directory');
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  useEffect(() => {
    console.log('✅ EmployeeDirectory component mounted');
    fetchPositions();
  }, []);

  const fetchPositions = async () => {
    try {
      setLoading(true);
      
      // For now, fetch only from hired applicants table (employees table doesn't exist yet)
      const { data: hiredApplicantsData, error: hireError } = await supabase
        .from('applicants')
        .select('position, office')
        .eq('status', 'Hired');

      console.log('🔍 Fetching hired applicants...');
      console.log('Hired applicants data:', hiredApplicantsData);
      console.log('Error:', hireError);

      if (hireError) throw hireError;

      // Group hired applicants by position
      const positionMap = new Map<string, Position>();
      
      (hiredApplicantsData || []).forEach((app) => {
        const key = `${app.position}-${app.office}`;
        if (!positionMap.has(key)) {
          positionMap.set(key, {
            id: key,
            name: app.position,
            department: app.office,
            employee_count: 0,
          });
        }
        const pos = positionMap.get(key)!;
        pos.employee_count += 1;
      });

      const posArray = Array.from(positionMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      console.log('📊 Positions found:', posArray);
      setPositions(posArray);
    } catch (error) {
      console.error('❌ Error fetching positions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePositionClick = async (position: Position) => {
    try {
      // Fetch hired applicants for this position
      const { data: hiredApplicants, error: appError } = await supabase
        .from('applicants')
        .select('id, first_name, last_name, email, contact_number, position, office, status, created_at')
        .eq('status', 'Hired')
        .eq('position', position.name)
        .eq('office', position.department);

      console.log('📋 Fetching position details:', position.name);
      console.log('Hired applicants:', hiredApplicants);
      console.log('Error:', appError);

      if (appError) throw appError;

      // Transform hired applicants to match Employee type
      const transformedApplicants: Employee[] = (hiredApplicants || []).map((app) => ({
        id: `applicant-${app.id}`,
        employee_number: `NEW-${app.id.substring(0, 8).toUpperCase()}`,
        first_name: app.first_name,
        last_name: app.last_name,
        position: app.position,
        department: app.office,
        status: 'Pending Onboarding',
        email: app.email,
        phone: app.contact_number,
        date_hired: app.created_at,
        employment_status: 'Probationary',
      }));

      setSelectedPosition({
        ...position,
        employees: transformedApplicants,
      });
      setViewMode('position-list');
    } catch (error) {
      console.error('❌ Error fetching employees:', error);
    }
  };

  const handleEmployeeClick = (employee: Employee) => {
    setSelectedEmployee(employee);
    setViewMode('employee-detail');
  };

  const handleBackToPositions = () => {
    setViewMode('directory');
    setSelectedPosition(null);
  };

  const handleBackToPositionList = () => {
    setViewMode('position-list');
    setSelectedEmployee(null);
  };

  const filteredPositions = positions.filter((pos) =>
    pos.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pos.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // View: Directory - Position Cards
  if (viewMode === 'directory') {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-blue-600 font-medium">RSP</span>
              <span className="text-gray-400">/</span>
              <span className="text-gray-700 font-medium">Employees</span>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Employee Directory</h1>
            <p className="text-gray-600">Browse employees by position • {filteredPositions.length} total positions</p>
          </div>

          {/* Search Bar */}
          <div className="mb-8">
            <div className="relative">
              <Search className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search positions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Top Right Button */}
          <div className="flex justify-end mb-8">
            <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium">
              <FileText size={20} />
              Bulk Document Request
            </button>
          </div>

          {/* Position Cards Grid */}
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-600">Loading positions...</p>
            </div>
          ) : filteredPositions.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No positions found matching your search.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full border-collapse text-left text-sm font-sans">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th scope="col" className="px-6 py-4 font-semibold text-[#040E6B]">Position Title</th>
                    <th scope="col" className="px-6 py-4 font-semibold text-[#040E6B]">Department / Division</th>
                    <th scope="col" className="px-6 py-4 font-semibold text-[#040E6B]">Employees Assigned</th>
                    <th scope="col" className="px-6 py-4 font-semibold text-[#040E6B]">Status</th>
                    <th scope="col" className="px-6 py-4 font-semibold text-[#040E6B] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPositions.map((position) => (
                    <tr
                      key={position.id}
                      onClick={() => handlePositionClick(position)}
                      className="group hover:bg-slate-50/80 transition-colors duration-150 cursor-pointer"
                    >
                      {/* Position Title */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-[#363EE8]/10 group-hover:text-[#363EE8]">
                            <Briefcase size={20} />
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 group-hover:text-[#363EE8] transition-colors">
                              {position.name}
                            </div>
                            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                              CICTRIX POSITION
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Department */}
                      <td className="px-6 py-4 text-slate-600 font-medium">
                        {position.department}
                      </td>

                      {/* Employee Count */}
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          <Users size={13} className="text-slate-500" />
                          {position.employee_count} employee{position.employee_count !== 1 ? 's' : ''}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handlePositionClick(position)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[#363EE8]/20 bg-[#363EE8]/5 px-3.5 py-2 text-xs font-bold text-[#363EE8] hover:bg-[#363EE8]/10 transition-all active:scale-[0.98]"
                          >
                            Open Directory
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // View: Position List
  if (viewMode === 'position-list' && selectedPosition) {
    return (
      <EmployeeListByPosition
        position={selectedPosition}
        onEmployeeClick={handleEmployeeClick}
        onBack={handleBackToPositions}
      />
    );
  }

  // View: Employee Detail
  if (viewMode === 'employee-detail' && selectedEmployee) {
    return (
      <EmployeeDetailPage
        employee={selectedEmployee}
        onBack={handleBackToPositionList}
        onRefresh={() => {
          // Refresh employee data if needed
        }}
      />
    );
  }

  return null;
}
