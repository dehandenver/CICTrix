import { useMemo, useState, useEffect } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Eye, Filter, Search, Award, Printer, BookOpen, Mail, Phone, Building2 } from 'lucide-react';
import { supabase as supabaseClient } from '../../lib/supabase';

const supabase = supabaseClient as any;

type EmployeeRecord = {
  id: string;
  name: string;
  initials: string;
  position: string;
  department: string;
  totalSeminars: number;
};

const employeesData: EmployeeRecord[] = [
  { id: '1', name: 'Juan dela Cruz', initials: 'JdC', position: 'IT Manager', department: 'IT Department', totalSeminars: 3 },
  { id: '2', name: 'Maria Reyes', initials: 'MR', position: 'Finance Manager', department: 'Finance Department', totalSeminars: 2 },
  { id: '3', name: 'Carlos Santos', initials: 'CS', position: 'HR Supervisor', department: 'HR Department', totalSeminars: 3 },
  { id: '4', name: 'Ana Garcia', initials: 'AG', position: 'Operations Manager', department: 'Operations', totalSeminars: 2 },
  { id: '5', name: 'Roberto Cruz', initials: 'RC', position: 'Admin Officer III', department: 'Admin Department', totalSeminars: 2 },
  { id: '6', name: 'Elena Mercado', initials: 'EM', position: 'IT Supervisor', department: 'IT Department', totalSeminars: 2 },
  { id: '7', name: 'Diego Fernandez', initials: 'DF', position: 'Budget Officer II', department: 'Finance Department', totalSeminars: 1 },
  { id: '8', name: 'Sofia Martinez', initials: 'SM', position: 'HR Officer II', department: 'HR Department', totalSeminars: 1 },
  { id: '9', name: 'Miguel Torres', initials: 'MT', position: 'Operations Supervisor', department: 'Operations', totalSeminars: 2 },
  { id: '10', name: 'Carmen Lopez', initials: 'CL', position: 'Legal Officer I', department: 'Legal Department', totalSeminars: 1 },
  { id: '11', name: 'A-jay Buenjemia', initials: 'AB', position: 'Information Technology Specialist', department: 'Information Technology', totalSeminars: 2 },
];

export const EmployeeDevelopment = () => {
  const [viewMode, setViewMode] = useState<'list' | 'profile' | 'report'>('list');
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All Departments');
  const [employees, setEmployees] = useState<EmployeeRecord[]>(employeesData);

  useEffect(() => {
    const loadHiredApplicants = async () => {
      try {
        const { data, error } = await supabase
          .from('applicants')
          .select('id, first_name, last_name, position, office')
          .eq('status', 'Hired');
          
        if (error) throw error;
        
        if (data && data.length > 0) {
          const loaded = data.map((d: any) => ({
            id: `supabase-${d.id}`,
            name: `${d.first_name} ${d.last_name}`,
            initials: `${d.first_name[0] || 'E'}${d.last_name[0] || 'M'}`,
            position: d.position || 'Employee',
            department: d.office || 'Unassigned',
            totalSeminars: 2,
          }));
          
          setEmployees((prev) => {
            const existingNames = new Set(prev.map(p => p.name.toLowerCase()));
            const filteredLoaded = loaded.filter((l: any) => !existingNames.has(l.name.toLowerCase()));
            return [...prev, ...filteredLoaded];
          });
        }
      } catch (err) {
        console.warn('loadHiredApplicants: Bypassed db load locally', err);
      }
    };
    
    void loadHiredApplicants();
  }, []);

  const departments = useMemo(
    () => ['All Departments', ...Array.from(new Set(employees.map((employee) => employee.department)))],
    [employees]
  );

  const filteredEmployees = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return employees.filter((employee) => {
      const matchesSearch =
        employee.name.toLowerCase().includes(query) ||
        employee.position.toLowerCase().includes(query) ||
        employee.department.toLowerCase().includes(query);
      const matchesDepartment =
        departmentFilter === 'All Departments' || employee.department === departmentFilter;
      return matchesSearch && matchesDepartment;
    });
  }, [employees, searchQuery, departmentFilter]);

  const handleViewProfile = (employee: EmployeeRecord) => {
    setSelectedEmployee(employee);
    setViewMode('profile');
  };

  if (viewMode === 'report' && selectedEmployee) {
    return (
      <TrainingEvaluationReport
        employee={selectedEmployee}
        onBack={() => setViewMode('profile')}
      />
    );
  }

  if (viewMode === 'profile' && selectedEmployee) {
    return (
      <EmployeeProfileView
        employee={selectedEmployee}
        onBack={() => setViewMode('list')}
        onViewReport={() => setViewMode('report')}
      />
    );
  }

  return (
    <div className="p-6 md:p-8 pt-24 bg-gray-50 min-h-screen flex flex-col space-y-6">
      <div className="flex items-start">
        <button
          type="button"
          onClick={() => setViewMode('list')}
          className="mr-4 mt-1 text-gray-500 hover:bg-gray-200 p-2 rounded-lg transition-colors"
        >
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
              className="pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 appearance-none bg-white focus:outline-none focus:border-blue-500 border-r-0"
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
              <th className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
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
                <td className="py-4 px-6 text-sm text-gray-700 text-right">
                  <button
                    onClick={() => handleViewProfile(employee)}
                    className="inline-flex items-center space-x-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors bg-white shadow-sm"
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
        <span className="text-sm text-gray-500">Showing 1 to {filteredEmployees.length} of {employees.length} employees</span>
        <div className="flex items-center space-x-2">
          <button className="flex items-center px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 bg-white" type="button">
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </button>
          <button className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center text-sm font-medium" type="button">1</button>
          <button className="flex items-center px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 bg-white" type="button">
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
};

const EmployeeProfileView = ({ employee, onBack, onViewReport }: { employee: EmployeeRecord; onBack: () => void; onViewReport: () => void }) => {
  return (
    <div className="p-6 md:p-8 pt-24 bg-gray-50 min-h-screen">
      <div className="flex items-start mb-6">
        <button
          type="button"
          onClick={onBack}
          className="mr-4 text-gray-500 hover:bg-gray-200 p-2 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{employee.name}</h1>
          <p className="text-sm text-gray-500 mt-1">{employee.position} • {employee.department}</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden p-6">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-6">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Award className="w-5 h-5 text-blue-600" />
            <span>Attended Seminars & Trainings</span>
          </h2>
          <span className="text-sm text-gray-500 font-semibold">Total: 2</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-slate-50 text-slate-500 font-bold uppercase text-[11px] tracking-wider">
                <th className="py-3.5 px-4">Seminar Title</th>
                <th className="py-3.5 px-4">Instructor</th>
                <th className="py-3.5 px-4">Date</th>
                <th className="py-3.5 px-4">Duration</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Evaluation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr className="hover:bg-gray-50/50">
                <td className="py-4 px-4 font-semibold text-gray-900 flex items-center gap-3">
                  <BookOpen className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <span>Basic First Aid & Disaster Preparedness</span>
                </td>
                <td className="py-4 px-4 text-slate-600">Red Cross PH</td>
                <td className="py-4 px-4 text-slate-600">Jul 15, 2024</td>
                <td className="py-4 px-4 text-slate-600">8 hours</td>
                <td className="py-4 px-4">
                  <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full text-xs font-semibold inline-flex items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5" />
                    Completed
                  </span>
                </td>
                <td className="py-4 px-4 text-right text-gray-400 italic text-xs">Not available</td>
              </tr>
              <tr className="hover:bg-gray-50/50">
                <td className="py-4 px-4 font-semibold text-gray-900 flex items-center gap-3">
                  <BookOpen className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <span>Advanced Excel & Data Analysis</span>
                </td>
                <td className="py-4 px-4 text-slate-600">Ms. Clara Reyes</td>
                <td className="py-4 px-4 text-slate-600">Nov 12-14, 2024</td>
                <td className="py-4 px-4 text-slate-600">24 hours</td>
                <td className="py-4 px-4">
                  <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full text-xs font-semibold inline-flex items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5" />
                    Completed
                  </span>
                </td>
                <td className="py-4 px-4 text-right">
                  <button
                    onClick={onViewReport}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#EBF0FF] hover:bg-[#D7E2FF] text-[#363EE8] rounded-lg text-xs font-bold transition-all shadow-sm border border-[#C5D4FF]"
                    type="button"
                  >
                    <Award className="w-3.5 h-3.5" />
                    <span>View Report</span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const TrainingEvaluationReport = ({ employee, onBack }: { employee: EmployeeRecord; onBack: () => void }) => {
  return (
    <div className="p-6 md:p-8 pt-24 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <button
            type="button"
            onClick={onBack}
            className="mr-4 text-gray-500 hover:bg-gray-200 p-2 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Training Evaluation Report</h1>
            <p className="text-sm text-gray-500 mt-1">{employee.name} — Advanced Excel & Data Analysis</p>
          </div>
        </div>

        <button
          onClick={() => window.print()}
          className="flex items-center space-x-2 bg-[#363EE8] hover:bg-[#363EE8]/90 text-white px-4 py-2.5 rounded-lg font-bold shadow-sm transition-all text-xs"
          type="button"
        >
          <Printer className="w-4 h-4" />
          <span>Print Report</span>
        </button>
      </div>

      <div className="bg-white shadow-xl rounded-2xl max-w-4xl mx-auto p-8 border border-slate-200 mt-6 printable-report">
        
        {/* Philippines Republic & City Header */}
        <div className="flex flex-col items-center text-center border-b-2 border-[#363EE8] pb-6 mb-6">
          <div className="w-16 h-16 rounded-full bg-[#363EE8] flex items-center justify-center text-white font-black text-2xl mb-2 shadow-sm border border-[#1E25B6]">
            IL
          </div>
          <h2 className="text-md font-bold text-slate-800 tracking-wide uppercase">Iloilo City</h2>
          <p className="text-xs text-slate-500">Republic of the Philippines</p>
          
          <div className="w-full mt-4 border-t border-slate-100 pt-4">
            <h3 className="text-sm font-bold text-[#040E6B] tracking-wider uppercase">
              Office of the City Human Resource Management Officer
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Ground Floor, Iloilo City Hall, Plaza Libertad, Iloilo City, 5000 Philippines
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
              Tel. No: 333-11-11 Loc. #71 | Email: add_ica.hrmo@gmail.com
            </p>
          </div>
        </div>

        {/* Evaluation Summary Document Title */}
        <div className="text-center mb-8">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Office of the City Human Resource Management Officer
          </h3>
          <h1 className="text-2xl font-black text-[#040E6B] mt-1 tracking-tight">
            Evaluation Summary
          </h1>
        </div>

        {/* Training Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 border border-slate-200/60 rounded-xl p-5 mb-8 text-sm">
          <div className="space-y-2.5">
            <div className="text-slate-600">
              <span className="font-bold text-slate-400 text-xs uppercase tracking-wider block">Training Program</span>
              <span className="font-bold text-[#040E6B] text-base">ADVANCED EXCEL & DATA ANALYSIS</span>
            </div>
            <div className="text-slate-600">
              <span className="font-bold text-slate-400 text-xs uppercase tracking-wider block">Date</span>
              <span className="font-bold text-slate-800">Nov 12-14, 2024</span>
            </div>
            <div className="text-slate-600">
              <span className="font-bold text-slate-400 text-xs uppercase tracking-wider block">Venue</span>
              <span className="font-semibold text-slate-800">2nd Floor LEDIP Conference Room, Iloilo City Hall</span>
            </div>
          </div>
          <div className="space-y-2.5 md:border-l md:border-slate-200 md:pl-6">
            <div className="text-slate-600">
              <span className="font-bold text-slate-400 text-xs uppercase tracking-wider block">Total Participants</span>
              <span className="font-bold text-slate-800 text-lg">33</span>
            </div>
            <div className="text-slate-600">
              <span className="font-bold text-slate-400 text-xs uppercase tracking-wider block">Total Respondents</span>
              <span className="font-bold text-slate-800 text-lg">29</span>
            </div>
            <div className="text-slate-600">
              <span className="font-bold text-slate-400 text-xs uppercase tracking-wider block">Evaluation Scale</span>
              <span className="text-[10px] text-[#040E6B] font-bold bg-white border border-slate-200 rounded-lg px-2.5 py-1 mt-1 inline-block shadow-sm">
                5 - Strongly Agree | 4 - Agree | 3 - Neutral | 2 - Disagree | 1 - Strongly Disagree
              </span>
            </div>
          </div>
        </div>

        {/* Section A */}
        <div className="mb-10">
          <h2 className="text-lg font-bold text-[#040E6B] border-b border-slate-200 pb-2 mb-4">
            A. CONTENT & OBJECTIVES
          </h2>
          <div className="overflow-x-auto border border-slate-100 rounded-xl mb-6 shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
                  <th className="p-3 w-1/2">Question</th>
                  <th className="p-3 text-center">5</th>
                  <th className="p-3 text-center">4</th>
                  <th className="p-3 text-center">3</th>
                  <th className="p-3 text-center">2</th>
                  <th className="p-3 text-center">1</th>
                  <th className="p-3 text-center">Total</th>
                  <th className="p-3 text-center text-[#363EE8]">Average</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {[
                  "1. The content and objectives of the activity is useful and interesting.",
                  "2. The objectives of the activity were clearly identify and met.",
                  "3. The methodology (lecture, presentation, etc.) used were appropriate and effective for learning and understanding the topic.",
                  "4. The activity is useful to my work and the organization.",
                  "5. The activity helped me gain skills I needed to address a specific performance gap.",
                  "6. Topics discussed in the activity met my expectations."
                ].map((q, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="p-3 font-medium text-slate-800">{q}</td>
                    <td className="p-3 text-center">17</td>
                    <td className="p-3 text-center">9</td>
                    <td className="p-3 text-center">1</td>
                    <td className="p-3 text-center">1</td>
                    <td className="p-3 text-center">1</td>
                    <td className="p-3 text-center">29</td>
                    <td className="p-3 text-center font-bold text-[#363EE8]">4.38</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Chart A */}
          <div className="grid grid-cols-1 gap-2 max-w-xl mx-auto">
            <div className="space-y-2.5 p-5 bg-slate-50 border border-slate-200/60 rounded-xl shadow-sm">
              <p className="text-xs font-bold text-[#040E6B] uppercase tracking-wider mb-4 text-center">
                Content & Objectives
              </p>
              {[6, 5, 4, 3, 2, 1].map(num => (
                <div key={num} className="flex items-center gap-4">
                  <span className="text-xs font-bold text-slate-500 w-4 text-right">{num}.</span>
                  <div className="flex-1 bg-slate-200/70 h-5.5 rounded-full overflow-hidden relative shadow-inner">
                    <div className="bg-[#363EE8] h-full rounded-full flex items-center justify-end pr-4 transition-all" style={{ width: '87.6%' }}>
                      <span className="text-[10px] font-bold text-white">4.38</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Section B */}
        <div className="mb-10">
          <h2 className="text-lg font-bold text-[#040E6B] border-b border-slate-200 pb-2 mb-1">
            B. RESOURCE PERSON
          </h2>
          <p className="text-xs font-extrabold text-[#363EE8] tracking-wide mb-4">
            MS. MICHELL MARTH ALEJANDRIA DELA CRUZ
          </p>
          <div className="overflow-x-auto border border-slate-100 rounded-xl mb-6 shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
                  <th className="p-3 w-1/2">Question</th>
                  <th className="p-3 text-center">5</th>
                  <th className="p-3 text-center">4</th>
                  <th className="p-3 text-center">3</th>
                  <th className="p-3 text-center">2</th>
                  <th className="p-3 text-center">1</th>
                  <th className="p-3 text-center">Total</th>
                  <th className="p-3 text-center text-[#363EE8]">Average</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {[
                  "1. The resource person displayed an in-depth knowledge of the topic.",
                  "2. The resource person was able to build rapport with the participants.",
                  "3. Resource person clearly articulated the concepts in the activity.",
                  "4. The resource person was able to facilitate the sessions effectively."
                ].map((q, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="p-3 font-medium text-slate-800">{q}</td>
                    <td className="p-3 text-center">17</td>
                    <td className="p-3 text-center">9</td>
                    <td className="p-3 text-center">1</td>
                    <td className="p-3 text-center">1</td>
                    <td className="p-3 text-center">1</td>
                    <td className="p-3 text-center">29</td>
                    <td className="p-3 text-center font-bold text-[#363EE8]">4.38</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Chart B */}
          <div className="grid grid-cols-1 gap-2 max-w-xl mx-auto">
            <div className="space-y-2.5 p-5 bg-slate-50 border border-slate-200/60 rounded-xl shadow-sm">
              <p className="text-xs font-bold text-[#040E6B] uppercase tracking-wider text-center">
                Resource Person
              </p>
              <p className="text-[10px] font-bold text-[#363EE8] uppercase tracking-widest text-center mb-4">
                MS. MICHELL MARTH ALEJANDRIA DELA CRUZ
              </p>
              {[4, 3, 2, 1].map(num => (
                <div key={num} className="flex items-center gap-4">
                  <span className="text-xs font-bold text-slate-500 w-4 text-right">{num}.</span>
                  <div className="flex-1 bg-slate-200/70 h-5.5 rounded-full overflow-hidden relative shadow-inner">
                    <div className="bg-[#363EE8] h-full rounded-full flex items-center justify-end pr-4 transition-all" style={{ width: '87.6%' }}>
                      <span className="text-[10px] font-bold text-white">4.38</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Section C */}
        <div className="mb-10">
          <h2 className="text-lg font-bold text-[#040E6B] border-b border-slate-200 pb-2 mb-1">
            C. RESOURCE PERSON
          </h2>
          <p className="text-xs font-extrabold text-[#363EE8] tracking-wide mb-4">
            MS. MICHELL MARTH ALEJANDRIA DELA CRUZ
          </p>
          <div className="overflow-x-auto border border-slate-100 rounded-xl mb-6 shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
                  <th className="p-3 w-1/2">Question</th>
                  <th className="p-3 text-center">5</th>
                  <th className="p-3 text-center">4</th>
                  <th className="p-3 text-center">3</th>
                  <th className="p-3 text-center">2</th>
                  <th className="p-3 text-center">1</th>
                  <th className="p-3 text-center">Total</th>
                  <th className="p-3 text-center text-[#363EE8]">Average</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {[
                  "1. The resource person displayed an in-depth knowledge of the topic.",
                  "2. The resource person was able to build rapport with the participants.",
                  "3. Resource person clearly articulated the concepts in the activity.",
                  "4. The resource person was able to facilitate the sessions effectively."
                ].map((q, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="p-3 font-medium text-slate-800">{q}</td>
                    <td className="p-3 text-center">17</td>
                    <td className="p-3 text-center">9</td>
                    <td className="p-3 text-center">1</td>
                    <td className="p-3 text-center">1</td>
                    <td className="p-3 text-center">1</td>
                    <td className="p-3 text-center">29</td>
                    <td className="p-3 text-center font-bold text-[#363EE8]">4.38</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Chart C */}
          <div className="grid grid-cols-1 gap-2 max-w-xl mx-auto">
            <div className="space-y-2.5 p-5 bg-slate-50 border border-slate-200/60 rounded-xl shadow-sm">
              <p className="text-xs font-bold text-[#040E6B] uppercase tracking-wider text-center">
                Resource Person
              </p>
              <p className="text-[10px] font-bold text-[#363EE8] uppercase tracking-widest text-center mb-4">
                MS. MICHELL MARTH ALEJANDRIA DELA CRUZ
              </p>
              {[4, 3, 2, 1].map(num => (
                <div key={num} className="flex items-center gap-4">
                  <span className="text-xs font-bold text-slate-500 w-4 text-right">{num}.</span>
                  <div className="flex-1 bg-slate-200/70 h-5.5 rounded-full overflow-hidden relative shadow-inner">
                    <div className="bg-[#363EE8] h-full rounded-full flex items-center justify-end pr-4 transition-all" style={{ width: '87.6%' }}>
                      <span className="text-[10px] font-bold text-white">4.38</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Section D */}
        <div className="mb-10">
          <h2 className="text-lg font-bold text-[#040E6B] border-b border-slate-200 pb-2 mb-4">
            D. PROGRAM ADMINISTRATION
          </h2>
          <div className="overflow-x-auto border border-slate-100 rounded-xl mb-6 shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
                  <th className="p-3 w-1/2">Question</th>
                  <th className="p-3 text-center">5</th>
                  <th className="p-3 text-center">4</th>
                  <th className="p-3 text-center">3</th>
                  <th className="p-3 text-center">2</th>
                  <th className="p-3 text-center">1</th>
                  <th className="p-3 text-center">Total</th>
                  <th className="p-3 text-center text-[#363EE8]">Average</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {[
                  "1. The session delivered the information I expected to receive.",
                  "2. The duration of the activity was just right to tackle all the topics in an average pacing.",
                  "3. The facilitators are prompt and always willing to help the participants.",
                  "4. The quality of the physical/virtual amenities are excellent."
                ].map((q, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="p-3 font-medium text-slate-800">{q}</td>
                    <td className="p-3 text-center">17</td>
                    <td className="p-3 text-center">9</td>
                    <td className="p-3 text-center">1</td>
                    <td className="p-3 text-center">1</td>
                    <td className="p-3 text-center">1</td>
                    <td className="p-3 text-center">29</td>
                    <td className="p-3 text-center font-bold text-[#363EE8]">4.38</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Chart D */}
          <div className="grid grid-cols-1 gap-2 max-w-xl mx-auto">
            <div className="space-y-2.5 p-5 bg-slate-50 border border-slate-200/60 rounded-xl shadow-sm">
              <p className="text-xs font-bold text-[#040E6B] uppercase tracking-wider text-center mb-4">
                Program Administration
              </p>
              {[4, 3, 2, 1].map(num => (
                <div key={num} className="flex items-center gap-4">
                  <span className="text-xs font-bold text-slate-500 w-4 text-right">{num}.</span>
                  <div className="flex-1 bg-slate-200/70 h-5.5 rounded-full overflow-hidden relative shadow-inner">
                    <div className="bg-[#363EE8] h-full rounded-full flex items-center justify-end pr-4 transition-all" style={{ width: '87.6%' }}>
                      <span className="text-[10px] font-bold text-white">4.38</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Narrative Responses */}
        <div className="border-t-2 border-slate-100 pt-8 mt-8">
          <h2 className="text-lg font-bold text-[#040E6B] mb-6">
            Narrative Responses
          </h2>
          <div className="space-y-5">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 shadow-sm">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                What aspects of the training did you find most valuable?
              </h3>
              <p className="text-sm font-semibold text-slate-800 italic leading-relaxed pl-3 border-l-4 border-[#363EE8]">
                "The resource persons were very knowledgeable and approachable."
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 shadow-sm">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                What suggestions do you have for improving future training programs?
              </h3>
              <p className="text-sm font-semibold text-slate-800 italic leading-relaxed pl-3 border-l-4 border-[#363EE8]">
                "Consider providing training materials in digital format as well."
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
