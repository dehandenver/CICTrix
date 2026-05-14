import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
(async () => {
    const { data: jp, error: err1 } = await supabase.from('job_postings').select('*');
    const { data: j, error: err2 } = await supabase.from('jobs').select('*');
    if (err1) console.error('job_postings error', err1);
    if (err2) console.error('jobs error', err2);
    console.log('jobs table length:', j?.length);
    console.log('Teacher in job_postings:', jp?.find(x => x.title.includes('Teacher')));
    console.log('Teacher in jobs:', j?.find(x => x.title.includes('Teacher')));

    const { error: upsertErr } = await supabase.from('job_postings').upsert([{
        id: '2c5a04eb-0e10-4cd7-9556-3c0f4f9f75ec', 
        title: 'Teacher III',
        item_number: 'TEACHER-888',
        department: 'Operations',
        office: 'Operations',
        status: 'Open'
    }]);
    console.log('Test upsert:', upsertErr);

})();
