import React, { useState, useMemo, useEffect } from 'react';
import { UserPlus, X, Search, ChevronDown, Building2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

export type Employee = {
  id: string;
  name: string;
  position: string;
  department: string;
};

interface EnrollEmployeesModalProps {
  isOpen: boolean;
  onClose: () => void;
  seminarTitle: string;
  onEnroll: (selectedEmployeeIds: string[], status: 'Confirmed' | 'Pending') => void;
}

export const EnrollEmployeesModal: React.FC<EnrollEmployeesModalProps> = ({
  isOpen,
  onClose,
  seminarTitle,
  onEnroll,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('All Departments');
  const [enrollAs, setEnrollAs] = useState<'Confirmed' | 'Pending'>('Confirmed');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoading(true);
    setFetchError(null);
    (async () => {
      const { data, error } = await (supabase as any)
        .from('employees_with_department')
        .select('id, full_name, current_position, department, status')
        .eq('status', 'Active')
        .order('full_name', { ascending: true });

      if (cancelled) return;
      if (error) {
        console.error('Error fetching employees for enrollment modal:', error);
        setFetchError(error.message ?? 'Failed to load employees');
        setEmployees([]);
      } else {
        const mapped: Employee[] = (data ?? []).map((row: any) => {
          const name = (row.full_name ?? '').trim() || 'Unnamed Employee';
          return {
            id: row.id,
            name,
            position: row.current_position ?? '—',
            department: row.department ?? '—',
          };
        });
        setEmployees(mapped);
      }
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  const departments = useMemo(() => {
    const uniq = new Set<string>();
    employees.forEach((emp) => { if (emp.department && emp.department !== '—') uniq.add(emp.department); });
    return ['All Departments', ...Array.from(uniq).sort()];
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchesSearch =
        emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.position.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.department.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDept = selectedDepartment === 'All Departments' || emp.department === selectedDepartment;
      return matchesSearch && matchesDept;
    });
  }, [employees, searchQuery, selectedDepartment]);

  const allSelected = filteredEmployees.length > 0 && selectedIds.size === filteredEmployees.length;

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEmployees.map((e) => e.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleEnroll = () => {
    onEnroll(Array.from(selectedIds), enrollAs);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-hidden">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#0b8a36] text-white p-5 rounded-t-xl flex items-start justify-between">
          <div className="flex items-start gap-3">
            <UserPlus className="w-6 h-6 mt-1" />
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">Enroll Employees</h2>
              <p className="text-sm font-medium text-green-100 opacity-90">{seminarTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-1.5 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="p-5 border-b border-gray-100 space-y-4">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, position, or department..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div className="relative w-64">
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full appearance-none pl-4 pr-10 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
              >
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-2.5 w-5 h-5 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-semibold text-gray-500 uppercase tracking-wider text-xs">Enroll As:</span>
              <button
                onClick={() => setEnrollAs('Confirmed')}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                  enrollAs === 'Confirmed'
                    ? 'bg-[#00a650] text-white shadow-sm'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Confirmed
              </button>
              <button
                onClick={() => setEnrollAs('Pending')}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                  enrollAs === 'Pending'
                    ? 'bg-[#00a650] text-white shadow-sm'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Pending
              </button>
            </div>
            <div className="text-sm text-gray-500">
              {filteredEmployees.length} available{' '}
              <button
                onClick={handleSelectAll}
                className="text-blue-600 font-semibold hover:underline ml-2"
              >
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          </div>
        </div>

        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-5 py-3 bg-gray-50/50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          <div className="col-span-6 flex items-center gap-4 pl-2">
            <div className="w-5" />
            EMPLOYEE
          </div>
          <div className="col-span-6">DEPARTMENT</div>
        </div>

        {/* Employee List */}
        <div className="overflow-y-auto flex-1 min-h-[300px]">
          {isLoading && (
            <div className="p-10 text-center text-gray-500 text-sm">Loading employees…</div>
          )}
          {!isLoading && fetchError && (
            <div className="p-10 text-center text-red-600 text-sm">
              Failed to load employees: {fetchError}
            </div>
          )}
          {!isLoading && !fetchError && filteredEmployees.map((emp) => (
            <div
              key={emp.id}
              className="grid grid-cols-12 gap-4 px-5 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors items-center cursor-pointer"
              onClick={() => toggleSelect(emp.id)}
            >
              <div className="col-span-6 flex items-center gap-4 pl-2">
                <input
                  type="checkbox"
                  checked={selectedIds.has(emp.id)}
                  onChange={() => {}}
                  className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                />
                <div>
                  <p className="font-semibold text-gray-900">{emp.name}</p>
                  <p className="text-sm text-gray-500">{emp.position}</p>
                </div>
              </div>
              <div className="col-span-6 flex items-center text-sm text-gray-600">
                <Building2 className="w-4 h-4 mr-2 text-gray-400" />
                {emp.department}
              </div>
            </div>
          ))}
          {!isLoading && !fetchError && filteredEmployees.length === 0 && (
            <div className="p-10 text-center text-gray-500">
              No employees found matching your filters.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-100 bg-white rounded-b-xl flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleEnroll}
            disabled={selectedIds.size === 0}
            className={`px-6 py-2 rounded-lg font-medium flex items-center transition-colors ${
              selectedIds.size > 0
                ? 'bg-[#0b8a36] hover:bg-[#09752d] text-white cursor-pointer'
                : 'bg-[#0b8a36] opacity-50 text-white cursor-not-allowed'
            }`}
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Enroll Employees {selectedIds.size > 0 && `(${selectedIds.size})`}
          </button>
        </div>
      </div>
    </div>
  );
};
