import React, { useState, useMemo } from 'react';
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  Eye,
  Plus,
  Edit2,
  Trash2,
  Download,
  ListChecks,
  Settings,
  FileText
} from 'lucide-react';
import { Dialog } from '../../../components/Dialog';

// --- MOCK DATA ---
const MOCK_POSITIONS = [
  { id: '1', name: 'Software Developer', department: 'IT', reqCount: 8, description: 'Develops software applications.' },
  { id: '2', name: 'HR Officer', department: 'HR', reqCount: 6, description: 'Manages human resources operations.' },
  { id: '3', name: 'Sales Manager', department: 'Sales', reqCount: 5, description: 'Leads the sales team.' }
];

const MOCK_COMPETENCIES = [
  { id: 'c1', name: 'Programming', category: 'Technical', description: 'Software development skills' },
  { id: 'c2', name: 'Database Management', category: 'Technical', description: 'Database design and maintenance' },
  { id: 'c3', name: 'Communication', category: 'Core', description: 'Effective oral and written communication' },
  { id: 'c4', name: 'Problem Solving', category: 'Core', description: 'Ability to solve complex issues' },
  { id: 'c5', name: 'Leadership', category: 'Managerial', description: 'Ability to lead and motivate others' }
];

const MOCK_EMPLOYEES = [
  {
    id: 'e1',
    name: 'John Doe',
    employeeId: 'EMP-001',
    department: 'IT',
    position: 'Software Developer',
    dateAssessed: '2025-10-15',
    assessor: 'Jane Manager',
    status: 'Below Requirement',
    missingCount: 2,
    competencies: [
      { name: 'Programming', required: 5, current: 4, status: 'Gap' },
      { name: 'Database Management', required: 4, current: 4, status: 'Met' },
      { name: 'Communication', required: 3, current: 3, status: 'Met' },
      { name: 'Problem Solving', required: 4, current: 2, status: 'Gap' }
    ]
  },
  {
    id: 'e2',
    name: 'Jane Smith',
    employeeId: 'EMP-002',
    department: 'HR',
    position: 'HR Officer',
    dateAssessed: '2025-11-01',
    assessor: 'Admin',
    status: 'Meets Requirement',
    missingCount: 0,
    competencies: [
      { name: 'Communication', required: 4, current: 5, status: 'Met' },
      { name: 'Problem Solving', required: 3, current: 4, status: 'Met' },
      { name: 'Leadership', required: 3, current: 3, status: 'Met' }
    ]
  }
];

// --- COMPONENTS ---
export const PMCompetencyFramework = () => {
  const [activeTab, setActiveTab] = useState<'gap-report' | 'management'>('gap-report');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ListChecks className="h-6 w-6 text-[#363EE8]" />
            Competency Framework
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Define requirements, track employee assessments, and analyze competency gaps.
          </p>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('gap-report')}
          className={`px-4 py-2 font-semibold text-sm border-b-2 transition ${
            activeTab === 'gap-report' ? 'border-[#363EE8] text-[#363EE8]' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Competency Gap Report
        </button>
        <button
          onClick={() => setActiveTab('management')}
          className={`px-4 py-2 font-semibold text-sm border-b-2 transition ${
            activeTab === 'management' ? 'border-[#363EE8] text-[#363EE8]' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Competency Management
        </button>
      </div>

      {activeTab === 'gap-report' && <GapReportTab />}
      {activeTab === 'management' && <ManagementTab />}
    </div>
  );
};

const GapReportTab = () => {
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewEmployee, setViewEmployee] = useState<any>(null);

  const stats = {
    total: 120,
    assessed: 105,
    gaps: 45,
    met: 60,
    pending: 15
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
          <Users className="h-6 w-6 text-[#363EE8] mb-2" />
          <span className="text-2xl font-bold text-slate-800">{stats.total}</span>
          <span className="text-xs font-semibold text-slate-500">Total Employees</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
          <CheckCircle2 className="h-6 w-6 text-emerald-500 mb-2" />
          <span className="text-2xl font-bold text-slate-800">{stats.assessed}</span>
          <span className="text-xs font-semibold text-slate-500">Employees Assessed</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-red-200 shadow-sm flex flex-col items-center justify-center text-center bg-red-50">
          <AlertTriangle className="h-6 w-6 text-red-500 mb-2" />
          <span className="text-2xl font-bold text-red-700">{stats.gaps}</span>
          <span className="text-xs font-semibold text-red-600">With Competency Gaps</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm flex flex-col items-center justify-center text-center bg-emerald-50">
          <CheckCircle2 className="h-6 w-6 text-emerald-600 mb-2" />
          <span className="text-2xl font-bold text-emerald-700">{stats.met}</span>
          <span className="text-xs font-semibold text-emerald-600">Meeting Requirements</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm flex flex-col items-center justify-center text-center bg-amber-50">
          <Clock className="h-6 w-6 text-amber-500 mb-2" />
          <span className="text-2xl font-bold text-amber-700">{stats.pending}</span>
          <span className="text-xs font-semibold text-amber-600">Pending Assessment</span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Department</label>
          <select value={department} onChange={e => setDepartment(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#363EE8]">
            <option value="">All Departments</option>
            <option value="IT">IT</option>
            <option value="HR">HR</option>
          </select>
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Position</label>
          <select value={position} onChange={e => setPosition(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#363EE8]">
            <option value="">All Positions</option>
            <option value="Software Developer">Software Developer</option>
            <option value="HR Officer">HR Officer</option>
          </select>
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Status</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#363EE8]">
            <option value="">All Statuses</option>
            <option value="Meets Requirement">Meets Requirement</option>
            <option value="Below Requirement">Below Requirement</option>
            <option value="Not Yet Assessed">Not Yet Assessed</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <th className="px-6 py-3 font-semibold">Employee</th>
              <th className="px-6 py-3 font-semibold">Department</th>
              <th className="px-6 py-3 font-semibold">Position</th>
              <th className="px-6 py-3 font-semibold">Overall Status</th>
              <th className="px-6 py-3 font-semibold text-center">Missing Competencies</th>
              <th className="px-6 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {MOCK_EMPLOYEES.map(emp => (
              <tr key={emp.id} className="hover:bg-slate-50">
                <td className="px-6 py-4 font-medium text-slate-800">{emp.name}</td>
                <td className="px-6 py-4 text-slate-600">{emp.department}</td>
                <td className="px-6 py-4 text-slate-600">{emp.position}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    emp.status === 'Meets Requirement' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {emp.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-center font-medium text-slate-700">{emp.missingCount}</td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => setViewEmployee(emp)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#363EE8] hover:text-[#2e35d4] transition">
                    <Eye className="h-4 w-4" /> View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewEmployee && (
        <EmployeeCompetencyModal employee={viewEmployee} onClose={() => setViewEmployee(null)} />
      )}
    </div>
  );
};

const EmployeeCompetencyModal = ({ employee, onClose }: { employee: any, onClose: () => void }) => {
  return (
    <Dialog open onClose={onClose} title="Employee Competency Details">
      <div className="space-y-6">
        {/* Employee Info */}
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Employee ID</span>
            <span className="font-semibold text-slate-800">{employee.employeeId}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Name</span>
            <span className="font-semibold text-slate-800">{employee.name}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Department</span>
            <span className="text-slate-700">{employee.department}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Position</span>
            <span className="text-slate-700">{employee.position}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Date Assessed</span>
            <span className="text-slate-700">{employee.dateAssessed}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Assessor</span>
            <span className="text-slate-700">{employee.assessor}</span>
          </div>
        </div>

        {/* Competency Comparison Table */}
        <div>
          <h4 className="font-semibold text-slate-800 mb-3">Competency Comparison</h4>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  <th className="px-4 py-2 font-semibold">Competency</th>
                  <th className="px-4 py-2 font-semibold text-center">Required Level</th>
                  <th className="px-4 py-2 font-semibold text-center">Employee Level</th>
                  <th className="px-4 py-2 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employee.competencies.map((c: any, i: number) => (
                  <tr key={i}>
                    <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
                    <td className="px-4 py-3 text-center">{c.required}</td>
                    <td className="px-4 py-3 text-center font-semibold">{c.current}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${
                        c.status === 'Met' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap justify-between gap-3 pt-4 border-t border-slate-200">
          <div className="flex gap-2">
            <button className="flex items-center gap-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold transition">
              <Download className="h-4 w-4" /> Print Report
            </button>
            <button className="flex items-center gap-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold transition">
              <FileText className="h-4 w-4" /> Export PDF
            </button>
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 bg-[#363EE8] hover:bg-[#2e35d4] text-white px-4 py-2 rounded-lg text-sm font-semibold shadow transition">
              Reassess Employee
            </button>
            <button onClick={onClose} className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold transition">
              Close
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
};

const ManagementTab = () => {
  const [showManageComp, setShowManageComp] = useState<any>(null);

  return (
    <div className="space-y-8">
      {/* SECTION A: Position List */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-800">Section A – Position List</h3>
          <button className="flex items-center gap-1.5 bg-[#363EE8] hover:bg-[#2e35d4] text-white rounded-lg px-4 py-2 text-sm font-semibold shadow transition">
            <Plus className="h-4 w-4" /> Add Position
          </button>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <th className="px-6 py-3 font-semibold">Position</th>
                <th className="px-6 py-3 font-semibold">Department</th>
                <th className="px-6 py-3 font-semibold text-center">Required Competencies</th>
                <th className="px-6 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MOCK_POSITIONS.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-slate-800">{p.name}</td>
                  <td className="px-6 py-4 text-slate-600">{p.department}</td>
                  <td className="px-6 py-4 text-center text-slate-700">{p.reqCount}</td>
                  <td className="px-6 py-4 text-right flex justify-end gap-3">
                    <button onClick={() => setShowManageComp(p)} className="text-[#363EE8] hover:text-[#2e35d4] font-semibold transition">
                      Manage
                    </button>
                    <button className="text-slate-400 hover:text-slate-600 transition"><Edit2 className="h-4 w-4" /></button>
                    <button className="text-red-400 hover:text-red-600 transition"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION B: Competency Library */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-800">Section B – Competency Library</h3>
          <button className="flex items-center gap-1.5 bg-[#363EE8] hover:bg-[#2e35d4] text-white rounded-lg px-4 py-2 text-sm font-semibold shadow transition">
            <Plus className="h-4 w-4" /> Add Competency
          </button>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <th className="px-6 py-3 font-semibold">Competency</th>
                <th className="px-6 py-3 font-semibold">Description</th>
                <th className="px-6 py-3 font-semibold">Category</th>
                <th className="px-6 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MOCK_COMPETENCIES.map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-slate-800">{c.name}</td>
                  <td className="px-6 py-4 text-slate-600">{c.description}</td>
                  <td className="px-6 py-4 text-slate-600">
                    <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md text-xs font-semibold">
                      {c.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right flex justify-end gap-3">
                    <button className="text-slate-400 hover:text-slate-600 transition"><Edit2 className="h-4 w-4" /></button>
                    <button className="text-red-400 hover:text-red-600 transition"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showManageComp && (
        <ManageCompetenciesModal position={showManageComp} onClose={() => setShowManageComp(null)} />
      )}
    </div>
  );
};

const ManageCompetenciesModal = ({ position, onClose }: { position: any, onClose: () => void }) => {
  return (
    <Dialog open onClose={onClose} title={`Manage Competencies: ${position.name}`}>
      <div className="space-y-6">
        <div>
          <h4 className="font-semibold text-slate-800 mb-3">Required Competencies</h4>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-2 font-semibold">Competency</th>
                  <th className="px-4 py-2 font-semibold text-center">Required Level</th>
                  <th className="px-4 py-2 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-800">Programming</td>
                  <td className="px-4 py-3 text-center font-semibold">5</td>
                  <td className="px-4 py-3 text-right flex justify-end gap-2 text-[#363EE8]">
                    <button className="hover:underline text-xs font-semibold">Edit</button>
                    <button className="hover:underline text-xs font-semibold text-red-600">Remove</button>
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-800">Database Management</td>
                  <td className="px-4 py-3 text-center font-semibold">4</td>
                  <td className="px-4 py-3 text-right flex justify-end gap-2 text-[#363EE8]">
                    <button className="hover:underline text-xs font-semibold">Edit</button>
                    <button className="hover:underline text-xs font-semibold text-red-600">Remove</button>
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-800">Communication</td>
                  <td className="px-4 py-3 text-center font-semibold">3</td>
                  <td className="px-4 py-3 text-right flex justify-end gap-2 text-[#363EE8]">
                    <button className="hover:underline text-xs font-semibold">Edit</button>
                    <button className="hover:underline text-xs font-semibold text-red-600">Remove</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-wrap justify-between gap-3 pt-4 border-t border-slate-200">
          <button className="flex items-center gap-2 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 px-4 py-2 rounded-lg text-sm font-semibold transition">
            <Plus className="h-4 w-4" /> Add Competency
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold transition">
              Cancel
            </button>
            <button onClick={onClose} className="bg-[#363EE8] hover:bg-[#2e35d4] text-white px-4 py-2 rounded-lg text-sm font-semibold shadow transition">
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
