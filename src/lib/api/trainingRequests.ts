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
  employees?: { first_name: string | null; last_name: string | null; position: string | null; department: string | null };
  training_programs?: { name: string };
};

export async function getTrainingRequests() {
  const { data, error } = await supabase
    .from('training_requests')
    .select('*, employees(first_name, last_name, position, department), training_programs(name)')
    .order('requested_at', { ascending: false });

  if (error) {
    console.error('Error fetching training requests:', error);
    return [];
  }

  return data.map((r: any) => {
    const fullName = [r.employees?.first_name, r.employees?.last_name].filter(Boolean).join(' ').trim();
    return {
      id: r.id,
      employee: fullName || 'Unknown',
      position: r.employees?.position ?? 'Unknown',
      department: r.employees?.department ?? 'Unknown',
      requestedTraining: r.training_programs?.name ?? r.title,
      dateRequested: new Date(r.requested_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      status: r.status,
    };
  });
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
