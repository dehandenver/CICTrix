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
    X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getTrainingStreams } from '../../lib/api/competencies';
import { EnrollEmployeesModal } from './components/EnrollEmployeesModal';

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

type NewSeminarModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (seminar: Seminar) => void;
  categoryOptions: string[];
};

const NewSeminarModal = ({ isOpen, onClose, onSubmit, categoryOptions }: NewSeminarModalProps) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<SeminarStatus>('Upcoming');
  const [instructor, setInstructor] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState('');
  const [description, setDescription] = useState('');

  if (!isOpen) return null;

  const reset = () => {
    setTitle(''); setCategory(''); setStatus('Upcoming'); setInstructor('');
    setStartDate(''); setEndDate(''); setStartTime(''); setEndTime('');
    setLocation(''); setCapacity(''); setDescription('');
  };

  const fmtDate = (d: string) => {
    if (!d) return '';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };
  const fmtTime = (t: string) => {
    if (!t) return '';
    const [hh, mm] = t.split(':');
    const h = parseInt(hh, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${mm} ${ampm}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      id: Date.now().toString(),
      title,
      category,
      status,
      instructor,
      dateString: startDate === endDate ? fmtDate(startDate) : `${fmtDate(startDate)} – ${fmtDate(endDate)}`,
      timeString: `${fmtTime(startTime)} - ${fmtTime(endTime)}`,
      location,
      capacity: Number(capacity) || 0,
      enrolledCount: 0,
      description,
      enrollees: [],
    });
    reset();
    onClose();
  };

  const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
  const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 rounded-t-2xl">
          <h2 className="text-lg font-bold text-gray-900">New Seminar</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className={labelClass}>Seminar Title</label>
            <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Category</label>
              <select required value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                <option value="" disabled>Select category</option>
                {categoryOptions.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as SeminarStatus)} className={inputClass}>
                {(['Upcoming', 'Ongoing', 'Completed'] as SeminarStatus[]).map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Instructor</label>
            <input type="text" required value={instructor} onChange={(e) => setInstructor(e.target.value)} className={inputClass} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Start Date</label>
              <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>End Date</label>
              <input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Start Time</label>
              <input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>End Time</label>
              <input type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Location</label>
              <input type="text" required value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Capacity</label>
              <input type="number" required min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <textarea required rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors">Create Seminar</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const SeminarEnrollment = () => {
  const [seminars, setSeminars] = useState<Seminar[]>(seminarsData);
  const [expandedSeminarId, setExpandedSeminarId] = useState('1');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Upcoming' | 'Ongoing' | 'Completed' | 'Cancelled'>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [isNewSeminarModalOpen, setIsNewSeminarModalOpen] = useState(false);
  const [activeSeminarForModal, setActiveSeminarForModal] = useState<Seminar | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);

  // Fetch training streams (categories) from Supabase
  useEffect(() => {
    (async () => {
      const streams = await getTrainingStreams();
      setCategoryOptions(streams.length > 0 ? streams : []);
    })();
  }, []);

  const openEnrollModal = (seminar: Seminar) => {
    setActiveSeminarForModal(seminar);
    setIsEnrollModalOpen(true);
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
      const matchesCategory = categoryFilter === 'All' || seminar.category === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [seminars, searchQuery, statusFilter, categoryFilter]);

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
        <button type="button" onClick={() => setIsNewSeminarModalOpen(true)} className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors">
          <Plus className="w-4 h-4" />
          <span>New Seminar</span>
        </button>
      </div>

      <div className="flex items-center space-x-6 border-b border-gray-200 pb-4 mb-6 text-sm">
        <div>
          <span className="font-semibold text-gray-900 text-lg mr-1">3</span>
          <span className="text-gray-500">Total Seminars</span>
        </div>
        <div>
          <span className="font-semibold text-blue-600 text-lg mr-1">3</span>
          <span className="text-gray-500">Upcoming</span>
        </div>
        <div>
          <span className="font-semibold text-green-600 text-lg mr-1">0</span>
          <span className="text-gray-500">Ongoing</span>
        </div>
        <div>
          <span className="font-semibold text-purple-600 text-lg mr-1">9</span>
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

      {categoryOptions.length > 0 && (
        <div className="flex items-center flex-wrap gap-2 mb-6">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 mr-1">Category:</span>
          <button
            type="button"
            onClick={() => setCategoryFilter('All')}
            className={[
              'px-3 py-1.5 rounded-full text-sm transition-colors',
              categoryFilter === 'All'
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50',
            ].join(' ')}
          >
            All
          </button>
          {categoryOptions.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={[
                'px-3 py-1.5 rounded-full text-sm transition-colors',
                categoryFilter === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50',
              ].join(' ')}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

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

                    <button type="button" onClick={(e) => { e.stopPropagation(); openEnrollModal(seminar); }} className="text-xs bg-green-100 text-green-700 px-2.5 py-1.5 rounded-md font-medium hover:bg-green-200">+ Add Employee</button>
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
                    <button type="button" onClick={() => openEnrollModal(seminar)} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center">
                      <UserPlus className="w-4 h-4 mr-2" />
                      Add Employee to Seminar
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      {activeSeminarForModal && (
        <EnrollEmployeesModal
          isOpen={isEnrollModalOpen}
          onClose={() => setIsEnrollModalOpen(false)}
          seminarTitle={activeSeminarForModal.title}
          onEnroll={(selectedIds, status) => {
            console.log('Enrolling', selectedIds, 'as', status, 'in', activeSeminarForModal.title);
          }}
        />
      )}

      <NewSeminarModal
        isOpen={isNewSeminarModalOpen}
        onClose={() => setIsNewSeminarModalOpen(false)}
        onSubmit={(seminar) => setSeminars((prev) => [...prev, seminar])}
        categoryOptions={categoryOptions}
      />
    </div>
  );
};
