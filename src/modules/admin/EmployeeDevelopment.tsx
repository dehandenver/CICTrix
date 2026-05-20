import { useEffect, useMemo, useState } from 'react';
import { BarChart2, BookOpen, Calendar, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Eye, Filter, Search } from 'lucide-react';
import { getAllEmployees, type Employee } from '../../lib/api/employees';
import { TrainingEvaluationReport } from './components/TrainingEvaluationReport';

type EmployeeRecord = {
  id: string;
  name: string;
  initials: string;
  position: string;
  department: string;
  totalSeminars: number;
};

/** Derive 2-letter initials from a full_name string. */
const getInitials = (name: string): string => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const mockSeminarsPool = [
  { id: 1, title: 'Leadership Development Program', instructor: 'Dr. Maria Santos', date: 'Feb 5-9, 2025', duration: '40 hours', status: 'Completed', evaluationAvailable: true },
  { id: 2, title: 'Digital Transformation Seminar', instructor: 'Mr. Roberto Cruz', date: 'Feb 20-21, 2025', duration: '16 hours', status: 'Upcoming', evaluationAvailable: false },
  { id: 3, title: 'Project Management Fundamentals', instructor: 'Engr. Carlos Mendoza', date: 'Jan 15-19, 2025', duration: '40 hours', status: 'Completed', evaluationAvailable: true },
  { id: 4, title: 'Data Privacy & Cyber Security', instructor: 'Mr. Alex Villanueva', date: 'Mar 10-11, 2025', duration: '16 hours', status: 'Upcoming', evaluationAvailable: false },
  { id: 5, title: 'Advanced Excel & Data Analysis', instructor: 'Ms. Clara Reyes', date: 'Nov 12-14, 2024', duration: '24 hours', status: 'Completed', evaluationAvailable: true },
  { id: 6, title: 'Effective Communication Skills', instructor: 'Dr. Patricia Lee', date: 'Oct 5-6, 2024', duration: '16 hours', status: 'Completed', evaluationAvailable: true },
  { id: 7, title: 'Strategic Planning Workshop', instructor: 'Mr. David Chua', date: 'Aug 20-22, 2024', duration: '24 hours', status: 'Completed', evaluationAvailable: true },
  { id: 8, title: 'Basic First Aid & Disaster Preparedness', instructor: 'Red Cross PH', date: 'Jul 15, 2024', duration: '8 hours', status: 'Completed', evaluationAvailable: false },
  { id: 9, title: 'Public Service Ethics and Values', instructor: 'Atty. Mark Reyes', date: 'Dec 1-2, 2024', duration: '16 hours', status: 'Completed', evaluationAvailable: true },
  { id: 10, title: 'Agile Methodology Fundamentals', instructor: 'Engr. Sarah Gomez', date: 'Apr 10-12, 2025', duration: '24 hours', status: 'Upcoming', evaluationAvailable: false },
];

const getMockSeminars = (employeeId: string) => {
  let hash = 0;
  for (let i = 0; i < employeeId.length; i++) {
    hash = employeeId.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);

  const numSeminars = (hash % 4) + 1; // 1 to 4 seminars
  const seminars = [];
  for (let i = 0; i < numSeminars; i++) {
    const index = (hash + (i * 7)) % mockSeminarsPool.length;
    seminars.push(mockSeminarsPool[index]);
  }
  
  // Deduplicate seminars based on ID just in case
  const uniqueSeminars = Array.from(new Map(seminars.map(s => [s.id, s])).values());
  return uniqueSeminars.sort((a, b) => b.id - a.id);
};

const toEmployeeRecord = (emp: Employee): EmployeeRecord => {
  const seminars = getMockSeminars(emp.id);
  return {
    id: emp.id,
    name: emp.full_name ?? 'Unnamed',
    initials: getInitials(emp.full_name ?? ''),
    position: emp.current_position ?? 'Unassigned Position',
    department: emp.department ?? emp.current_department ?? 'Unassigned Department',
    totalSeminars: seminars.length,
  };
};

const employeesData: EmployeeRecord[] = [
  { id: '1', name: 'Juan dela Cruz', initials: 'JdC', position: 'IT Manager', department: 'IT Department', totalSeminars: getMockSeminars('1').length },
  { id: '2', name: 'Maria Reyes', initials: 'MR', position: 'Finance Manager', department: 'Finance Department', totalSeminars: getMockSeminars('2').length },
  { id: '3', name: 'Carlos Santos', initials: 'CS', position: 'HR Supervisor', department: 'HR Department', totalSeminars: getMockSeminars('3').length },
  { id: '4', name: 'Ana Garcia', initials: 'AG', position: 'Operations Manager', department: 'Operations', totalSeminars: getMockSeminars('4').length },
  { id: '5', name: 'Roberto Cruz', initials: 'RC', position: 'Admin Officer III', department: 'Admin Department', totalSeminars: getMockSeminars('5').length },
  { id: '6', name: 'Elena Mercado', initials: 'EM', position: 'IT Supervisor', department: 'IT Department', totalSeminars: getMockSeminars('6').length },
  { id: '7', name: 'Diego Fernandez', initials: 'DF', position: 'Budget Officer II', department: 'Finance Department', totalSeminars: getMockSeminars('7').length },
  { id: '8', name: 'Sofia Martinez', initials: 'SM', position: 'HR Officer II', department: 'HR Department', totalSeminars: getMockSeminars('8').length },
  { id: '9', name: 'Miguel Torres', initials: 'MT', position: 'Operations Supervisor', department: 'Operations', totalSeminars: getMockSeminars('9').length },
  { id: '10', name: 'Carmen Lopez', initials: 'CL', position: 'Legal Officer I', department: 'Legal Department', totalSeminars: getMockSeminars('10').length },
];

const EmployeeDevelopmentDetail = ({ employee, onBack }: { employee: EmployeeRecord; onBack: () => void }) => {
  const [selectedSeminar, setSelectedSeminar] = useState<any | null>(null);
  const employeeSeminars = getMockSeminars(employee.id);

  if (selectedSeminar) {
    return <TrainingEvaluationReport employee={employee} seminar={selectedSeminar} onBack={() => setSelectedSeminar(null)} />;
  }

  return (
    <div className="p-6 md:p-8 pt-24 bg-gray-50 min-h-screen flex flex-col space-y-6">
      <div className="flex items-start">
        <button 
          onClick={onBack}
          type="button" 
          className="mr-4 mt-1 text-gray-500 hover:bg-gray-200 p-2 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{employee.name}</h1>
          <p className="text-sm text-gray-500 mt-1">{employee.position} &bull; {employee.department}</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mt-4">
        <div className="p-6 flex items-center justify-between border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Attended Seminars & Trainings</h2>
          <span className="text-sm text-gray-500">Total: {employeeSeminars.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="bg-gray-50/50 border-b border-gray-200">
              <tr>
                <th className="py-4 px-6 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Seminar Title</th>
                <th className="py-4 px-6 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Instructor</th>
                <th className="py-4 px-6 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="py-4 px-6 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Duration</th>
                <th className="py-4 px-6 text-[11px] font-bold text-gray-500 uppercase tracking-wider text-center">Status</th>
                <th className="py-4 px-6 text-[11px] font-bold text-gray-500 uppercase tracking-wider text-center">Evaluation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employeeSeminars.map((seminar) => (
                <tr key={seminar.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-4 px-6 text-sm">
                    <div className="flex items-center space-x-3 text-gray-900 font-medium">
                      <BookOpen className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>{seminar.title}</span>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-sm text-gray-600">{seminar.instructor}</td>
                  <td className="py-4 px-6 text-sm text-gray-600">{seminar.date}</td>
                  <td className="py-4 px-6 text-sm text-gray-600">{seminar.duration}</td>
                  <td className="py-4 px-6 text-sm text-center">
                    {seminar.status === 'Completed' ? (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Completed</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-medium">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Upcoming</span>
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-sm flex justify-center">
                    {seminar.evaluationAvailable ? (
                      <button 
                        onClick={() => setSelectedSeminar(seminar)}
                        className="flex items-center space-x-1.5 px-3 py-1.5 border border-blue-200 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors" 
                        type="button"
                      >
                        <BarChart2 className="w-4 h-4" />
                        <span>View Report</span>
                      </button>
                    ) : (
                      <span className="text-gray-400 italic text-sm">Not available</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const EmployeeDevelopment = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All Departments');
  const [dbEmployees, setDbEmployees] = useState<EmployeeRecord[] | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getAllEmployees({ status: 'Active' });
      if (cancelled) return;
      if (result.success && Array.isArray(result.data) && result.data.length > 0) {
        setDbEmployees((result.data as Employee[]).map(toEmployeeRecord));
      } else {
        // DB empty or error — fall back to hardcoded demo data.
        setDbEmployees(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Real data when present; hardcoded demo array as fallback for empty DB.
  const sourceEmployees: EmployeeRecord[] =
    dbEmployees && dbEmployees.length > 0 ? dbEmployees : employeesData;

  const departments = useMemo(
    () => ['All Departments', ...Array.from(new Set(sourceEmployees.map((employee) => employee.department)))],
    [sourceEmployees]
  );

  const filteredEmployees = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return sourceEmployees.filter((employee) => {
      const matchesSearch =
        employee.name.toLowerCase().includes(query) ||
        employee.position.toLowerCase().includes(query) ||
        employee.department.toLowerCase().includes(query);
      const matchesDepartment =
        departmentFilter === 'All Departments' || employee.department === departmentFilter;
      return matchesSearch && matchesDepartment;
    });
  }, [searchQuery, departmentFilter, sourceEmployees]);

  if (selectedEmployee) {
    return <EmployeeDevelopmentDetail employee={selectedEmployee} onBack={() => setSelectedEmployee(null)} />;
  }

  return (
    <div className="p-6 md:p-8 pt-24 bg-gray-50 min-h-screen flex flex-col space-y-6">
      <div className="flex items-start">
        <button type="button" className="mr-4 mt-1 text-gray-500 hover:bg-gray-200 p-2 rounded-lg transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employee Development</h1>
          <p className="text-sm text-gray-500 mt-1">View employee training history and evaluation reports</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center space-x-4 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search employees..."
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="relative">
            <Filter className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              className="pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 appearance-none bg-white focus:outline-none focus:border-blue-500"
            >
              {departments.map((department) => (
                <option key={department}>{department}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <div className="relative">
          <select className="pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 appearance-none bg-white focus:outline-none focus:border-blue-500">
            <option>10 per page</option>
          </select>
          <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-white border-b border-gray-200">
            <tr>
              <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Employee Name</th>
              <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Position</th>
              <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Department</th>
              <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Total Seminars</th>
              <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredEmployees.map((employee) => (
              <tr key={employee.id} className="hover:bg-gray-50 transition-colors">
                <td className="py-4 px-6 text-sm text-gray-700">
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold mr-3 flex-shrink-0">
                      {employee.initials}
                    </div>
                    <span className="font-semibold text-gray-900">{employee.name}</span>
                  </div>
                </td>
                <td className="py-4 px-6 text-sm text-gray-700">{employee.position}</td>
                <td className="py-4 px-6 text-sm text-gray-700">{employee.department}</td>
                <td className="py-4 px-6 text-sm text-gray-700">
                  <div className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold">
                    {employee.totalSeminars}
                  </div>
                </td>
                <td className="py-4 px-6 text-sm text-gray-700">
                  <button 
                    onClick={() => setSelectedEmployee(employee)}
                    className="flex items-center space-x-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors bg-white" 
                    type="button"
                  >
                    <Eye className="w-4 h-4 text-gray-500" />
                    <span>View Information</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between shadow-sm mt-2">
        <span className="text-sm text-gray-500">Showing 1 to 10 of 15 employees</span>
        <div className="flex items-center space-x-2">
          <button className="flex items-center px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 bg-white" type="button">
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </button>
          <button className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center text-sm font-medium" type="button">1</button>
          <button className="w-8 h-8 rounded-lg text-gray-700 hover:bg-gray-100 flex items-center justify-center text-sm font-medium" type="button">2</button>
          <button className="flex items-center px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 bg-white" type="button">
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
};
