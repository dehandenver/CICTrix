import { useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Eye, Filter, Search } from 'lucide-react';

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
];

export const EmployeeDevelopment = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All Departments');

  const departments = useMemo(
    () => ['All Departments', ...Array.from(new Set(employeesData.map((employee) => employee.department)))],
    []
  );

  const filteredEmployees = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return employeesData.filter((employee) => {
      const matchesSearch =
        employee.name.toLowerCase().includes(query) ||
        employee.position.toLowerCase().includes(query) ||
        employee.department.toLowerCase().includes(query);
      const matchesDepartment =
        departmentFilter === 'All Departments' || employee.department === departmentFilter;
      return matchesSearch && matchesDepartment;
    });
  }, [searchQuery, departmentFilter]);

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
                  <button className="flex items-center space-x-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors bg-white" type="button">
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
