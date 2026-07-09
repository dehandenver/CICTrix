import { Info } from 'lucide-react';
import type { ActorRole } from '../../../lib/api/trainingPipeline';

/**
 * Temporary stand-in for real account switching.
 *
 * The Training Courses and Seminar Enrollment flows both hand work back and
 * forth between L&D and the Dept Head, and the Dept Head's permissions differ
 * (most importantly: they cannot remove attendees from a draft-originated
 * roster). Until the cross-cutting "account switching for dual-role users"
 * feature lands and the Dept Head half moves into the Office Account Console at
 * /office/dashboard, this switch lets one operator exercise both sides.
 *
 * Replace this with the real session role once account switching exists.
 */
export const ActorRoleSwitch = ({
  value,
  onChange,
}: {
  value: ActorRole;
  onChange: (role: ActorRole) => void;
}) => {
  const options: { role: ActorRole; label: string }[] = [
    { role: 'LND', label: 'L&D' },
    { role: 'DeptHead', label: 'Dept Head' },
  ];

  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-flex items-center gap-1 text-xs text-gray-400"
        title="Temporary: stands in for real account switching."
      >
        <Info className="h-3.5 w-3.5" />
        Acting as
      </span>
      <div className="flex rounded-lg border border-gray-300 bg-white p-0.5">
        {options.map(({ role, label }) => (
          <button
            key={role}
            type="button"
            onClick={() => onChange(role)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              value === role ? 'bg-slate-800 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
};
