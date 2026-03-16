import { BookOpen, Calendar, ChevronDown, ChevronLeft, Filter, MapPin, Users } from 'lucide-react';
import { useState } from 'react';

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

const coursesData: Course[] = [
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
  const [statusFilter, setStatusFilter] = useState('All Statuses');

  return (
    <div className="p-6 md:p-8 pt-24 bg-white min-h-screen">
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-100">
        <div className="flex items-center">
          <button type="button" className="mr-4 text-gray-500 hover:bg-gray-100 p-2 rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Training Courses</h1>
            <p className="text-sm text-gray-500 mt-1">Browse and manage all training courses</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setStatusFilter('All Statuses')}
          className="flex items-center space-x-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Filter className="w-4 h-4 text-gray-400" />
          <span>{statusFilter}</span>
          <ChevronDown className="w-4 h-4 text-gray-400 ml-1" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {coursesData.map((course) => (
          <div
            key={course.id}
            className={[
              'bg-white border border-gray-200 rounded-xl p-6 flex flex-col hover:border-blue-400 hover:shadow-md transition-all cursor-pointer',
              course.id === '1' ? 'border-blue-300 shadow-sm' : '',
            ].join(' ')}
          >
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-base font-bold text-gray-900 pr-4 leading-tight">{course.title}</h3>
              <BookOpen className="w-5 h-5 text-blue-600 flex-shrink-0" />
            </div>

            <div className="mb-5">
              <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${statusBadge(course.status)}`}>{course.status}</span>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex items-center text-sm text-gray-600"><Users className="w-4 h-4 mr-3 text-gray-400" />{course.instructor}</div>
              <div className="flex items-center text-sm text-gray-600"><Calendar className="w-4 h-4 mr-3 text-gray-400" />{course.dateString}</div>
              <div className="flex items-center text-sm text-gray-600"><MapPin className="w-4 h-4 mr-3 text-gray-400" />{course.location}</div>
            </div>

            <div className="mt-auto pt-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-500">Attendees</span>
              <span className="text-sm font-medium text-blue-600">{course.attendees}/{course.capacity}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
