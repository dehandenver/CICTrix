import { useState } from 'react';
import {
  Calendar,
  Check,
  ClipboardCheck,
  Clock,
  MapPin,
  MoreVertical,
  Search,
  User,
  Users,
  X,
} from 'lucide-react';

type SeminarStatus = 'Registration Open' | 'Full' | 'Completed';
type EnrollmentStatus = 'Approved' | 'Pending' | 'Waitlisted' | 'Rejected';

type ActiveSeminar = {
  id: string;
  title: string;
  date: string;
  location: string;
  instructor: string;
  enrolled: number;
  capacity: number;
  status: SeminarStatus;
};

type EnrollmentRecord = {
  id: string;
  employeeName: string;
  position: string;
  department: string;
  seminarTitle: string;
  dateApplied: string;
  status: EnrollmentStatus;
};

const activeSeminars: ActiveSeminar[] = [
  {
    id: 'SEM-1001',
    title: 'Leadership for Public Service',
    date: 'Mar 22, 2026',
    location: 'Main Conference Room',
    instructor: 'Dr. Maria Santos',
    enrolled: 18,
    capacity: 20,
    status: 'Registration Open',
  },
  {
    id: 'SEM-1002',
    title: 'Cybersecurity Essentials for Offices',
    date: 'Mar 24, 2026',
    location: 'Online - Zoom',
    instructor: 'Engr. Paul Rivera',
    enrolled: 35,
    capacity: 35,
    status: 'Full',
  },
  {
    id: 'SEM-1003',
    title: 'Records Management Modernization',
    date: 'Apr 2, 2026',
    location: 'Training Hall B',
    instructor: 'Atty. Liza Cruz',
    enrolled: 26,
    capacity: 30,
    status: 'Registration Open',
  },
  {
    id: 'SEM-1004',
    title: 'Public Finance Compliance Briefing',
    date: 'Mar 10, 2026',
    location: 'Executive Session Room',
    instructor: 'CPA. Jose Bautista',
    enrolled: 40,
    capacity: 40,
    status: 'Completed',
  },
];

const enrollmentRecords: EnrollmentRecord[] = [
  {
    id: 'ENR-001',
    employeeName: 'Juan Dela Cruz',
    position: 'Administrative Officer II',
    department: 'Planning Office',
    seminarTitle: 'Leadership for Public Service',
    dateApplied: 'Mar 11, 2026',
    status: 'Approved',
  },
  {
    id: 'ENR-002',
    employeeName: 'Ana Reyes',
    position: 'HR Assistant',
    department: 'HRMO',
    seminarTitle: 'Records Management Modernization',
    dateApplied: 'Mar 12, 2026',
    status: 'Pending',
  },
  {
    id: 'ENR-003',
    employeeName: 'Carlos Mendoza',
    position: 'IT Officer II',
    department: 'MIS Office',
    seminarTitle: 'Cybersecurity Essentials for Offices',
    dateApplied: 'Mar 12, 2026',
    status: 'Waitlisted',
  },
  {
    id: 'ENR-004',
    employeeName: 'Sofia Ramirez',
    position: 'Municipal Budget Officer',
    department: 'Budget Office',
    seminarTitle: 'Public Finance Compliance Briefing',
    dateApplied: 'Mar 7, 2026',
    status: 'Approved',
  },
  {
    id: 'ENR-005',
    employeeName: 'Mark Villanueva',
    position: 'Records Officer I',
    department: 'Records Section',
    seminarTitle: 'Records Management Modernization',
    dateApplied: 'Mar 13, 2026',
    status: 'Rejected',
  },
  {
    id: 'ENR-006',
    employeeName: 'Leah Torres',
    position: 'Administrative Aide VI',
    department: 'General Services',
    seminarTitle: 'Leadership for Public Service',
    dateApplied: 'Mar 14, 2026',
    status: 'Pending',
  },
];

const seminarStatusColor = (status: SeminarStatus) => {
  if (status === 'Registration Open') return 'bg-green-100 text-green-700';
  if (status === 'Full') return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-700';
};

const enrollmentStatusColor = (status: EnrollmentStatus) => {
  if (status === 'Approved') return 'bg-green-100 text-green-700';
  if (status === 'Pending') return 'bg-yellow-100 text-yellow-700';
  if (status === 'Waitlisted') return 'bg-orange-100 text-orange-700';
  return 'bg-red-100 text-red-700';
};

export const SeminarEnrollment = () => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRecords = enrollmentRecords.filter((record) => {
    const query = searchQuery.toLowerCase();
    return (
      record.employeeName.toLowerCase().includes(query) ||
      record.seminarTitle.toLowerCase().includes(query) ||
      record.department.toLowerCase().includes(query)
    );
  });

  const totalEnrollments = enrollmentRecords.length;
  const pendingRequests = enrollmentRecords.filter((item) => item.status === 'Pending').length;
  const waitlisted = enrollmentRecords.filter((item) => item.status === 'Waitlisted').length;
  const upcomingSeminars = activeSeminars.filter((item) => item.status !== 'Completed').length;

  return (
    <div className="p-8 pt-24">
      <div className="flex items-center space-x-2 text-sm text-gray-500 mb-6"><span className="text-blue-600">L&D</span><span>/</span><span>Seminar Enrollment</span></div>

      <div className="flex items-center justify-between mb-8">
        <div><h1 className="text-3xl font-semibold text-gray-800 mb-2">Seminar Enrollment</h1><p className="text-gray-600">Manage participant registrations, waitlists, and attendance for upcoming seminars</p></div>
        <button type="button" className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"><ClipboardCheck className="w-5 h-5" /><span>Manual Enrollment</span></button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Enrollments</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{totalEnrollments}</p>
              <p className="mt-1 text-xs text-gray-500">Applications logged</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
              <Users className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Pending Requests</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{pendingRequests}</p>
              <p className="mt-1 text-xs text-gray-500">Awaiting review</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-100 text-yellow-600">
              <Clock className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Waitlisted</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{waitlisted}</p>
              <p className="mt-1 text-xs text-gray-500">No available slots</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
              <ClipboardCheck className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Upcoming Seminars</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{upcomingSeminars}</p>
              <p className="mt-1 text-xs text-gray-500">Open and full sessions</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
              <Calendar className="h-6 w-6" />
            </div>
          </div>
        </div>
      </div>

      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center"><Calendar className="w-5 h-5 mr-2 text-blue-600" />Currently Enrolling Seminars</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {activeSeminars.map((seminar) => (
          <div key={seminar.id} className="bg-white border border-gray-200 rounded-lg p-5 hover:border-blue-300 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <h4 className="text-sm font-semibold text-gray-900">{seminar.title}</h4>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${seminarStatusColor(seminar.status)}`}>
                {seminar.status}
              </span>
            </div>

            <div className="mt-4 space-y-2 text-sm text-gray-600">
              <p className="flex items-center gap-2"><Clock className="h-4 w-4 text-gray-400" />{seminar.date}</p>
              <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-gray-400" />{seminar.location}</p>
              <p className="flex items-center gap-2"><User className="h-4 w-4 text-gray-400" />{seminar.instructor}</p>
            </div>

            <div className="mt-4">
              <div className="bg-gray-200 h-2 rounded-full">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${Math.min((seminar.enrolled / seminar.capacity) * 100, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">{seminar.enrolled} / {seminar.capacity} Slots Filled</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4 gap-4">
          <h3 className="text-lg font-semibold text-gray-800">Recent Enrollment Applications</h3>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search applications..."
              className="border border-gray-300 rounded-lg pl-8 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>
        </div>

        <div className="overflow-x-auto"><table className="w-full"><thead className="bg-gray-50 border-b border-gray-200"><tr>
          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Employee</th>
          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Department</th>
          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Seminar</th>
          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Date Applied</th>
          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
        </tr></thead>
          <tbody className="divide-y divide-gray-200">
            {filteredRecords.map((record) => (
              <tr key={record.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-700">
                  <p className="font-semibold text-gray-900">{record.employeeName}</p>
                  <p className="text-xs text-gray-500">{record.position}</p>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{record.department}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{record.seminarTitle}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{record.dateApplied}</td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold inline-flex ${enrollmentStatusColor(record.status)}`}>
                    {record.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  <div className="flex items-center gap-1">
                    <Check className="h-6 w-6 cursor-pointer text-green-600 p-1 rounded hover:bg-gray-100" />
                    <X className="h-6 w-6 cursor-pointer text-red-600 p-1 rounded hover:bg-gray-100" />
                    <MoreVertical className="h-6 w-6 cursor-pointer text-gray-500 p-1 rounded hover:bg-gray-100" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};
