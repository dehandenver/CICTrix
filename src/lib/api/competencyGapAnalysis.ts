import { IPCRRatingRecord } from '../../modules/admin/pm/SummaryOfRatings';
import { supabase } from '../supabase';
import { PROFICIENCY_NUMERIC, type ProficiencyLevel } from './pmCompetency';

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

// 1b. the Competency Map, keyed by `${positionTitle}|${competencyId}` → level.
// The PM Competency Map (position_competency_requirements) is the single source
// of truth for which competencies apply to a position and at what required
// level. We read it live so future PM edits flow straight into the gap analysis.
async function getRequiredLevelMap(): Promise<Map<string, ProficiencyLevel>> {
  const { data, error } = await supabase
    .from('position_competency_requirements')
    .select('position_title, competency_id, proficiency_level');

  if (error) {
    console.error('Error fetching position_competency_requirements:', error);
    throw error;
  }

  const map = new Map<string, ProficiencyLevel>();
  (data || []).forEach((r: any) => {
    const position = String(r?.position_title ?? '').trim().toLowerCase();
    const competencyId = Number(r?.competency_id);
    if (!position || !Number.isFinite(competencyId)) return;
    map.set(`${position}|${competencyId}`, r.proficiency_level as ProficiencyLevel);
  });
  return map;
}

// 2. aggregator — one IPCRRatingRecord per employee, ready for SoR
export async function getIPCRRecordsFromGapView(period: string): Promise<IPCRRatingRecord[]> {
  const [raw, requiredLevels] = await Promise.all([
    getGapAnalysisRows(),
    getRequiredLevelMap(),
  ]);

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

    // Headline IPCR score averages ALL rated competencies — it must not shift
    // just because a competency isn't in the Competency Map, so compute it
    // before filtering the breakdown below.
    const sum = empRows.reduce((acc, r) => acc + (r.possessed_proficiency || 0), 0);
    const avg = sum / empRows.length;

    const positionKey = String(firstRow.position ?? '').trim().toLowerCase();

    // Competency breakdown, reconciled against the Competency Map:
    //   - Required comes from the Map (Basic/Intermediate/Advanced → 3/4/5), NOT
    //     from the view's required_proficiency.
    //   - A competency with no Map row for this position is DROPPED — the Map is
    //     the single source of truth for what applies. (After the reconciliation
    //     backfill nothing drops; this is the going-forward rule for when a PM
    //     removes a competency from a position.)
    //   - isGap is recomputed here so it always reflects the Map's bar.
    const competencies = empRows
      .map(r => {
        const level = requiredLevels.get(`${positionKey}|${Number(r.competency_id)}`);
        if (!level) return null;
        const possessed = Number(r.possessed_proficiency) || 0;
        const required = PROFICIENCY_NUMERIC[level];
        return {
          name: r.mapped_competency_standard,
          possessed,
          required,
          isGap: possessed < required,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    // Any Map-defined competency the employee falls short on.
    const needsTraining = competencies.some(c => c.isGap);

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