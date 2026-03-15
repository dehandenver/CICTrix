import { BookOpen, CheckCircle, Edit, FileText, Plus, Search, Trash2, Users } from 'lucide-react';
import { useState } from 'react';

type CourseCategory = 'Leadership' | 'Technical' | 'Soft Skills' | 'Compliance';
type CourseStatus = 'Active' | 'Draft' | 'Archived';

interface Course {
  id: string;
  title: string;
  description: string;
  category: CourseCategory;
  duration: string;
  instructor: string;
  capacity: number;
  enrolled: number;
  status: CourseStatus;
}

const coursesData: Course[] = [
  {
    id: 'C-001',
    title: 'Leadership Essentials for Public Service',
    description: 'Core leadership principles for government officers',
    category: 'Leadership',
    duration: '3 days',
    instructor: 'Dr. Maria Santos',
    capacity: 30,
    enrolled: 28,
    status: 'Active',
  },
  {
    id: 'C-002',
    title: 'Cloud Infrastructure Operations',
    description: 'Hands-on training for cloud platforms and DevOps tools',
    category: 'Technical',
    duration: '5 days',
    instructor: 'Engr. Paul Rivera',
    capacity: 20,
    enrolled: 15,
    status: 'Active',
  },
  {
    id: 'C-003',
    title: 'Workplace Communication Mastery',
    description: 'Verbal and written communication for office environments',
    category: 'Soft Skills',
    duration: '2 days',
    instructor: 'Atty. Liza Cruz',
    capacity: 40,
    enrolled: 38,
    status: 'Active',
  },
  {
    id: 'C-004',
    title: 'Public Finance and Budgeting Compliance',
    description: 'RA 9184 and COA guidelines for budget officers',
    category: 'Compliance',
    duration: '1 day',
    instructor: 'CPA. Jose Bautista',
    capacity: 50,
    enrolled: 10,
    status: 'Draft',
  },
  {
    id: 'C-005',
    title: 'Data Analytics for Decision Making',
    description: 'Using data dashboards and statistical tools for governance',
    category: 'Technical',
    duration: '4 days',
    instructor: 'Dr. Anna Reyes',
    capacity: 25,
    enrolled: 0,
    status: 'Archived',
  },
];

const categoryColor = (cat: CourseCategory): string => {
  if (cat === 'Leadership') return 'bg-purple-100 text-purple-700';
  if (cat === 'Technical') return 'bg-blue-100 text-blue-700';
  if (cat === 'Soft Skills') return 'bg-orange-100 text-orange-700';
  return 'bg-green-100 text-green-700';
};

const courseStatusColor = (status: CourseStatus): string => {
  if (status === 'Active') return 'bg-green-100 text-green-700';
  if (status === 'Draft') return 'bg-gray-100 text-gray-700';
  return 'bg-red-100 text-red-700';
};

export const TrainingCourses = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filtered = coursesData.filter((course) => {
    const matchSearch =
      course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.instructor.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCategory = !categoryFilter || course.category === categoryFilter;
    const matchStatus = !statusFilter || course.status === statusFilter;
    return matchSearch && matchCategory && matchStatus;
  });

  const totalCourses = coursesData.length;
  const activePrograms = coursesData.filter((c) => c.status === 'Active').length;
  const totalEnrolled = coursesData.reduce((sum, c) => sum + c.enrolled, 0);
  const drafts = coursesData.filter((c) => c.status === 'Draft').length;

  return (
    <div className="p-8 pt-24">
      {/* Breadcrumbs */}
      <div className="flex items-center space-x-2 text-sm text-gray-500 mb-6">
        <span className="text-blue-600">L&D</span>
        <span>/</span>
        <span>Training Courses</span>
      </div>

      {/* Page Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-gray-800 mb-2">Training Courses</h1>
          <p className="text-gray-600">Manage training programs, curriculums, and course catalogs</p>
        </div>
        <button
          type="button"
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Add New Course</span>
        </button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Courses</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{totalCourses}</p>
              <p className="mt-1 text-xs text-gray-500">In catalog</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
              <BookOpen className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Active Programs</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{activePrograms}</p>
              <p className="mt-1 text-xs text-gray-500">Currently running</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 text-green-600">
              <CheckCircle className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Enrolled</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{totalEnrolled}</p>
              <p className="mt-1 text-xs text-gray-500">Active participants</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
              <Users className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Drafts</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{drafts}</p>
              <p className="mt-1 text-xs text-gray-500">Pending publication</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-600">
              <FileText className="h-6 w-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 flex flex-col md:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by course title or instructor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none text-sm"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
        >
          <option value="">All Categories</option>
          <option value="Leadership">Leadership</option>
          <option value="Technical">Technical</option>
          <option value="Soft Skills">Soft Skills</option>
          <option value="Compliance">Compliance</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
        >
          <option value="">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Draft">Draft</option>
          <option value="Archived">Archived</option>
        </select>
      </div>

      {/* Data Table */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center">
            <BookOpen className="w-5 h-5 mr-2 text-blue-600" />
            Course Catalog
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Course Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Category</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Duration</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Instructor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Enrollment</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No courses match your search.
                  </td>
                </tr>
              ) : (
                filtered.map((course) => (
                  <tr key={course.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <p className="font-semibold text-gray-900">{course.title}</p>
                      <p className="text-xs text-gray-500">{course.description}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${categoryColor(course.category)}`}>
                        {course.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{course.duration}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{course.instructor}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <p>{course.enrolled} / {course.capacity}</p>
                      <div className="mt-1 h-1.5 w-24 rounded-full bg-gray-200">
                        <div
                          className="h-1.5 rounded-full bg-blue-600"
                          style={{ width: `${Math.min((course.enrolled / course.capacity) * 100, 100)}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${courseStatusColor(course.status)}`}>
                        {course.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="flex items-center gap-3">
                        <Edit className="h-4 w-4 text-gray-400 hover:text-blue-600 cursor-pointer" />
                        <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500 cursor-pointer" />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
