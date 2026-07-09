import { supabase } from '../supabase';

export type TrainingSession = {
  id: string;
  program_id: string;
  title: string;
  scheduled_date: string;
  capacity: number;
  location: string | null;
  status: 'Scheduled' | 'Ongoing' | 'Completed' | 'Cancelled';
  created_at: string;
  training_programs?: { name: string; category: string };
  training_enrollments?: { id: string }[];
};

export async function getUpcomingSessions(limit: number = 10) {
  const { data, error } = await supabase
    .from('training_sessions')
    .select('*, training_programs(name, category), training_enrollments(id)')
    .eq('status', 'Scheduled')
    .order('scheduled_date', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error fetching upcoming sessions:', error);
    return [];
  }

  return data.map((s: any) => ({
    id: s.id,
    title: s.title,
    date: new Date(s.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    participants: s.training_enrollments ? s.training_enrollments.length : 0,
    instructor: 'TBD', // Schema lacks instructor currently
  }));
}

export async function getMonthlySessionCounts(yearMonths: number = 12) {
  // We need to count completed sessions by month/category.
  // Instead of complex SQL, fetch the last 12 months of completed sessions.
  const dateThreshold = new Date();
  dateThreshold.setMonth(dateThreshold.getMonth() - yearMonths);

  const { data, error } = await supabase
    .from('training_sessions')
    .select('scheduled_date, training_programs(category)')
    .eq('status', 'Completed')
    .gte('scheduled_date', dateThreshold.toISOString());

  if (error) {
    console.error('Error fetching monthly session counts:', error);
    return [];
  }

  // Initialize data structure for Recharts
  const monthlyData: Record<string, { name: string; Leadership: number; Technical: number; SoftSkills: number; Compliance: number }> = {};
  
  // Create empty buckets for the last 12 months
  for (let i = yearMonths - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const monthKey = d.toLocaleString('en-US', { month: 'short' });
    monthlyData[monthKey] = {
      name: monthKey,
      Leadership: 0,
      Technical: 0,
      SoftSkills: 0,
      Compliance: 0,
    };
  }

  data.forEach((session: any) => {
    if (!session.training_programs) return;
    const date = new Date(session.scheduled_date);
    const monthKey = date.toLocaleString('en-US', { month: 'short' });
    if (monthlyData[monthKey]) {
      const cat = session.training_programs.category;
      if (cat === 'Leadership') monthlyData[monthKey].Leadership++;
      else if (cat === 'Technical') monthlyData[monthKey].Technical++;
      else if (cat === 'Soft Skills') monthlyData[monthKey].SoftSkills++;
      else if (cat === 'Compliance') monthlyData[monthKey].Compliance++;
    }
  });

  return Object.values(monthlyData);
}

export async function getTrainingEnrollments() {
  const { data, error } = await supabase
    .from('training_enrollments')
    .select('*');

  if (error) {
    console.error('Error fetching enrollments:', error);
    return [];
  }
  return data;
}
