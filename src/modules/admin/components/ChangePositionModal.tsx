import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface Employee {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  position: string;
  department: string;
  status: string;
  [key: string]: any;
}

interface Props {
  employee: Employee;
  onClose: () => void;
  onSuccess: () => void;
}

type ChangeType = 'promotion' | 'succession' | 'transfer';

export default function ChangePositionModal({ employee, onClose, onSuccess }: Props) {
  const [changeType, setChangeType] = useState<ChangeType>('promotion');
  const [newDepartment, setNewDepartment] = useState(employee.department);
  const [newPosition, setNewPosition] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<string[]>([]);
  const [positions, setPositions] = useState<string[]>([]);

  useEffect(() => {
    fetchDepartments();
    fetchPositions();
  }, []);

  useEffect(() => {
    if (newDepartment !== employee.department) {
      fetchPositions();
    }
  }, [newDepartment]);

  const fetchDepartments = async () => {
    try {
      // Get departments from both employees and applicants tables
      const [empData, appData] = await Promise.all([
        supabase
          .from('employees')
          .select('department')
          .eq('status', 'Active')
          .neq('department', null)
          .catch(() => ({ data: [] })),
        supabase
          .from('applicants')
          .select('office')
          .eq('status', 'Hired')
          .neq('office', null)
          .catch(() => ({ data: [] })),
      ]);

      const allDepts = [
        ...(empData?.data?.map((e) => e.department) || []),
        ...(appData?.data?.map((a) => a.office) || []),
      ];
      
      const uniqueDepts = Array.from(new Set(allDepts)).sort();
      setDepartments(uniqueDepts);
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  const fetchPositions = async () => {
    try {
      // Get positions from both employees and applicants tables for the selected department
      const [empData, appData] = await Promise.all([
        supabase
          .from('employees')
          .select('position')
          .eq('department', newDepartment)
          .eq('status', 'Active')
          .neq('position', null)
          .catch(() => ({ data: [] })),
        supabase
          .from('applicants')
          .select('position')
          .eq('office', newDepartment)
          .eq('status', 'Hired')
          .neq('position', null)
          .catch(() => ({ data: [] })),
      ]);

      const allPositions = [
        ...(empData?.data?.map((e) => e.position) || []),
        ...(appData?.data?.map((a) => a.position) || []),
      ];
      
      const uniquePositions = Array.from(new Set(allPositions)).sort();
      setPositions(uniquePositions);
      setNewPosition('');
    } catch (error) {
      console.error('Error fetching positions:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPosition || !effectiveDate) {
      alert('Please fill in all required fields');
      return;
    }

    setLoading(true);

    try {
      const isNewlyHiredApplicant = employee.id.startsWith('applicant-');

      if (isNewlyHiredApplicant) {
        // For newly hired applicants, update the applicants table
        const applicantId = employee.id.replace('applicant-', '');
        const { error: updateError } = await supabase
          .from('applicants')
          .update({
            position: newPosition,
            office: newDepartment,
            updated_at: new Date().toISOString(),
          })
          .eq('id', applicantId);

        if (updateError) throw updateError;

        alert(`${changeType.charAt(0).toUpperCase() + changeType.slice(1)} successful!`);
      } else {
        // For established employees, update the employees table
        // Note: This requires the employees table to be deployed in Supabase
        const { error: updateError } = await supabase
          .from('employees')
          .update({
            position: newPosition,
            department: newDepartment,
            modified_at: new Date().toISOString(),
          })
          .eq('id', employee.id);

        if (updateError) {
          // Fallback: if employees table doesn't exist, notify user
          console.error('Update error:', updateError);
          alert('Employee records table not yet available. Position changes will be available after system upgrade.');
          onClose();
          return;
        }

        // 2. Log the change in employee_history
        try {
          await supabase
            .from('employee_history')
            .insert({
              employee_id: employee.id,
              action:
                changeType === 'promotion'
                  ? 'promoted'
                  : changeType === 'succession'
                    ? 'transferred'
                    : 'transferred',
              field_changed: 'position,department',
              old_value: `${employee.position} - ${employee.department}`,
              new_value: `${newPosition} - ${newDepartment}`,
              effective_date: effectiveDate,
              reason: notes,
              performed_by: '00000000-0000-0000-0000-000000000000',
              performed_at: new Date().toISOString(),
            });
        } catch (historyError) {
          console.warn('Could not log history:', historyError);
          // Continue anyway - history logging is non-critical
        }

        alert(`${changeType.charAt(0).toUpperCase() + changeType.slice(1)} successful!`);
      }

      onSuccess();
    } catch (error) {
      console.error('Error applying position change:', error);
      alert('Failed to apply position change. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Change Position</h2>
            <p className="text-sm text-gray-600 mt-1">Update position for {employee.first_name} {employee.last_name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={loading}
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Current Position Display */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Current Position</label>
                <p className="text-gray-900 font-medium">{employee.position}</p>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Current Department</label>
                <p className="text-gray-900 font-medium">{employee.department}</p>
              </div>
            </div>
          </div>

          {/* Change Type Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-3">Change Type *</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setChangeType('promotion')}
                className={`p-4 border-2 rounded-lg transition-all flex flex-col items-center gap-2 ${
                  changeType === 'promotion'
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-2xl">↑</span>
                <span className={changeType === 'promotion' ? 'text-blue-600 font-semibold' : 'text-gray-700'}>
                  Promotion
                </span>
              </button>

              <button
                type="button"
                onClick={() => setChangeType('succession')}
                className={`p-4 border-2 rounded-lg transition-all flex flex-col items-center gap-2 ${
                  changeType === 'succession'
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-2xl">👥</span>
                <span className={changeType === 'succession' ? 'text-blue-600 font-semibold' : 'text-gray-700'}>
                  Succession
                </span>
              </button>

              <button
                type="button"
                onClick={() => setChangeType('transfer')}
                className={`p-4 border-2 rounded-lg transition-all flex flex-col items-center gap-2 ${
                  changeType === 'transfer'
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-2xl">↔️</span>
                <span className={changeType === 'transfer' ? 'text-blue-600 font-semibold' : 'text-gray-700'}>
                  Transfer
                </span>
              </button>
            </div>
          </div>

          {/* New Department */}
          <div>
            <label htmlFor="department" className="block text-sm font-semibold text-gray-900 mb-2">
              New Department *
            </label>
            <select
              id="department"
              value={newDepartment}
              onChange={(e) => setNewDepartment(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          {/* New Position */}
          <div>
            <label htmlFor="position" className="block text-sm font-semibold text-gray-900 mb-2">
              New Position *
            </label>
            <select
              id="position"
              value={newPosition}
              onChange={(e) => setNewPosition(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select a position</option>
              {positions.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>
          </div>

          {/* Effective Date */}
          <div>
            <label htmlFor="effectiveDate" className="block text-sm font-semibold text-gray-900 mb-2">
              Effective Date *
            </label>
            <input
              id="effectiveDate"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Notes / Justification */}
          <div>
            <label htmlFor="notes" className="block text-sm font-semibold text-gray-900 mb-2">
              Notes / Justification
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter any additional notes or justification for this position change..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={4}
            />
          </div>

          {/* Warning Note */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> This action will update the employee's position and department. All related records
              will be updated accordingly. Make sure to verify all information before submitting.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 justify-end pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Applying...
                </>
              ) : (
                'Apply Position Change'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
