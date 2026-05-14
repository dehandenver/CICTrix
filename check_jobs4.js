import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const mapSupabaseStatusToJobPostingStatus = (raw) => {
  const v = String(raw ?? '').toLowerCase();
  if (v === 'closed') return 'Closed';
  if (v === 'on hold') return 'Draft';
  return 'Active';
};

(async () => {
    const { data: rows, error } = await supabase.from('job_postings').select('*');
    if (error) {
        console.error(error);
        return;
    }
    
    const mapped = rows.map((row) => ({
      id: String(row.id ?? ''),
      title: row.title || '',
      status: mapSupabaseStatusToJobPostingStatus(row.status),
    }));

    console.log(mapped.filter(j => j.status === 'Active').map(j => j.title));
})();
