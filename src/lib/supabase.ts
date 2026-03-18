import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Mock mode flag - disabled by default, can be enabled via env var
export const isMockModeEnabled = import.meta.env.VITE_MOCK_MODE_ENABLED === 'true';

// Supabase is required - fail fast if credentials are missing
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'FATAL: Supabase credentials are not configured!\n' +
    'Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.\n' +
    'Add the following to src/.env or .env.local:\n' +
    'VITE_SUPABASE_URL=your_supabase_url\n' +
    'VITE_SUPABASE_ANON_KEY=your_supabase_anon_key'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

// Storage bucket name for applicant attachments
export const ATTACHMENTS_BUCKET = 'applicant-attachments';
