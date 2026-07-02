import { supabase as supabaseClient } from '../supabase';

const supabase = supabaseClient as any;

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
  
  // New Columns
  category?: 'Cultural Transformation' | 'Employee Development' | 'Leadership' | 'Technical' | null;
  competency?: string | null;
  rationales?: string[] | null;
  current_proficiency?: number | null;
  desired_proficiency?: number | null;
  after_training_metric?: string | null;
  post_training_proficiency?: number | null;
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

// New database-driven functions for Module 2 Office Account Console
export async function listTrainingRequestsDetailed(): Promise<TrainingRequest[]> {
  const { data, error } = await supabase
    .from('training_requests')
    .select('*, employees(first_name, last_name, position, department), training_programs(name)')
    .order('requested_at', { ascending: false });

  if (error) {
    console.error('Error fetching detailed training requests:', error);
    return [];
  }

  return (data ?? []) as TrainingRequest[];
}

export async function createTrainingRequest(input: {
  employee_id: string;
  program_id?: string | null;
  title: string;
  category: 'Cultural Transformation' | 'Employee Development' | 'Leadership' | 'Technical';
  competency: string;
  rationales: string[];
  current_proficiency: number;
  desired_proficiency: number;
  after_training_metric: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('training_requests').insert([{
    employee_id: input.employee_id,
    program_id: input.program_id ?? null,
    title: input.title,
    justification: `Requested for ${input.competency} (Current: ${input.current_proficiency}, Target: ${input.desired_proficiency})`,
    category: input.category,
    competency: input.competency,
    rationales: input.rationales,
    current_proficiency: input.current_proficiency,
    desired_proficiency: input.desired_proficiency,
    after_training_metric: input.after_training_metric,
    status: 'pending',
    requested_at: new Date().toISOString(),
  }]);

  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function logPostTrainingProficiency(
  id: string,
  score: number
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('training_requests')
    .update({ post_training_proficiency: score })
    .eq('id', id);

  return error ? { ok: false, error: error.message } : { ok: true };
}
