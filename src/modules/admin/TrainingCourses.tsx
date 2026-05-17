import { BookOpen, Calendar, ChevronDown, ChevronLeft, Clock, Filter, MapPin, Plus, Users, X } from 'lucide-react';
import { useState } from 'react';

export type CourseStatus = 'Ongoing' | 'Upcoming' | 'Completed';

export type Course = {
  id: string;
  title: string;
  category: string;
  status: CourseStatus;
  instructor: string;
  instructorTitle: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  location: string;
  attendees: number;
  capacity: number;
  description: string;
  learningObjectives: string;
};

type TrainingCoursesProps = {
  courses: Course[];
  onAddCourse: (course: Course) => void;
};

const statusBadge = (status: CourseStatus) => {
  if (status === 'Ongoing') return 'bg-blue-100 text-blue-700';
  if (status === 'Upcoming') return 'bg-green-100 text-green-700';
  return 'bg-gray-100 text-gray-700';
};

const STATUS_OPTIONS: CourseStatus[] = ['Ongoing', 'Upcoming', 'Completed'];

const CATEGORY_OPTIONS = [
  'Leadership',
  'Technical',
  'Soft Skills',
  'Compliance',
  'Communication',
  'Project Management',
  'Data & Analytics',
  'Digital Transformation',
  'Customer Service',
  'Other',
];

type AddCourseModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (course: Course) => void;
};

const AddCourseModal = ({ isOpen, onClose, onSubmit }: AddCourseModalProps) => {
  const [title, setTitle] = useState('');
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

  if (!isOpen) return null;

  const resetForm = () => {
    setTitle('');
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newCourse: Course = {
      id: Date.now().toString(),
      title,
      category,
      status,
      instructor,
      instructorTitle,
      startDate,
      endDate,
      startTime,
      endTime,
      location: venue,
      attendees: 0,
      capacity: Number(totalSlots) || 0,
      description,
      learningObjectives,
    };
    onSubmit(newCourse);
    resetForm();
    onClose();
  };

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
  const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 rounded-t-2xl">
          <h2 className="text-lg font-bold text-gray-900">Add New Course</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Title */}
          <div>
            <label className={labelClass}>Course Title</label>
            <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Leadership Development Program" className={inputClass} />
          </div>

          {/* Category & Status */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Category</label>
              <select required value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                <option value="" disabled>Select category</option>
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as CourseStatus)} className={inputClass}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Instructor & Instructor Title */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Instructor</label>
              <input type="text" required value={instructor} onChange={(e) => setInstructor(e.target.value)} placeholder="e.g. Dr. Maria Santos" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Instructor Title</label>
              <input type="text" value={instructorTitle} onChange={(e) => setInstructorTitle(e.target.value)} placeholder="e.g. Professor, Department Head" className={inputClass} />
            </div>
          </div>

          {/* Start Date & End Date */}
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

          {/* Start Time & End Time */}
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

          {/* Venue & Total Slots */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Venue</label>
              <input type="text" required value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Training Room A, 3rd Floor" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Total Slots</label>
              <input type="number" required min="1" value={totalSlots} onChange={(e) => setTotalSlots(e.target.value)} placeholder="e.g. 30" className={inputClass} />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={labelClass}>Description</label>
            <textarea required rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of the course..." className={inputClass} />
          </div>

          {/* Learning Objectives */}
          <div>
            <label className={labelClass}>Learning Objectives</label>
            <textarea required rows={3} value={learningObjectives} onChange={(e) => setLearningObjectives(e.target.value)} placeholder="List key learning objectives..." className={inputClass} />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
              Add Course
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatTime = (timeStr: string) => {
  if (!timeStr) return '';
  const [hours, minutes] = timeStr.split(':');
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
};

export const TrainingCourses = ({ courses, onAddCourse }: TrainingCoursesProps) => {
  const [statusFilter, setStatusFilter] = useState<string>('All Statuses');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filteredCourses =
    statusFilter === 'All Statuses'
      ? courses
      : courses.filter((c) => c.status === statusFilter);

  return (
    <div className="p-6 md:p-8 pt-24 bg-white min-h-screen">
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-4">
          <button type="button" className="text-gray-500 hover:bg-gray-100 p-2 rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Training Courses</h1>
            <p className="text-sm text-gray-500 mt-1">Browse and manage all training courses</p>
          </div>

          {/* Filter button — repositioned next to the header */}
          <div className="relative ml-2">
            <button
              type="button"
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className="flex items-center space-x-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Filter className="w-4 h-4 text-gray-400" />
              <span>{statusFilter}</span>
              <ChevronDown className="w-4 h-4 text-gray-400 ml-1" />
            </button>
            {isFilterOpen && (
              <div className="absolute left-0 top-full mt-1 z-20 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => { setStatusFilter('All Statuses'); setIsFilterOpen(false); }}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${statusFilter === 'All Statuses' ? 'font-semibold text-blue-600' : 'text-gray-700'}`}
                >
                  All Statuses
                </button>
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setStatusFilter(s); setIsFilterOpen(false); }}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${statusFilter === s ? 'font-semibold text-blue-600' : 'text-gray-700'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Add New Course button — positioned at the top right */}
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add New Course
        </button>
      </div>

      {filteredCourses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-500">
            <BookOpen className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No courses found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {statusFilter !== 'All Statuses'
              ? `No ${statusFilter.toLowerCase()} courses. Try a different filter or add a new course.`
              : 'Get started by adding your first training course.'}
          </p>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="mt-4 flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add New Course
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.map((course) => (
            <div
              key={course.id}
              className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-base font-bold text-gray-900 pr-4 leading-tight">{course.title}</h3>
                <BookOpen className="w-5 h-5 text-blue-600 flex-shrink-0" />
              </div>

              {/* Category */}
              {course.category && (
                <p className="text-xs font-medium text-gray-500 mb-3">{course.category}</p>
              )}

              <div className="mb-4 flex items-center gap-2">
                <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${statusBadge(course.status)}`}>{course.status}</span>
              </div>

              <div className="space-y-2.5 mb-4">
                <div className="flex items-center text-sm text-gray-600">
                  <Users className="w-4 h-4 mr-3 text-gray-400 flex-shrink-0" />
                  <span>
                    {course.instructor}
                    {course.instructorTitle && <span className="text-gray-400"> — {course.instructorTitle}</span>}
                  </span>
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <Calendar className="w-4 h-4 mr-3 text-gray-400 flex-shrink-0" />
                  {formatDate(course.startDate)} – {formatDate(course.endDate)}
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <Clock className="w-4 h-4 mr-3 text-gray-400 flex-shrink-0" />
                  {formatTime(course.startTime)} – {formatTime(course.endTime)}
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <MapPin className="w-4 h-4 mr-3 text-gray-400 flex-shrink-0" />
                  {course.location}
                </div>
              </div>

              {/* Description */}
              {course.description && (
                <p className="text-xs text-gray-500 mb-3 line-clamp-2">{course.description}</p>
              )}

              {/* Learning Objectives */}
              {course.learningObjectives && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-gray-600 mb-1">Learning Objectives</p>
                  <p className="text-xs text-gray-500 line-clamp-2">{course.learningObjectives}</p>
                </div>
              )}

              <div className="mt-auto pt-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-sm text-gray-500">Attendees</span>
                <span className="text-sm font-medium text-blue-600">{course.attendees}/{course.capacity}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddCourseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={onAddCourse}
      />
    </div>
  );
};
