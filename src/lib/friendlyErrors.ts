// Centralized friendly-error helper.
//
// Spec (Error Handling → User-Friendly Error Messages):
// "Implement proper error handling throughout the system. Errors should be
//  displayed clearly, not expose technical system details, and be logged for
//  administrator review."
//
// Call sites pass the raw error + the operation context (e.g. 'upload',
// 'validation', 'unauthorized', 'server'). The helper returns a friendly,
// human-readable message and writes the raw error to the console for the
// admin/devtools log.

export type ErrorContext =
  | 'server'
  | 'upload'
  | 'validation'
  | 'unauthorized'
  | 'network'
  | 'not-found'
  | 'generic';

const SPEC_MESSAGES: Record<ErrorContext, string> = {
  server: 'The server is currently unavailable. Please try again later.',
  upload: 'File upload failed. Please check your internet connection and try again.',
  validation: 'Please complete all required fields before proceeding.',
  unauthorized: 'You do not have permission to access this page.',
  network: 'Network connection lost. Please check your internet and retry.',
  'not-found': 'We could not find what you were looking for.',
  generic: 'Something went wrong. Please try again — if the problem persists, contact your administrator.',
};

// Lightweight heuristic when the caller hasn't classified the error.
const inferContext = (error: unknown): ErrorContext => {
  const message = String((error as { message?: unknown })?.message ?? error ?? '').toLowerCase();
  const status = Number((error as { status?: unknown })?.status ?? 0);

  if (status === 401 || status === 403 || message.includes('unauthor') || message.includes('forbidden')) {
    return 'unauthorized';
  }
  if (status === 404 || message.includes('not found')) return 'not-found';
  if (status >= 500 || message.includes('internal server') || message.includes('service unavailable')) {
    return 'server';
  }
  if (message.includes('failed to fetch') || message.includes('networkerror') || message.includes('network')) {
    return 'network';
  }
  if (message.includes('upload') || message.includes('storage') || message.includes('bucket')) {
    return 'upload';
  }
  if (message.includes('required') || message.includes('must be') || message.includes('invalid')) {
    return 'validation';
  }
  return 'generic';
};

/**
 * Translate a raw error into a friendly, spec-approved message and log the
 * underlying detail for admin/devtools review. Never returns the raw message.
 */
export const friendlyError = (
  error: unknown,
  context?: ErrorContext,
): string => {
  const resolved: ErrorContext = context ?? inferContext(error);
  const friendly = SPEC_MESSAGES[resolved];

  // Admin-side log: keep the raw detail so engineering can diagnose, but the
  // applicant only ever sees `friendly`.
  if (typeof console !== 'undefined') {
    console.error(`[friendlyError:${resolved}]`, error);
  }

  return friendly;
};

/**
 * Convenience selector for spec-quoted strings without going through the
 * inference layer — useful when the call site already knows the context.
 */
export const friendlyMessage = (context: ErrorContext): string => SPEC_MESSAGES[context];
