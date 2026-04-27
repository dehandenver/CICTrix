import React, { useState, useEffect } from 'react';
import { Search, FileText, ChevronRight, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPositions.map((position) => (
                <button
                  key={position.id}
                  onClick={() => handlePositionClick(position)}
                  className="group bg-white rounded-lg border border-gray-200 p-6 hover:border-blue-400 hover:shadow-md transition-all text-left"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Users className="w-6 h-6 text-blue-600" />
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{position.name}</h3>
                  <div className="flex items-center gap-1 mb-3 text-gray-600">
                    <Users size={16} />
                    <span className="text-sm">{position.employee_count} employee{position.employee_count !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-500">
                    <div className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
                    </div>
                    <span className="text-sm">{position.department}</span>
                  </div>
                </button>
              ))}
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
