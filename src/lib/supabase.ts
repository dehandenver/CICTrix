import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';
import { mockDatabase } from './mockDatabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Check if we're in mock mode (no Supabase credentials)
const isMockMode = !supabaseUrl || !supabaseAnonKey;

if (isMockMode) {
  console.warn('⚠️ Running in MOCK MODE - using localStorage. Data will not persist across browsers.');
}

export const supabase = isMockMode 
  ? (mockDatabase as any)
  : createClient<Database>(supabaseUrl, supabaseAnonKey);

export const isMockModeEnabled = isMockMode;

// Storage bucket name for applicant attachments
export const ATTACHMENTS_BUCKET = 'applicant-attachments';
