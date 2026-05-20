import { supabase } from '../supabase';

export type TrainingProgram = {
  id: string;
  name: string;
  category: 'Leadership' | 'Technical' | 'Soft Skills' | 'Compliance';
  description: string | null;
  status: 'Active' | 'Draft' | 'Archived';
  created_at: string;
};

export async function getActivePrograms() {
  const { data, error } = await supabase
    .from('training_programs')
    .select('*')
    .eq('status', 'Active')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching active training programs:', error);
    return [];
  }
  return data as TrainingProgram[];
}

export async function getTopProgramsByEnrollment(limit: number = 5) {
  // A true implementation might aggregate training_enrollments,
  // but we can join or fetch and process in JS for now.
  // We fetch programs and join sessions + enrollments, then count.
  const { data: programs, error: pError } = await supabase
    .from('training_programs')
    .select('*, training_sessions(training_enrollments(id))')
    .eq('status', 'Active');

  if (pError) {
    console.error('Error fetching top training programs:', pError);
    return [];
  }

  // Calculate enrollment counts
  const programCounts = programs.map((p: any) => {
    let enrollmentCount = 0;
    if (p.training_sessions) {
      p.training_sessions.forEach((s: any) => {
        if (s.training_enrollments) {
          enrollmentCount += s.training_enrollments.length;
        }
      });
    }
    return {
      id: p.id,
      title: p.name,
      rating: (4 + Math.random()).toFixed(1), // Mock rating since schema has no reviews yet
      completionRate: Math.floor(70 + Math.random() * 30), // Mock completion rate
      participants: enrollmentCount,
    };
  });

  programCounts.sort((a, b) => b.participants - a.participants);

  return programCounts.slice(0, limit);
}
