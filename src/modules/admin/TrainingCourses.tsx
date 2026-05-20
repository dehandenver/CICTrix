import { BookOpen, Calendar, ChevronDown, ChevronLeft, Filter, MapPin, Users, Plus, X } from 'lucide-react';
import { useState, useMemo } from 'react';

type CourseStatus = 'Ongoing' | 'Upcoming' | 'Completed';

type Course = {
  id: string;
  title: string;
  status: CourseStatus;
  instructor: string;
  dateString: string;
  location: string;
  attendees: number;
  capacity: number;
};

const initialCoursesData: Course[] = [
  {
    id: '1',
    title: 'Communication Skills Workshop',
    status: 'Ongoing',
    instructor: 'Prof. Ana Reyes',
    dateString: 'Feb 1, 2025 - Feb 3, 2025',
    location: 'Training Room B, 3rd Floor',
    attendees: 6,
    capacity: 25,
  },
  {
    id: '2',
    title: 'Leadership Development Program',
    status: 'Ongoing',
    instructor: 'Dr. Maria Santos',
    dateString: 'Feb 5, 2025 - Feb 9, 2025',
    location: 'Main Conference Hall, 2nd Floor',
    attendees: 15,
    capacity: 30,
  },
  {
    id: '3',
    title: 'Data Privacy and Security Training',
    status: 'Upcoming',
    instructor: 'Atty. Juan dela Cruz',
    dateString: 'Feb 12, 2025 - Feb 14, 2025',
    location: 'Training Room A, 3rd Floor',
    attendees: 10,
    capacity: 50,
  },
  {
    id: '4',
    title: 'Digital Transformation Seminar',
    status: 'Upcoming',
    instructor: 'Mr. Roberto Cruz',
    dateString: 'Feb 20, 2025 - Feb 21, 2025',
    location: 'Main Conference Hall, 2nd Floor',
    attendees: 5,
    capacity: 20,
  },
  {
    id: '5',
    title: 'Customer Service Excellence',
    status: 'Upcoming',
    instructor: 'Ms. Patricia Gonzales',
    dateString: 'Mar 1, 2025 - Mar 3, 2025',
    location: 'Training Room A, 3rd Floor',
    attendees: 8,
    capacity: 40,
  },
  {
    id: '6',
    title: 'Project Management Fundamentals',
    status: 'Completed',
    instructor: 'Engr. Carlos Mendoza',
    dateString: 'Jan 15, 2025 - Jan 19, 2025',
    location: 'Main Conference Hall, 2nd Floor',
    attendees: 7,
    capacity: 35,
  },
];

const statusBadge = (status: CourseStatus) => {
  if (status === 'Ongoing') return 'bg-blue-100 text-blue-700';
  if (status === 'Upcoming') return 'bg-green-100 text-green-700';
  return 'bg-gray-100 text-gray-700';
};

export const TrainingCourses = () => {
  const [courses, setCourses] = useState<Course[]>(initialCoursesData);
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form Fields State
  const [courseTitle, setCourseTitle] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<CourseStatus>('Upcoming');
  const [instructor, setInstructor] = useState('');
  const [instructorTitle, setInstructorTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [venue, setVenue] = useState('');
  const [totalSlots, setTotalSlots] = useState('');
  const [description, setDescription] = useState('');
  const [learningObjectives, setLearningObjectives] = useState('');

  const filteredCourses = useMemo(() => {
    if (statusFilter === 'All Statuses') return courses;
    return courses.filter((c) => c.status === statusFilter);
  }, [courses, statusFilter]);

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    // Reset Form
    setCourseTitle('');
    setCategory('');
    setStatus('Upcoming');
    setInstructor('');
    setInstructorTitle('');
    setStartDate('');
    setEndDate('');
    setStartTime('');
    setEndTime('');
    setVenue('');
    setTotalSlots('');
    setDescription('');
    setLearningObjectives('');
  };

  const formatDateString = (start: string, end: string) => {
    if (!start) return 'TBA';
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    const startFormatted = new Date(start).toLocaleDateString('en-US', options);
    if (!end) return startFormatted;
    const endFormatted = new Date(end).toLocaleDateString('en-US', options);
    return `${startFormatted} - ${endFormatted}`;
  };

  const handleAddCourseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseTitle.trim()) return;

    const newCourse: Course = {
      id: String(courses.length + 1),
      title: courseTitle,
      status: status,
      instructor: instructor || 'TBA',
      dateString: formatDateString(startDate, endDate),
      location: venue || 'TBA',
      attendees: 0,
      capacity: Number(totalSlots) || 30,
    };

    setCourses((prev) => [newCourse, ...prev]);
    handleCloseModal();
  };

  return (
    <div className="p-6 md:p-8 pt-24 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-200">
        <div className="flex items-center">
          <button type="button" className="mr-4 text-gray-500 hover:bg-gray-100 p-2 rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-[#040E6B]">Training Courses</h1>
            <p className="text-sm text-gray-500 mt-1">Browse and manage all training courses</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Status Filter */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsFilterDropdownOpen((prev) => !prev)}
              className="flex items-center space-x-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm"
            >
              <Filter className="w-4 h-4 text-gray-400" />
              <span>{statusFilter}</span>
              <ChevronDown className="w-4 h-4 text-gray-400 ml-1" />
            </button>

            {isFilterDropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-xl shadow-lg py-1 z-30">
                {['All Statuses', 'Ongoing', 'Upcoming', 'Completed'].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setStatusFilter(opt);
                      setIsFilterDropdownOpen(false);
                    }}
                    className={[
                      'w-full text-left px-4 py-2 text-sm transition-colors hover:bg-slate-50 font-medium',
                      statusFilter === opt ? 'text-blue-600 bg-blue-50/50 font-bold' : 'text-slate-700',
                    ].join(' ')}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Add New Course Button */}
          <button
            type="button"
            onClick={handleOpenModal}
            className="flex items-center space-x-2 bg-[#363EE8] hover:bg-[#363EE8]/90 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Course</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCourses.map((course) => (
          <div
            key={course.id}
            className={[
              'bg-white border border-gray-200 rounded-xl p-6 flex flex-col hover:border-[#363EE8] hover:shadow-md transition-all cursor-pointer shadow-sm',
              course.id === '1' ? 'border-[#363EE8]/40' : '',
            ].join(' ')}
          >
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-base font-bold text-gray-900 pr-4 leading-tight">{course.title}</h3>
              <BookOpen className="w-5 h-5 text-[#363EE8] flex-shrink-0" />
            </div>

            <div className="mb-5">
              <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${statusBadge(course.status)}`}>
                {course.status}
              </span>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex items-center text-sm text-gray-600">
                <Users className="w-4 h-4 mr-3 text-gray-400" />
                {course.instructor}
              </div>
              <div className="flex items-center text-sm text-gray-600">
                <Calendar className="w-4 h-4 mr-3 text-gray-400" />
                {course.dateString}
              </div>
              <div className="flex items-center text-sm text-gray-600">
                <MapPin className="w-4 h-4 mr-3 text-gray-400" />
                {course.location}
              </div>
            </div>

            <div className="mt-auto pt-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-500">Attendees</span>
              <span className="text-sm font-semibold text-[#363EE8]">
                {course.attendees}/{course.capacity}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Add New Course Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto select-none">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col my-8 max-h-[90vh] transition-all">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Add New Course</h2>
              <button
                type="button"
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleAddCourseSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              
              {/* Course Title */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Course Title
                </label>
                <input
                  type="text"
                  required
                  value={courseTitle}
                  onChange={(e) => setCourseTitle(e.target.value)}
                  placeholder="e.g. Leadership Development Program"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none"
                />
              </div>

              {/* Category & Status */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none bg-white font-medium text-slate-700"
                  >
                    <option value="">Select category</option>
                    <option value="Leadership & Management">Leadership & Management</option>
                    <option value="Communication Skills">Communication Skills</option>
                    <option value="Data & Technology">Data & Technology</option>
                    <option value="Health & Safety">Health & Safety</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as CourseStatus)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none bg-white font-medium text-slate-700"
                  >
                    <option value="Upcoming">Upcoming</option>
                    <option value="Ongoing">Ongoing</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              </div>

              {/* Instructor & Instructor Title */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Instructor
                  </label>
                  <input
                    type="text"
                    value={instructor}
                    onChange={(e) => setInstructor(e.target.value)}
                    placeholder="e.g. Dr. Maria Santos"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Instructor Title
                  </label>
                  <input
                    type="text"
                    value={instructorTitle}
                    onChange={(e) => setInstructorTitle(e.target.value)}
                    placeholder="e.g. Professor, Department Head"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none"
                  />
                </div>
              </div>

              {/* Start Date & End Date */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none"
                  />
                </div>
              </div>

              {/* Start Time & End Time */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none"
                  />
                </div>
              </div>

              {/* Venue & Total Slots */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Venue
                  </label>
                  <input
                    type="text"
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    placeholder="e.g. Training Room A, 3rd Floor"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Total Slots
                  </label>
                  <input
                    type="number"
                    value={totalSlots}
                    onChange={(e) => setTotalSlots(e.target.value)}
                    placeholder="e.g. 30"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of the course..."
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none resize-none"
                />
              </div>

              {/* Learning Objectives */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Learning Objectives
                </label>
                <textarea
                  value={learningObjectives}
                  onChange={(e) => setLearningObjectives(e.target.value)}
                  placeholder="List key learning objectives..."
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none resize-none"
                />
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-5 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 hover:text-slate-800 transition-colors bg-white shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-lg bg-[#363EE8] hover:bg-[#363EE8]/90 text-white text-sm font-bold shadow-sm transition-colors"
                >
                  Add Course
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
