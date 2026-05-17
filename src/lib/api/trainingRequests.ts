import { supabase } from '../supabase';

export type TrainingRequest = {
  id: string;
  employee_id: string;
  program_id: string | null;
  title: string;
  justification: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  employees?: { full_name: string; current_position: string; department: string };
  training_programs?: { name: string };
};

export async function getTrainingRequests() {
  const { data, error } = await supabase
    .from('training_requests')
    .select('*, employees(full_name, current_position, department), training_programs(name)')
    .order('requested_at', { ascending: false });

  if (error) {
    console.error('Error fetching training requests:', error);
    return [];
  }

  return data.map((r: any) => ({
    id: r.id,
    employee: r.employees?.full_name ?? 'Unknown',
    position: r.employees?.current_position ?? 'Unknown',
    department: r.employees?.department ?? 'Unknown',
    requestedTraining: r.training_programs?.name ?? r.title,
    dateRequested: new Date(r.requested_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    status: r.status,
  }));
}

export function summarizeByStatus(rows: any[]) {
  const counts = { pending: 0, approved: 0, rejected: 0 };
  rows.forEach(r => {
    if (r.status === 'pending') counts.pending++;
    if (r.status === 'approved') counts.approved++;
    if (r.status === 'rejected') counts.rejected++;
  });
  return counts;
}
