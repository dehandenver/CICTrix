import { ShieldAlert } from 'lucide-react';

/**
 * Shown wherever work is blocked because an office has no active Dept Head.
 *
 * Mirrors the /office/dashboard denial screen: never render a blank surface for
 * a permission or data gap — say what is missing, and where it gets fixed. With
 * no DeptHead assigned, a draft targeting this office can never leave
 * "Sent to Dept Head", and a plan entry can never be promoted into one.
 */
export const NoDeptHeadNotice = ({
  departmentName,
  context,
  className = '',
}: {
  departmentName: string | null;
  /** What specifically cannot proceed, e.g. "This draft cannot be reviewed". */
  context: string;
  className?: string;
}) => (
  <div className={`flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 ${className}`}>
    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
    <div className="min-w-0">
      <p className="text-sm font-semibold text-amber-900">
        No Department Head assigned{departmentName ? ` for ${departmentName}` : ' for this office'}
      </p>
      <p className="mt-0.5 text-sm text-amber-800">{context}</p>
      <p className="mt-1.5 text-xs text-amber-700">
        A Department Head is granted in Access &amp; Role Management, not by job title. Assign one for
        this office, then return here.
      </p>
    </div>
  </div>
);
