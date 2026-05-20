import {
  Bookmark,
  Building2,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock,
  Edit2,
  Filter,
  MapPin,
  Plus,
  Search,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { supabase as supabaseClient } from '../../lib/supabase';

const supabase = supabaseClient as any;

type SeminarStatus = 'Upcoming' | 'Ongoing' | 'Completed';
type EnrollmentStatus = 'Confirmed' | 'Pending';

type Enrollee = {
  id: string;
  name: string;
  position: string;
  department: string;
  enrollmentStatus: EnrollmentStatus;
  addedBy: string;
  dateAdded: string;
};

type Seminar = {
  id: string;
  title: string;
  category: string;
  status: SeminarStatus;
  instructor: string;
  dateString: string;
  timeString: string;
  location: string;
  capacity: number;
  enrolledCount: number;
  description: string;
  enrollees: Enrollee[];
};

const seminarsData: Seminar[] = [
  {
    id: '1',
    title: 'Leadership Development Program',
    category: 'Leadership & Management',
    status: 'Upcoming',
    instructor: 'Dr. Maria Santos',
    dateString: 'March 12, 2025 – March 14, 2025',
    timeString: '8:00 AM - 5:00 PM',
    location: 'Main Conference Room',
    capacity: 30,
    enrolledCount: 3,
    description:
      'A foundational leadership seminar focused on strategic decision-making, team supervision, and communication excellence for government managers.',
    enrollees: [
      {
        id: 'E-1',
        name: 'Atty. Love Faith Hayco-Mallorca',
        position: 'HR Division Chief',
        department: 'HR Division',
        enrollmentStatus: 'Confirmed',
        addedBy: 'L&D Admin',
        dateAdded: 'Mar 01, 2025',
      },
      {
        id: 'E-2',
        name: 'Ronnel Kirk A. Pabil',
        position: 'Operations Supervisor',
        department: 'Operations',
        enrollmentStatus: 'Pending',
        addedBy: 'L&D Admin',
        dateAdded: 'Mar 02, 2025',
      },
      {
        id: 'E-3',
        name: 'Christine L. Flores',
        position: 'IT Supervisor',
        department: 'MIS',
        enrollmentStatus: 'Confirmed',
        addedBy: 'HR Officer',
        dateAdded: 'Mar 03, 2025',
      },
    ],
  },
  {
    id: '2',
    title: 'Data Privacy and Security Training',
    category: 'Digital Literacy & IT',
    status: 'Upcoming',
    instructor: 'Engr. Paul Rivera',
    dateString: 'March 20, 2025 – March 22, 2025',
    timeString: '9:00 AM - 4:00 PM',
    location: 'Online - Zoom',
    capacity: 40,
    enrolledCount: 4,
    description:
      'Comprehensive training on data privacy compliance, cybersecurity awareness, and best practices for secure public sector information handling.',
    enrollees: [
      {
        id: 'E-4',
        name: 'Jerome P. Castillo',
        position: 'Systems Analyst',
        department: 'MIS',
        enrollmentStatus: 'Confirmed',
        addedBy: 'L&D Admin',
        dateAdded: 'Mar 04, 2025',
      },
      {
        id: 'E-5',
        name: 'Mae T. Navarro',
        position: 'Data Encoder',
        department: 'Records',
        enrollmentStatus: 'Pending',
        addedBy: 'Department Head',
        dateAdded: 'Mar 05, 2025',
      },
      {
        id: 'E-6',
        name: 'Lynette O. Ramos',
        position: 'Administrative Officer I',
        department: 'HR Division',
        enrollmentStatus: 'Confirmed',
        addedBy: 'L&D Admin',
        dateAdded: 'Mar 05, 2025',
      },
      {
        id: 'E-7',
        name: 'Patrick D. Alba',
        position: 'IT Assistant',
        department: 'MIS',
        enrollmentStatus: 'Confirmed',
        addedBy: 'HR Officer',
        dateAdded: 'Mar 06, 2025',
      },
    ],
  },
  {
    id: '3',
    title: 'Values Formation and Work Ethics Seminar',
    category: 'Values & Ethics',
    status: 'Upcoming',
    instructor: 'Atty. Liza Cruz',
    dateString: 'March 28, 2025 – March 29, 2025',
    timeString: '8:30 AM - 3:30 PM',
    location: 'Training Hall B',
    capacity: 80,
    enrolledCount: 2,
    description:
      'A values-oriented seminar that strengthens ethical decision-making, accountability, and workplace professionalism across all departments.',
    enrollees: [
      {
        id: 'E-8',
        name: 'Sofia Ramirez',
        position: 'Municipal Budget Officer',
        department: 'Budget',
        enrollmentStatus: 'Confirmed',
        addedBy: 'L&D Admin',
        dateAdded: 'Mar 07, 2025',
      },
      {
        id: 'E-9',
        name: 'Leah Torres',
        position: 'Administrative Aide VI',
        department: 'General Services',
        enrollmentStatus: 'Pending',
        addedBy: 'Department Head',
        dateAdded: 'Mar 08, 2025',
      },
    ],
  },
];

const statusBadge = (status: SeminarStatus | EnrollmentStatus) => {
  if (status === 'Upcoming') return 'bg-blue-100 text-blue-700';
  if (status === 'Confirmed') return 'bg-green-100 text-green-700';
  if (status === 'Pending') return 'bg-yellow-100 text-yellow-700';
  return 'bg-gray-100 text-gray-700';
};

const MOCK_EMPLOYEES = [
  { id: 'emp-1', name: 'Atty. Love Faith Hayco-Mallorca', position: 'HR Division Chief', department: 'HR Division' },
  { id: 'emp-2', name: 'Ronnel Kirk A. Pabil', position: 'Operations Supervisor', department: 'Operations' },
  { id: 'emp-3', name: 'Christine L. Flores', position: 'IT Supervisor', department: 'MIS' },
  { id: 'emp-4', name: 'Jerome P. Castillo', position: 'Systems Analyst', department: 'MIS' },
  { id: 'emp-5', name: 'Mae T. Navarro', position: 'Data Encoder', department: 'Records' },
  { id: 'emp-6', name: 'Lynette O. Ramos', position: 'Administrative Officer I', department: 'HR Division' },
  { id: 'emp-7', name: 'Patrick D. Alba', position: 'IT Assistant', department: 'MIS' },
  { id: 'emp-8', name: 'Sofia Ramirez', position: 'Municipal Budget Officer', department: 'Budget' },
  { id: 'emp-9', name: 'Leah Torres', position: 'Administrative Aide VI', department: 'General Services' },
  { id: 'emp-10', name: 'Rodrigo Duterte', position: 'Admin Officer III', department: 'Administration' },
  { id: 'emp-11', name: 'Denver Celeste', position: 'Information Technology Specialist', department: 'MIS' },
  { id: 'emp-12', name: 'Angelika Jean Jungco Ocana', position: 'Accountant', department: 'Finance' },
];

export const SeminarEnrollment = () => {
  const [seminars, setSeminars] = useState<Seminar[]>(seminarsData);
  const [expandedSeminarId, setExpandedSeminarId] = useState('1');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Upcoming' | 'Ongoing' | 'Completed' | 'Cancelled'>('All');

  // Modal States
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [selectedSeminarForEnroll, setSelectedSeminarForEnroll] = useState<Seminar | null>(null);
  const [enrollSearchQuery, setEnrollSearchQuery] = useState('');
  const [enrollDeptFilter, setEnrollDeptFilter] = useState('All');
  const [enrollAsStatus, setEnrollAsStatus] = useState<'Confirmed' | 'Pending'>('Confirmed');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [allEmployees, setAllEmployees] = useState<any[]>(MOCK_EMPLOYEES);

  useEffect(() => {
    const loadSupabaseEmployees = async () => {
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
            position: d.position || 'Employee',
            department: d.office || 'Unassigned',
          }));
          
          setAllEmployees((prev) => {
            const existingNames = new Set(prev.map(p => p.name.toLowerCase()));
            const filteredLoaded = loaded.filter((l: any) => !existingNames.has(l.name.toLowerCase()));
            return [...prev, ...filteredLoaded];
          });
        }
      } catch (err) {
        console.warn('loadSupabaseEmployees: DB loading bypassed locally', err);
      }
    };
    
    void loadSupabaseEmployees();
  }, []);

  const openEnrollModal = (seminar: Seminar) => {
    setSelectedSeminarForEnroll(seminar);
    setEnrollSearchQuery('');
    setEnrollDeptFilter('All');
    setEnrollAsStatus('Confirmed');
    setSelectedEmployeeIds(new Set());
    setIsEnrollModalOpen(true);
  };

  const closeEnrollModal = () => {
    setIsEnrollModalOpen(false);
    setSelectedSeminarForEnroll(null);
  };

  const handleToggleSelect = (empId: string) => {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(empId)) {
        next.delete(empId);
      } else {
        next.add(empId);
      }
      return next;
    });
  };

  const availableEmployees = useMemo(() => {
    if (!selectedSeminarForEnroll) return [];
    const enrolledNames = new Set(selectedSeminarForEnroll.enrollees.map(e => e.name.toLowerCase()));
    return allEmployees.filter(emp => !enrolledNames.has(emp.name.toLowerCase()));
  }, [selectedSeminarForEnroll, allEmployees]);

  const filteredAvailableEmployees = useMemo(() => {
    const q = enrollSearchQuery.toLowerCase();
    return availableEmployees.filter(emp => {
      const matchesSearch = emp.name.toLowerCase().includes(q) || 
                            emp.position.toLowerCase().includes(q) || 
                            emp.department.toLowerCase().includes(q);
      const matchesDept = enrollDeptFilter === 'All' || emp.department === enrollDeptFilter;
      return matchesSearch && matchesDept;
    });
  }, [availableEmployees, enrollSearchQuery, enrollDeptFilter]);

  const uniqueDepartments = useMemo(() => {
    const depts = new Set<string>();
    allEmployees.forEach(emp => {
      if (emp.department) depts.add(emp.department);
    });
    return Array.from(depts).sort();
  }, [allEmployees]);

  const handleSelectAll = () => {
    if (selectedEmployeeIds.size === filteredAvailableEmployees.length) {
      setSelectedEmployeeIds(new Set());
    } else {
      setSelectedEmployeeIds(new Set(filteredAvailableEmployees.map(e => e.id)));
    }
  };

  const handleEnrollSubmit = () => {
    if (!selectedSeminarForEnroll) return;
    
    const nextSeminars = seminars.map((s) => {
      if (s.id !== selectedSeminarForEnroll.id) return s;
      
      const newEnrollees = [...s.enrollees];
      allEmployees.forEach((emp) => {
        if (selectedEmployeeIds.has(emp.id)) {
          newEnrollees.push({
            id: `E-${Date.now()}-${emp.id}`,
            name: emp.name,
            position: emp.position,
            department: emp.department,
            enrollmentStatus: enrollAsStatus,
            addedBy: 'L&D Admin',
            dateAdded: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
          });
        }
      });
      
      return {
        ...s,
        enrollees: newEnrollees,
        enrolledCount: newEnrollees.length,
      };
    });
    
    setSeminars(nextSeminars);
    closeEnrollModal();
  };

  const toggleExpand = (id: string) => {
    setExpandedSeminarId((current) => (current === id ? '' : id));
  };

  const filteredSeminars = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return seminars.filter((seminar) => {
      const matchesSearch =
        seminar.title.toLowerCase().includes(query) ||
        seminar.category.toLowerCase().includes(query) ||
        seminar.instructor.toLowerCase().includes(query);
      const matchesStatus = statusFilter === 'All' || seminar.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [seminars, searchQuery, statusFilter]);

  return (
    <div className="p-6 md:p-8 pt-24 bg-gray-50 min-h-screen">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center">
          <button type="button" className="mr-4 text-gray-500 hover:bg-gray-200 p-2 rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Seminar Enrollment Management</h1>
            <p className="text-sm text-gray-500 mt-1">L&D Division — Manage seminars and enroll specific employees</p>
          </div>
        </div>
        <button type="button" className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors">
          <Plus className="w-4 h-4" />
          <span>New Seminar</span>
        </button>
      </div>

      <div className="flex items-center space-x-6 border-b border-gray-200 pb-4 mb-6 text-sm">
        <div>
          <span className="font-semibold text-gray-900 text-lg mr-1">{seminars.length}</span>
          <span className="text-gray-500">Total Seminars</span>
        </div>
        <div>
          <span className="font-semibold text-blue-600 text-lg mr-1">{seminars.filter(s => s.status === 'Upcoming').length}</span>
          <span className="text-gray-500">Upcoming</span>
        </div>
        <div>
          <span className="font-semibold text-green-600 text-lg mr-1">{seminars.filter(s => s.status === 'Ongoing').length}</span>
          <span className="text-gray-500">Ongoing</span>
        </div>
        <div>
          <span className="font-semibold text-purple-600 text-lg mr-1">{seminars.reduce((acc, s) => acc + s.enrolledCount, 0)}</span>
          <span className="text-gray-500">Total Enrolled</span>
        </div>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="relative w-full max-w-2xl">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search seminars, categories, or instructors"
            className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>

        <div className="flex items-center space-x-2 ml-4">
          <button type="button" className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
            <Filter className="w-4 h-4 text-gray-600" />
          </button>
          {(['All', 'Upcoming', 'Ongoing', 'Completed', 'Cancelled'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setStatusFilter(item)}
              className={[
                'px-3 py-1.5 rounded-full text-sm transition-colors',
                statusFilter === item
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50',
              ].join(' ')}
            >
              {item}
            </button>
          ))}
          <span className="text-sm text-gray-400 ml-2">{filteredSeminars.length} seminars</span>
        </div>
      </div>

      <div className="space-y-4">
        {filteredSeminars.map((seminar) => {
          const slotsLeft = seminar.capacity - seminar.enrolledCount;
          const progress = Math.min((seminar.enrolledCount / seminar.capacity) * 100, 100);

          return (
            <div key={seminar.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="p-5 flex flex-col cursor-pointer" onClick={() => toggleExpand(seminar.id)}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full text-xs font-semibold mr-2">{seminar.status}</span>
                    <span className="inline-flex items-center bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full text-xs font-semibold">
                      <Bookmark className="w-3 h-3 mr-1" />
                      {seminar.category}
                    </span>
                  </div>

                  <div className="flex items-start gap-2">
                    <div>
                      <p className="text-xs font-semibold text-right mb-1">{seminar.enrolledCount} / {seminar.capacity} enrolled</p>
                      <div className="w-28 h-1.5 bg-gray-200 rounded-full">
                        <div className="h-1.5 bg-blue-600 rounded-full" style={{ width: `${progress}%` }} />
                      </div>
                      <p className="text-xs text-gray-400 text-right mt-1">{slotsLeft} slots left</p>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEnrollModal(seminar);
                      }}
                      className="text-xs bg-green-100 text-green-700 px-2.5 py-1.5 rounded-md font-medium hover:bg-green-200"
                    >
                      + Add Employee
                    </button>
                    <button type="button" className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"><Edit2 className="w-4 h-4" /></button>
                    <button type="button" className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"><Trash2 className="w-4 h-4" /></button>
                    <button type="button" className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500">
                      {expandedSeminarId === seminar.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <h2 className="text-lg font-bold text-gray-900 mt-2 mb-3">{seminar.title}</h2>

                <div className="flex flex-wrap items-center text-xs text-gray-500 space-x-4">
                  <span className="inline-flex items-center"><User className="w-3.5 h-3.5 mr-1" />{seminar.instructor}</span>
                  <span className="inline-flex items-center"><Calendar className="w-3.5 h-3.5 mr-1" />{seminar.dateString}</span>
                  <span className="inline-flex items-center"><Clock className="w-3.5 h-3.5 mr-1" />{seminar.timeString}</span>
                  <span className="inline-flex items-center"><MapPin className="w-3.5 h-3.5 mr-1" />{seminar.location}</span>
                </div>
              </div>

              {expandedSeminarId === seminar.id ? (
                <>
                  <div className="bg-blue-50/50 border-t border-b border-gray-100 p-4">
                    <p className="text-sm text-blue-800">{seminar.description}</p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-white border-b border-gray-100">
                        <tr>
                          <th className="text-xs font-semibold text-gray-500 uppercase py-3 px-4 text-left">#</th>
                          <th className="text-xs font-semibold text-gray-500 uppercase py-3 px-4 text-left">Employee</th>
                          <th className="text-xs font-semibold text-gray-500 uppercase py-3 px-4 text-left">Department</th>
                          <th className="text-xs font-semibold text-gray-500 uppercase py-3 px-4 text-left">Enrollment Status</th>
                          <th className="text-xs font-semibold text-gray-500 uppercase py-3 px-4 text-left">Added By</th>
                          <th className="text-xs font-semibold text-gray-500 uppercase py-3 px-4 text-left">Date Added</th>
                          <th className="text-xs font-semibold text-gray-500 uppercase py-3 px-4 text-left">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {seminar.enrollees.map((enrollee, index) => (
                          <tr key={enrollee.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-4 text-sm text-gray-600">{index + 1}</td>
                            <td className="py-3 px-4">
                              <p className="font-semibold text-sm text-gray-900">{enrollee.name}</p>
                              <p className="text-xs text-gray-500">{enrollee.position}</p>
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-700">
                              <span className="inline-flex items-center"><Building2 className="w-3.5 h-3.5 mr-1 text-gray-400" />{enrollee.department}</span>
                            </td>
                            <td className="py-3 px-4">
                              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusBadge(enrollee.enrollmentStatus)}`}>
                                {enrollee.enrollmentStatus}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-700">{enrollee.addedBy}</td>
                            <td className="py-3 px-4 text-sm text-gray-700">{enrollee.dateAdded}</td>
                            <td className="py-3 px-4"><Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500 cursor-pointer" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between p-4 border-t border-gray-100 bg-white">
                    <p className="text-sm text-gray-500">{seminar.enrolledCount} enrolled · {slotsLeft} slots remaining</p>
                    <button
                      type="button"
                      onClick={() => openEnrollModal(seminar)}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center"
                    >
                      <UserPlus className="w-4 h-4 mr-2" />
                      Add More Employees
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Enroll Employees Modal */}
      {isEnrollModalOpen && selectedSeminarForEnroll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 select-none">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[85vh] transition-all">
            
            {/* Modal Header */}
            <div className="bg-[#10B981] text-white p-6 relative">
              <button
                type="button"
                onClick={closeEnrollModal}
                className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              <div className="flex items-center gap-3">
                <UserPlus className="w-6 h-6 text-white" />
                <h2 className="text-xl font-bold">Enroll Employees</h2>
              </div>
              <p className="text-sm text-white/95 mt-1 font-medium">{selectedSeminarForEnroll.title}</p>
            </div>

            {/* Filter / Search Bar */}
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="relative md:col-span-2">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                  <input
                    type="text"
                    value={enrollSearchQuery}
                    onChange={(e) => setEnrollSearchQuery(e.target.value)}
                    placeholder="Search by name, position, or department..."
                    className="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  />
                </div>
                <div className="relative">
                  <select
                    value={enrollDeptFilter}
                    onChange={(e) => setEnrollDeptFilter(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent appearance-none bg-white font-medium text-slate-700"
                  >
                    <option value="All">All Departments</option>
                    {uniqueDepartments.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
                </div>
              </div>

              {/* Enroll As Status & Select All */}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Enroll As:</span>
                  <div className="inline-flex p-0.5 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setEnrollAsStatus('Confirmed')}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                        enrollAsStatus === 'Confirmed'
                          ? 'bg-[#10B981] text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Confirmed
                    </button>
                    <button
                      type="button"
                      onClick={() => setEnrollAsStatus('Pending')}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                        enrollAsStatus === 'Pending'
                          ? 'bg-[#F59E0B] text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Pending
                    </button>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 text-xs font-medium">
                  <span className="text-slate-400 font-bold">{filteredAvailableEmployees.length} available</span>
                  {filteredAvailableEmployees.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-[#363EE8] hover:text-[#363EE8]/80 font-bold transition-colors"
                    >
                      {selectedEmployeeIds.size === filteredAvailableEmployees.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Employees Table List */}
            <div className="flex-1 overflow-y-auto min-h-[250px] max-h-[40vh]">
              {filteredAvailableEmployees.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-slate-400 text-center">
                  <Users className="w-12 h-12 text-slate-300 mb-3" />
                  <p className="text-sm font-medium">No employees found matching your filters.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-6 w-12">Select</th>
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-6 text-right">Department</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAvailableEmployees.map((emp) => {
                      const isSelected = selectedEmployeeIds.has(emp.id);
                      return (
                        <tr
                          key={emp.id}
                          onClick={() => handleToggleSelect(emp.id)}
                          className={`border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer transition-colors ${
                            isSelected ? 'bg-emerald-50/30' : ''
                          }`}
                        >
                          <td className="py-4 px-6" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(emp.id)}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                            />
                          </td>
                          <td className="py-4 px-4">
                            <p className="font-semibold text-slate-800 text-sm leading-tight">{emp.name}</p>
                            <p className="text-xs text-slate-400 mt-1">{emp.position}</p>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 rounded-full px-2.5 py-1">
                              <Building2 className="w-3 h-3 text-slate-400" />
                              {emp.department}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between flex-shrink-0">
              <button
                type="button"
                onClick={closeEnrollModal}
                className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-semibold hover:bg-slate-50 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEnrollSubmit}
                disabled={selectedEmployeeIds.size === 0}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center gap-2 ${
                  selectedEmployeeIds.size === 0
                    ? 'bg-[#A7F3D0] text-white cursor-not-allowed'
                    : 'bg-[#10B981] hover:bg-[#059669] text-white'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                <span>Enroll Employees</span>
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
