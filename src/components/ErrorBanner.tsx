import { AlertTriangle, RefreshCw } from 'lucide-react';

import { friendlyError, type ErrorContext } from '../lib/friendlyErrors';

interface ErrorBannerProps {
  /**
   * The raw error. Passed through friendlyError() so the user never sees a
   * technical detail (a Postgres code, a stack, a column name) — those go to the
   * console for admin review instead.
   */
  error: unknown;
  /** Classifies the message when the caller already knows the cause. */
  context?: ErrorContext;
  /** Shows a Retry button when the caller can re-run the failed load. */
  onRetry?: () => void;
  className?: string;
}

/**
 * The one way this system reports a failed load or action to the user.
 *
 * Screens previously discarded query errors into an empty array, so a failed
 * fetch rendered as "0 employees" or an empty table — the screen stated
 * something false instead of admitting it couldn't load. Showing this banner
 * makes the difference between "there is no data" and "we couldn't read the
 * data" visible.
 */
export const ErrorBanner = ({ error, context, onRetry, className = '' }: ErrorBannerProps) => {
  if (!error) return null;

  return (
    <div
      role="alert"
      className={`flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 ${className}`}
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <p className="!mb-0 flex-1">{friendlyError(error, context)}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 transition"
        >
          <RefreshCw size={12} /> Retry
        </button>
      )}
    </div>
  );
};

export default ErrorBanner;
