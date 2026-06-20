export interface SystemLog {
  id: string;
  timestamp: string;
  message: string;
  errorDetails?: string;
  context?: string;
}

/**
 * Logs a technical system error for administrator review, storing it in localStorage
 * and logging it to the console, while keeping user-facing text clean and friendly.
 */
export const logErrorForAdmin = (message: string, error?: any, context?: string) => {
  const logEntry: SystemLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    message,
    errorDetails: error instanceof Error 
      ? `${error.name}: ${error.message}\nStack: ${error.stack || ''}` 
      : typeof error === 'object' 
        ? JSON.stringify(error) 
        : String(error || ''),
    context: context || 'General',
  };

  // Safe developer logging
  console.error(`[ADMIN LOG] [${logEntry.context}] ${message}`, error);

  try {
    const existingLogsRaw = localStorage.getItem('cictrix_error_logs');
    const existingLogs = existingLogsRaw ? JSON.parse(existingLogsRaw) : [];
    
    // Store the last 100 log entries
    const updatedLogs = [logEntry, ...existingLogs].slice(0, 100);
    localStorage.setItem('cictrix_error_logs', JSON.stringify(updatedLogs));
  } catch (e) {
    console.warn('Failed to save log entry to localStorage:', e);
  }
};
