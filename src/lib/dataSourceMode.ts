import { isMockModeEnabled } from './supabase';

export const getPreferredDataSourceMode = (): 'local' | 'supabase' => {
  if (isMockModeEnabled) return 'local';

  try {
    const mode = localStorage.getItem('cictrix_data_source_mode');
    if (mode === 'local' || mode === 'supabase') {
      return mode;
    }
  } catch {
    // Ignore storage access issues.
  }

  return 'supabase';
};