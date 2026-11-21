import { supabase as supabaseClient } from '../supabase';
import {
  evaluateSuccessionV2,
  rankSuccessionV2,
  PositionRequirementsV2,
  SuccessionV2Input,
  SuccessionV2Result,
  RankedSuccessionV2Result,
  ReviewedWorkV2,
  ReviewedTrainingV2,
  ReviewedEducationV2,
  ReviewedEligibilityV2,
  CanonicalDegreeV2,
  ProfessionalDegreeV2,
} from './successionScoringV2';
import {
  fetchSuccessionReviews,
  organizeReviewsByEmployee,
  isReviewStale,
  SuccessionEvidenceReview,
} from './successionReviews';
import {
  canonicalEligibilityTypeName,
  isDownwardTitleMove,
  resolveRecognizedEligibility,
} from './successionDiscovery';
import { getLatestOverallScores } from './succession';

export interface CandidateCompetencyItemV2 {
  name: string;
  met: boolean;
  satisfiedBy: string | null;
}

export interface CandidateEligibilityDetailV2 {
  recognized: string[];
  expired: string[];
  unrecognized: string[];
}

export interface CandidateMetaV2 {
  presentPosition: string | null;
  department: string | null;
  ipcrPeriod: string | null;
  ipcrAdjectival: string | null;
  experienceUsedTenureFallback: boolean;
  eligibilityDetail: CandidateEligibilityDetailV2;
  competencyBreakdown: CandidateCompetencyItemV2[];
  gapAnalysis: string[];
  requiredActions: string[];
  timeline: string | null;
}

export interface SuccessionPoolV2 {
  positionId: string;
  scoringDate: string;
  requirements: PositionRequirementsV2;
  ranked: RankedSuccessionV2Result[];
  needsReview: SuccessionV2Result[];
  configurationNeeded: SuccessionV2Result[];
  excluded: SuccessionV2Result[];
  downwardMovesExcluded: number;
  candidateMeta: Record<string, CandidateMetaV2>;
}

const MONTHS_PER_MISSING_COMPETENCY = 6;
const TRAINING_TAG_CHUNK_SIZE = 200;

export function parsePositionRequirementsV2(pos: {
  min_years_experience?: number | null;
  required_training_hours?: number | null;
  required_education?: string | null;
  required_eligibility?: string | null;
}): PositionRequirementsV2 {
  let education: PositionRequirementsV2['education'] = null;
  if (pos.required_education && pos.required_education.trim()) {
    const raw = pos.required_education.toLowerCase();
    let minimum: CanonicalDegreeV2 = 'bachelor';
    if (raw.includes('doctor') || raw.includes('phd')) minimum = 'doctorate';
    else if (raw.includes('master')) minimum = 'master';
    else minimum = 'bachelor';

    const field =
      pos.required_education
        .replace(
          /^(bachelor'?s?\s*(degree\s*(in\s*)?)?|master'?s?\s*(degree\s*(in\s*)?)?|doctorate\s*(degree\s*(in\s*)?)?|doctor of\s*|degree in\s*)/i,
          '',
        )
        .trim() || 'Any relevant field';

    education = { minimum, field };
  }

  let eligibility: PositionRequirementsV2['eligibility'] = null;
  if (pos.required_eligibility !== undefined && pos.required_eligibility !== null) {
    const raw = pos.required_eligibility.trim().toLowerCase();
    if (raw === '' || raw === 'none' || raw === 'none required') {
      eligibility = { kind: 'none' };
    } else {
      eligibility = { kind: 'required', key: pos.required_eligibility.trim() };
    }
  }

  return {
    experienceYears: pos.min_years_experience ?? null,
    trainingHours: pos.required_training_hours ?? null,
    education,
    eligibility,
  };
}

export function normalizeDegree(
  level?: string | null,
  course?: string | null,
): CanonicalDegreeV2 | ProfessionalDegreeV2 {
  const combined = `${level ?? ''} ${course ?? ''}`.trim();
  const upper = combined.toUpperCase();

  if (/\bMD\b/.test(upper)) return 'MD';
  if (/\bDMD\b/.test(upper)) return 'DMD';
  if (/\bJD\b/.test(upper)) return 'JD';
  if (/\bLLB\b/.test(upper)) return 'LLB';
  if (/\bLLM\b/.test(upper)) return 'LLM';

  const lower = combined.toLowerCase();
  if (lower.includes('doctor') || lower.includes('phd')) return 'doctorate';
  if (
    lower.includes('master') ||
    lower.includes('post graduate') ||
    lower.includes('post-graduate')
  ) {
    return 'master';
  }
  return 'bachelor';
}

function formatDate(isoOrDate: string | null | undefined): string | null {
  if (!isoOrDate) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(isoOrDate);
  return match ? match[1] : null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function groupByEmployee(rows: any[]): Map<string, any[]> {
  const map = new Map<string, any[]>();
  for (const row of rows) {
    const key = String(row.employee_id);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

interface CandidateDraft {
  employeeId: string;
  name: string;
  manuallyNominated: boolean;
  presentPosition: string | null;
  department: string | null;
  dateHired: string | null;
  highestEducation: string | null;
  eligibility: string | null;
}

/**
 * Batch-loads and evaluates V2 succession pools for one or more critical positions.
 */
export async function fetchSuccessionPoolsV2(
  criticalPositionIds: string[],
  scoringDate: string = new Date().toISOString().slice(0, 10),
): Promise<Map<string, SuccessionPoolV2>> {
  const ids = [...new Set(criticalPositionIds)].filter(Boolean);
  const pools = new Map<string, SuccessionPoolV2>();
  if (!ids.length) return pools;

  // 1. Batch-fetch critical positions
  const posRes = await (supabaseClient as any)
    .from('critical_positions')
    .select(
      'id, title, department_id, required_education, required_eligibility, min_years_experience, required_training_hours, incumbent_employee_id',
    )
    .in('id', ids);

  if (posRes?.error) {
    throw new Error(`Failed to load critical positions: ${posRes.error.message}`);
  }

  const posById = new Map<string, any>();
  for (const row of (posRes?.data ?? []) as any[]) {
    posById.set(String(row.id), row);
  }

  const foundIds = ids.filter((id) => posById.has(id));
  if (!foundIds.length) return pools;

  // 2. Resolve departments for all found positions
  const departmentIds = [
    ...new Set(
      foundIds
        .map((id) => posById.get(id)?.department_id)
        .filter(Boolean)
        .map(String),
    ),
  ];

  const deptNameById = new Map<string, string>();
  if (departmentIds.length > 0) {
    const deptRes = await (supabaseClient as any)
      .from('departments')
      .select('id, name')
      .in('id', departmentIds);

    if (deptRes?.error) {
      throw new Error(`Failed to load departments: ${deptRes.error.message}`);
    }
    for (const d of (deptRes?.data ?? []) as any[]) {
      deptNameById.set(String(d.id), String(d.name ?? '').trim());
    }
  }

  const deptNames = [...new Set([...deptNameById.values()].filter(Boolean))];

  // 3. Batch-fetch manual nominees, active department employees, competency reqs,
  //    eligibility catalog, and per-position evidence reviews in parallel.
  const [manualRes, deptEmpsRes, compReqRes, eligTypesRes, reviewsEntries] = await Promise.all([
    (supabaseClient as any)
      .from('succession_candidates')
      .select('id, critical_position_id, employee_id, note')
      .in('critical_position_id', foundIds),
    deptNames.length > 0
      ? (supabaseClient as any)
          .from('employees')
          .select(
            'id, first_name, last_name, position, department, employment_status, date_hired, highest_educational_attainment, eligibility',
          )
          .in('department', deptNames)
          .eq('status', 'Active')
      : Promise.resolve({ data: [], error: null }),
    (supabaseClient as any)
      .from('critical_position_competency_requirements')
      .select('critical_position_id, competency_id, competencies ( name )')
      .in('critical_position_id', foundIds),
    (supabaseClient as any).from('eligibility_types').select('name, is_active'),
    Promise.all(
      foundIds.map(async (pid) => [pid, await fetchSuccessionReviews(pid)] as const),
    ),
  ]);

  if (manualRes?.error) {
    throw new Error(`Failed to load succession candidates: ${manualRes.error.message}`);
  }
  if (deptEmpsRes?.error) {
    throw new Error(`Failed to load department employees: ${deptEmpsRes.error.message}`);
  }
  if (compReqRes?.error) {
    throw new Error(`Failed to load competency requirements: ${compReqRes.error.message}`);
  }
  if (eligTypesRes?.error) {
    throw new Error(`Failed to load eligibility types: ${eligTypesRes.error.message}`);
  }

  const manualRows = (manualRes?.data ?? []) as any[];
  const deptEmps = (deptEmpsRes?.data ?? []) as any[];
  const compReqRows = (compReqRes?.data ?? []) as any[];
  const eligTypeRows = Array.isArray(eligTypesRes?.data) ? (eligTypesRes.data as any[]) : [];
  const reviewsByPos = new Map<string, SuccessionEvidenceReview[]>(reviewsEntries);

  // Build active eligibility catalog; only enforce strict catalog rejection when
  // eligibility_types returned at least one row.
  const hasEligibilityCatalog = eligTypeRows.length > 0;
  const activeTypeNames = new Set<string>(
    eligTypeRows
      .filter((r) => r.is_active !== false)
      .map((r) => String(r.name ?? '').trim().toLowerCase())
      .filter(Boolean),
  );
  const resolveElig = (raw: string): { recognized: boolean; canonicalName: string } => {
    if (!hasEligibilityCatalog) {
      const canonicalName = canonicalEligibilityTypeName(raw);
      return { recognized: Boolean(canonicalName), canonicalName };
    }
    return resolveRecognizedEligibility(raw, activeTypeNames);
  };

  // Fallback competency name lookup if embedded `competencies(name)` was absent
  const missingCompNameIds = [
    ...new Set(
      compReqRows
        .filter((r) => {
          const embedded = Array.isArray(r.competencies)
            ? r.competencies[0]?.name
            : r.competencies?.name;
          return !embedded && r.competency_id;
        })
        .map((r) => String(r.competency_id)),
    ),
  ];
  const compNameById = new Map<string, string>();
  if (missingCompNameIds.length > 0) {
    const compRes = await (supabaseClient as any)
      .from('competencies')
      .select('id, name')
      .in('id', missingCompNameIds);
    if (compRes?.error) {
      throw new Error(`Failed to load competencies: ${compRes.error.message}`);
    }
    for (const c of (compRes?.data ?? []) as any[]) {
      if (c?.id && c?.name) compNameById.set(String(c.id), String(c.name));
    }
  }

  const requiredCompetenciesByPos = new Map<string, { id: string; name: string }[]>();
  const seenCompByPos = new Map<string, Set<string>>();
  for (const r of compReqRows) {
    const pid = String(r.critical_position_id);
    const cid = String(r.competency_id ?? '');
    if (!cid) continue;
    if (!seenCompByPos.has(pid)) seenCompByPos.set(pid, new Set());
    const seen = seenCompByPos.get(pid)!;
    if (seen.has(cid)) continue;
    seen.add(cid);
    const embeddedName = Array.isArray(r.competencies)
      ? r.competencies[0]?.name
      : r.competencies?.name;
    const name = String(embeddedName ?? compNameById.get(cid) ?? 'Unknown');
    const list = requiredCompetenciesByPos.get(pid) ?? [];
    list.push({ id: cid, name });
    requiredCompetenciesByPos.set(pid, list);
  }

  // Index employees and fetch any manual nominations outside the department query
  const employeeById = new Map<string, any>();
  for (const e of deptEmps) {
    employeeById.set(String(e.id), e);
  }

  const manualByPos = new Map<string, any[]>();
  for (const m of manualRows) {
    const pid = String(m.critical_position_id);
    const list = manualByPos.get(pid) ?? [];
    list.push(m);
    manualByPos.set(pid, list);
  }

  const missingManualIds = [
    ...new Set(
      manualRows
        .map((m) => String(m.employee_id))
        .filter((id) => id && !employeeById.has(id)),
    ),
  ];

  if (missingManualIds.length > 0) {
    const manualEmpRes = await (supabaseClient as any)
      .from('employees')
      .select(
        'id, first_name, last_name, position, department, employment_status, date_hired, highest_educational_attainment, eligibility',
      )
      .in('id', missingManualIds);

    if (manualEmpRes?.error) {
      throw new Error(
        `Failed to load manually nominated employees: ${manualEmpRes.error.message}`,
      );
    }
    for (const e of (manualEmpRes?.data ?? []) as any[]) {
      employeeById.set(String(e.id), e);
    }
  }

  // 4. Discover candidates per position (recording downward moves excluded)
  const positionPrep = new Map<
    string,
    {
      posRow: any;
      requirements: PositionRequirementsV2;
      candidateList: CandidateDraft[];
      downwardMovesExcluded: number;
    }
  >();
  const allEmployeeIdsSet = new Set<string>();

  for (const posId of foundIds) {
    const posRow = posById.get(posId);
    const requirements = parsePositionRequirementsV2(posRow);
    const deptName = posRow.department_id
      ? deptNameById.get(String(posRow.department_id)) ?? null
      : null;

    const candidateMap = new Map<string, CandidateDraft>();
    let downwardMovesExcluded = 0;

    // Manual nominations bypass discovery filters
    for (const m of manualByPos.get(posId) ?? []) {
      const empId = String(m.employee_id);
      const emp = employeeById.get(empId);
      const fullName = emp
        ? `${emp.first_name ?? ''} ${emp.last_name ?? ''}`.trim() ||
          `Employee ${empId.slice(0, 6)}`
        : `Employee ${empId.slice(0, 6)}`;
      candidateMap.set(empId, {
        employeeId: empId,
        name: fullName,
        manuallyNominated: true,
        presentPosition: emp?.position ? String(emp.position).trim() || null : null,
        department: emp?.department ? String(emp.department).trim() || null : null,
        dateHired: emp?.date_hired ?? null,
        highestEducation: emp?.highest_educational_attainment ?? null,
        eligibility: emp?.eligibility ?? null,
      });
    }

    // Active department employees with standard discovery exclusions
    if (deptName) {
      const normalizedDept = deptName.trim().toLowerCase();
      for (const e of deptEmps) {
        const empDept = e.department != null ? String(e.department).trim().toLowerCase() : '';
        if (empDept && empDept !== normalizedDept) continue;

        const empId = String(e.id);
        if (candidateMap.has(empId)) continue;

        if (posRow.incumbent_employee_id && empId === String(posRow.incumbent_employee_id)) {
          continue;
        }
        if (
          e.position &&
          posRow.title &&
          String(e.position).trim().toLowerCase() === String(posRow.title).trim().toLowerCase()
        ) {
          continue;
        }
        if (String(e.employment_status || '').toLowerCase() === 'probationary') {
          continue;
        }
        if (isDownwardTitleMove(e.position, posRow.title)) {
          downwardMovesExcluded += 1;
          continue;
        }

        const fullName =
          `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() || `Employee ${empId.slice(0, 6)}`;
        candidateMap.set(empId, {
          employeeId: empId,
          name: fullName,
          manuallyNominated: false,
          presentPosition: e.position ? String(e.position).trim() || null : null,
          department: e.department ? String(e.department).trim() || null : deptName,
          dateHired: e.date_hired ?? null,
          highestEducation: e.highest_educational_attainment ?? null,
          eligibility: e.eligibility ?? null,
        });
      }
    }

    const candidateList = [...candidateMap.values()].filter((c) => c.name);
    for (const c of candidateList) allEmployeeIdsSet.add(c.employeeId);
    positionPrep.set(posId, {
      posRow,
      requirements,
      candidateList,
      downwardMovesExcluded,
    });
  }

  const allEmployeeIds = [...allEmployeeIdsSet];

  // 5. Batch-fetch granular evidence tables and IPCR scores across all discovered employees
  let workByEmp = new Map<string, any[]>();
  let trainingByEmp = new Map<string, any[]>();
  let educationByEmp = new Map<string, any[]>();
  let eligibilityByEmp = new Map<string, any[]>();
  const compTagsByTraining = new Map<string, Set<string>>();
  let scoresMap = new Map<string, { overallScore: number | null; adjectival: string | null; period: string | null; cycleId: number | null }>();

  if (allEmployeeIds.length > 0) {
    const [workRes, trainingRes, educationRes, eligibilityRes, fetchedScores] = await Promise.all([
      (supabaseClient as any)
        .from('employee_work_experience')
        .select('id, employee_id, from_date, to_date, is_present, position_title, company_name')
        .in('employee_id', allEmployeeIds),
      (supabaseClient as any)
        .from('employee_training')
        .select('id, employee_id, training_title, number_of_hours, from_date, to_date, conducted_by')
        .in('employee_id', allEmployeeIds),
      (supabaseClient as any)
        .from('employee_education')
        .select('id, employee_id, level, course, year_graduated')
        .in('employee_id', allEmployeeIds),
      (supabaseClient as any)
        .from('employee_eligibility')
        .select('id, employee_id, eligibility_type, validity_date')
        .in('employee_id', allEmployeeIds),
      getLatestOverallScores(allEmployeeIds),
    ]);

    if (workRes?.error) {
      throw new Error(`Failed to load work experience: ${workRes.error.message}`);
    }
    if (trainingRes?.error) {
      throw new Error(`Failed to load training records: ${trainingRes.error.message}`);
    }
    if (educationRes?.error) {
      throw new Error(`Failed to load education records: ${educationRes.error.message}`);
    }
    if (eligibilityRes?.error) {
      throw new Error(`Failed to load eligibility records: ${eligibilityRes.error.message}`);
    }

    workByEmp = groupByEmployee(workRes?.data ?? []);
    const trainingRows = (trainingRes?.data ?? []) as any[];
    trainingByEmp = groupByEmployee(trainingRows);
    educationByEmp = groupByEmployee(educationRes?.data ?? []);
    eligibilityByEmp = groupByEmployee(eligibilityRes?.data ?? []);
    scoresMap = fetchedScores;

    const trainingIds = [
      ...new Set(trainingRows.map((t) => String(t.id)).filter(Boolean)),
    ];
    if (trainingIds.length > 0) {
      const tagChunks = await Promise.all(
        chunk(trainingIds, TRAINING_TAG_CHUNK_SIZE).map(async (part) => {
          const res = await (supabaseClient as any)
            .from('employee_training_competencies')
            .select('employee_training_id, competency_id')
            .in('employee_training_id', part);
          if (res?.error) {
            throw new Error(`Failed to load training competencies: ${res.error.message}`);
          }
          return (res?.data ?? []) as any[];
        }),
      );
      for (const ct of tagChunks.flat()) {
        const tid = String(ct.employee_training_id);
        if (!compTagsByTraining.has(tid)) compTagsByTraining.set(tid, new Set());
        compTagsByTraining.get(tid)!.add(String(ct.competency_id));
      }
    }
  }

  // 6. Evaluate each position's pool
  for (const posId of foundIds) {
    const prep = positionPrep.get(posId)!;
    const { requirements, candidateList, downwardMovesExcluded } = prep;
    const reviews = reviewsByPos.get(posId) ?? [];
    const reviewMapByEmp = organizeReviewsByEmployee(reviews);
    const reqSnapshot = requirements as unknown as Record<string, unknown>;
    const requiredComps = requiredCompetenciesByPos.get(posId) ?? [];

    const evaluatedResults: SuccessionV2Result[] = [];
    const candidateMeta: Record<string, CandidateMetaV2> = {};

    for (const candidate of candidateList) {
      const empId = candidate.employeeId;
      const empReviews = reviewMapByEmp.get(empId) ?? new Map<string, SuccessionEvidenceReview>();

      // Work inventory: detailed work records, with fallback to date_hired tenure
      const rawWork = workByEmp.get(empId) ?? [];
      let experienceUsedTenureFallback = false;
      let workRecords: ReviewedWorkV2[] = rawWork.map((w) => {
        const srcId = String(w.id);
        const rev = empReviews.get(`work:${srcId}`);
        const evidenceSnap = {
          from_date: w.from_date,
          to_date: w.to_date,
          is_present: w.is_present,
          position_title: w.position_title,
        };
        const stale = rev ? isReviewStale(rev, evidenceSnap, reqSnapshot) : false;
        return {
          sourceId: srcId,
          relevant: rev && !stale ? rev.isRelevant : true,
          cityHall: rev && !stale ? rev.isCityHall : true,
          startDate: formatDate(w.from_date) ?? '1970-01-01',
          endDate: w.is_present ? null : formatDate(w.to_date),
          present: Boolean(w.is_present),
        };
      });

      if (workRecords.length === 0 && candidate.dateHired) {
        experienceUsedTenureFallback = true;
        workRecords = [
          {
            sourceId: `tenure:${empId}`,
            relevant: true,
            cityHall: true,
            startDate: formatDate(candidate.dateHired) ?? '1970-01-01',
            endDate: null,
            present: true,
          },
        ];
      }

      // Training inventory
      const rawTraining = trainingByEmp.get(empId) ?? [];
      const trainingRecords: ReviewedTrainingV2[] = rawTraining.map((t) => {
        const srcId = String(t.id);
        const rev = empReviews.get(`training:${srcId}`);
        const hours = Number(t.number_of_hours) || 0;
        const sDate = formatDate(t.from_date) ?? '1970-01-01';
        const eDate = formatDate(t.to_date) ?? sDate;
        const evidenceSnap = {
          title: t.training_title,
          hours,
          from_date: t.from_date,
          to_date: t.to_date,
        };
        const stale = rev ? isReviewStale(rev, evidenceSnap, reqSnapshot) : false;
        return {
          sourceId: srcId,
          relevant: rev && !stale ? rev.isRelevant : true,
          cityHall: rev && !stale ? rev.isCityHall : true,
          hours,
          completed: true,
          title: String(t.training_title ?? ''),
          provider: String(t.conducted_by ?? 'LGU'),
          certificateId: null,
          startDate: sDate,
          endDate: eDate,
        };
      });

      // Education inventory: detailed education rows, with fallback to profile attainment
      const rawEducation = educationByEmp.get(empId) ?? [];
      let educationRecords: ReviewedEducationV2[] = rawEducation.map((ed) => {
        const srcId = String(ed.id);
        const rev = empReviews.get(`education:${srcId}`);
        const kind = normalizeDegree(ed.level, ed.course);
        const evidenceSnap = { level: ed.level, course: ed.course };
        const stale = rev ? isReviewStale(rev, evidenceSnap, reqSnapshot) : false;
        return {
          sourceId: srcId,
          kind,
          relevant: rev && !stale ? rev.isRelevant : true,
          matchesRequiredField: rev && !stale ? rev.matchesRequirement : true,
        };
      });

      if (educationRecords.length === 0 && candidate.highestEducation) {
        const kind = normalizeDegree(candidate.highestEducation, null);
        educationRecords = [
          {
            sourceId: `profile-edu:${empId}`,
            kind,
            relevant: true,
            matchesRequiredField: true,
          },
        ];
      }

      // Eligibility inventory: canonicalized + checked against active eligibility_types
      const rawEligibility = eligibilityByEmp.get(empId) ?? [];
      let eligibilityRecords: ReviewedEligibilityV2[] = rawEligibility.map((el) => {
        const srcId = String(el.id);
        const rev = empReviews.get(`eligibility:${srcId}`);
        const rawType = String(el.eligibility_type ?? '').trim();
        const resolved = resolveElig(rawType);
        const expiryDate = formatDate(el.validity_date);
        const evidenceSnap = {
          eligibility_type: el.eligibility_type,
          validity_date: el.validity_date,
        };
        const stale = rev ? isReviewStale(rev, evidenceSnap, reqSnapshot) : false;
        return {
          sourceId: srcId,
          typeKey: resolved.canonicalName || 'Unspecified',
          recognized: rev && !stale ? rev.isRelevant : resolved.recognized,
          relevant: rev && !stale ? rev.isRelevant : true,
          matchesRequirement: rev && !stale ? rev.matchesRequirement : true,
          expiryDate,
        };
      });

      if (eligibilityRecords.length === 0 && candidate.eligibility) {
        const rawType = candidate.eligibility.trim();
        if (rawType) {
          const resolved = resolveElig(rawType);
          eligibilityRecords = [
            {
              sourceId: `profile-elig:${empId}`,
              typeKey: resolved.canonicalName,
              recognized: resolved.recognized,
              relevant: true,
              matchesRequirement: true,
              expiryDate: null,
            },
          ];
        }
      }

      const recognizedSet = new Set<string>();
      const expiredSet = new Set<string>();
      const unrecognizedSet = new Set<string>();
      for (const rec of eligibilityRecords) {
        const label = rec.typeKey.trim();
        if (!label) continue;
        if (rec.expiryDate !== null && rec.expiryDate < scoringDate) {
          expiredSet.add(label);
        } else if (rec.recognized !== true) {
          unrecognizedSet.add(label);
        } else if (rec.relevant !== false) {
          recognizedSet.add(label);
        }
      }

      // Competency coverage breakdown & gap analysis
      const satisfiedByCompId = new Map<string, string>();
      for (const t of rawTraining) {
        const cids = compTagsByTraining.get(String(t.id));
        if (!cids) continue;
        const title = String(t.training_title ?? '').trim() || 'Tagged training';
        for (const cid of cids) {
          if (!satisfiedByCompId.has(cid)) {
            satisfiedByCompId.set(cid, title);
          }
        }
      }

      const competencyBreakdown: CandidateCompetencyItemV2[] = requiredComps.map((rc) => {
        const satisfiedBy = satisfiedByCompId.get(rc.id) ?? null;
        return {
          name: rc.name,
          met: satisfiedBy !== null,
          satisfiedBy,
        };
      });
      const metCompCount = competencyBreakdown.filter((c) => c.met).length;
      const missingComps = competencyBreakdown.filter((c) => !c.met);
      const gapAnalysis = missingComps.map(
        (c) =>
          `Missing required competency: ${c.name} (${metCompCount}/${requiredComps.length} met)`,
      );
      const requiredActions = missingComps.map(
        (c) => `Complete a training tagged with "${c.name}"`,
      );
      const timeline =
        missingComps.length > 0 ? `${missingComps.length * MONTHS_PER_MISSING_COMPETENCY} months` : null;

      const scoreEntry = scoresMap.get(empId);
      const ipcr = scoreEntry?.overallScore ?? null;

      candidateMeta[empId] = {
        presentPosition: candidate.presentPosition,
        department: candidate.department,
        ipcrPeriod: scoreEntry?.period ?? null,
        ipcrAdjectival: scoreEntry?.adjectival ?? null,
        experienceUsedTenureFallback,
        eligibilityDetail: {
          recognized: [...recognizedSet],
          expired: [...expiredSet],
          unrecognized: [...unrecognizedSet],
        },
        competencyBreakdown,
        gapAnalysis,
        requiredActions,
        timeline,
      };

      const input: SuccessionV2Input = {
        candidate: {
          employeeId: empId,
          name: candidate.name,
          manuallyNominated: candidate.manuallyNominated,
        },
        positionId: posId,
        scoringDate,
        requirements,
        work: { complete: true, records: workRecords },
        training: { complete: true, records: trainingRecords },
        education: { complete: true, records: educationRecords },
        eligibility: { complete: true, records: eligibilityRecords },
        performanceRating: ipcr,
        competencies: {
          required: requiredComps.length,
          met: metCompCount,
        },
      };

      evaluatedResults.push(evaluateSuccessionV2(input));
    }

    const scoredList = evaluatedResults.filter((r) => r.status === 'scored');
    const needsReview = evaluatedResults.filter((r) => r.status === 'needs-review');
    const configurationNeeded = evaluatedResults.filter(
      (r) => r.status === 'configuration-needed',
    );
    const excluded = evaluatedResults.filter((r) => r.status === 'excluded');
    const ranked = scoredList.length > 0 ? rankSuccessionV2(scoredList) : [];

    pools.set(posId, {
      positionId: posId,
      scoringDate,
      requirements,
      ranked,
      needsReview,
      configurationNeeded,
      excluded,
      downwardMovesExcluded,
      candidateMeta,
    });
  }

  return pools;
}

export async function fetchSuccessionPoolV2(
  criticalPositionId: string,
  scoringDate: string = new Date().toISOString().slice(0, 10),
): Promise<SuccessionPoolV2> {
  const pools = await fetchSuccessionPoolsV2([criticalPositionId], scoringDate);
  const pool = pools.get(criticalPositionId);
  if (!pool) {
    throw new Error(`Failed to load critical position: Not found`);
  }
  return pool;
}
