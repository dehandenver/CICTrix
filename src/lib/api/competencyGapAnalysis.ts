import { IPCRRatingRecord } from '../../modules/admin/pm/SummaryOfRatings';
import { supabase } from '../supabase';

// Raw row shape mirroring the view
export interface GapAnalysisRow {
  employee_num: string;
  first_name: string;
  last_name: string;
  department: string;
  position_id: number;
  position: string;
  competency_id: number;
  mapped_competency_standard: string;
  training_stream: string;
  possessed_proficiency: number;
  required_proficiency: number;
  final_gap_indicator: number;
  training_needed: 'YES' | 'NO';
}

// 1. raw fetch — gives downstream code the full grid
export async function getGapAnalysisRows(): Promise<GapAnalysisRow[]> {
  const { data, error } = await supabase
    .from('v_competency_gap_analysis')
    .select('*');

  if (error) {
    console.error('Error fetching v_competency_gap_analysis:', error);
    throw error;
  }

  return (data || []) as GapAnalysisRow[];
}

// 2. aggregator — one IPCRRatingRecord per employee, ready for SoR
export async function getIPCRRecordsFromGapView(period: string): Promise<IPCRRatingRecord[]> {
  const raw = await getGapAnalysisRows();

  // The view aggregates `ipcr_performance` internally and doesn't expose
  // rating_period, so we can't scope it to the canonical semesters from here
  // (see src/lib/ipcrPeriods.ts). What we can do is drop rows carrying no real
  // rating: unrated placeholder records surface as 0/null possessed_proficiency
  // and would otherwise average straight into every employee's score, pulling
  // the Summary of Ratings down. Ratings are 1-5, so 0 always means "no data".
  const rows = (raw ?? []).filter(r => Number(r.possessed_proficiency) > 0);

  if (rows.length === 0) return [];

  // Group by employee
  const employeeGroups = new Map<string, GapAnalysisRow[]>();
  rows.forEach(row => {
    if (!employeeGroups.has(row.employee_num)) {
      employeeGroups.set(row.employee_num, []);
    }
    employeeGroups.get(row.employee_num)!.push(row);
  });

  const records: IPCRRatingRecord[] = [];

  for (const [employeeNum, empRows] of employeeGroups.entries()) {
    if (empRows.length === 0) continue;
    
    const firstRow = empRows[0];
    
    // Average possessed_proficiency
    const sum = empRows.reduce((acc, r) => acc + (r.possessed_proficiency || 0), 0);
    const avg = sum / empRows.length;
    
    // Check if any row needs training
    const needsTraining = empRows.some(r => r.training_needed === 'YES');

    // Extract competency breakdowns
    const competencies = empRows.map(r => ({
      name: r.mapped_competency_standard,
      possessed: Number(r.possessed_proficiency) || 0,
      required: Number(r.required_proficiency) || 0,
      isGap: r.training_needed === 'YES',
    }));

    records.push({
      id: employeeNum,
      department: firstRow.department,
      name: `${firstRow.last_name}, ${firstRow.first_name}`,
      position: firstRow.position,
      period,
      numericalRating: avg,
      remarks: needsTraining ? 'Training Recommended' : '',
      submissionStatus: 'SUBMITTED',
      competencies
    });
  }

  return records;
}