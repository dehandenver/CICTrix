/**
 * Module 4 · Promotional Applications
 *
 * promotional_applications — one row per promotion request
 * application_documents    — the manual document checklist per application
 *
 * The Latest IPCR is NOT a row in application_documents: it is auto-linked from
 * the employee's closed IPCR (ipcr_submissions at 'Verified' / 'Forwarded to
 * PM'), so it can never be faked by "uploading" one.
 */

import { supabase as supabaseClient } from '../supabase';
import type { ProficiencyLevel } from './pmCompetency';

const supabase = supabaseClient as any;

/** Same shape rationale as pmCompetency.Result — this project is strict:false. */
export type Result<T> = { ok: boolean; data?: T; error?: string };

const fail = (context: string, error: any): { ok: false; error: string } => {
  console.error(`[promotionalApplications] ${context}:`, error);
  return { ok: false, error: error?.message ?? String(error ?? 'Unknown error') };
};

export type ApplicationStatus =
  | 'submitted'
  | 'under_review'
  | 'endorsed'
  | 'approved'
  | 'denied';

export type DocumentStatus = 'submitted' | 'missing';

/** An IPCR counts as closed once the office has signed off and sent it to PM. */
export const CLOSED_IPCR_STAGES = ['Verified', 'Forwarded to PM'] as const;

/** The manual documents. Latest IPCR is auto-linked and deliberately absent. */
export const REQUIRED_DOCUMENT_TYPES = [
  'Updated Resume',
  'Service Record',
  'Dept Head Endorsement Letter',
  'Personal Data Sheet',
] as const;

export const IPCR_DOCUMENT_LABEL = 'Latest IPCR (auto-linked)';

export interface PromotionalApplication {
  id: string;
  employee_id: string;
  employee_name: string;
  current_position: string | null;
  position_applied_for: string;
  date_applied: string;
  status: ApplicationStatus;
  remarks: string | null;
  decided_by: string | null;
  decided_at: string | null;
}

export interface ApplicationDocument {
  id: string;
  application_id: string;
  document_type: string;
  status: DocumentStatus;
  uploaded_at: string | null;
}

export interface ApplicationRow extends PromotionalApplication {
  /** Manual docs submitted + the auto-linked IPCR when closed. */
  documentsSubmitted: number;
  documentsTotal: number;
  ipcrLinked: boolean;
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

/**
 * Employee ids (as stored on promotional_applications.employee_id) that have a
 * closed IPCR. Used both to auto-link the IPCR document and to gate eligibility.
 */
async function loadClosedIpcrEmployeeIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('ipcr_submissions')
    .select('employee_id, stage')
    .in('stage', CLOSED_IPCR_STAGES as unknown as string[]);
  if (error) {
    console.warn('[promotionalApplications] closed IPCR lookup failed:', error);
    return new Set();
  }
  return new Set(
    (data ?? []).map((r: any) => norm(r?.employee_id)).filter(Boolean),
  );
}

export async function listApplications(): Promise<Result<ApplicationRow[]>> {
  try {
    const [appsRes, docsRes, closedIpcrIds] = await Promise.all([
      supabase.from('promotional_applications').select('*').order('date_applied', { ascending: false }),
      supabase.from('application_documents').select('*'),
      loadClosedIpcrEmployeeIds(),
    ]);

    if (appsRes.error) return fail('listApplications', appsRes.error);

    const docs: ApplicationDocument[] = docsRes.error ? [] : docsRes.data ?? [];
    const submittedByApp = new Map<string, number>();
    docs.forEach((d) => {
      if (d.status !== 'submitted') return;
      submittedByApp.set(d.application_id, (submittedByApp.get(d.application_id) ?? 0) + 1);
    });

    const rows: ApplicationRow[] = (appsRes.data ?? []).map((app: PromotionalApplication) => {
      const ipcrLinked = closedIpcrIds.has(norm(app.employee_id));
      return {
        ...app,
        // +1 for the auto-linked IPCR, which isn't an application_documents row.
        documentsSubmitted: (submittedByApp.get(app.id) ?? 0) + (ipcrLinked ? 1 : 0),
        documentsTotal: REQUIRED_DOCUMENT_TYPES.length + 1,
        ipcrLinked,
      };
    });

    return { ok: true, data: rows };
  } catch (err) {
    return fail('listApplications', err);
  }
}

export async function listApplicationDocuments(
  applicationId: string,
): Promise<Result<ApplicationDocument[]>> {
  try {
    const { data, error } = await supabase
      .from('application_documents')
      .select('*')
      .eq('application_id', applicationId);
    if (error) return fail('listApplicationDocuments', error);
    return { ok: true, data: (data ?? []) as ApplicationDocument[] };
  } catch (err) {
    return fail('listApplicationDocuments', err);
  }
}

/** True when this employee has a closed IPCR to auto-link. */
export async function hasClosedIpcr(employeeId: string): Promise<boolean> {
  const ids = await loadClosedIpcrEmployeeIds();
  return ids.has(norm(employeeId));
}

/**
 * Create an application and its document checklist in one go, so a new
 * application always has a complete checklist to review.
 */
export async function createApplication(input: {
  employeeId: string;
  employeeName: string;
  currentPosition: string;
  positionAppliedFor: string;
}): Promise<Result<PromotionalApplication>> {
  try {
    const { data, error } = await supabase
      .from('promotional_applications')
      .insert([
        {
          employee_id: input.employeeId,
          employee_name: input.employeeName,
          current_position: input.currentPosition || null,
          position_applied_for: input.positionAppliedFor,
          status: 'submitted',
        },
      ])
      .select()
      .single();
    if (error) return fail('createApplication', error);

    const app = data as PromotionalApplication;
    const { error: docsError } = await supabase.from('application_documents').insert(
      REQUIRED_DOCUMENT_TYPES.map((document_type) => ({
        application_id: app.id,
        document_type,
        status: 'missing',
      })),
    );
    if (docsError) return fail('createApplication.documents', docsError);

    return { ok: true, data: app };
  } catch (err) {
    return fail('createApplication', err);
  }
}

/** Toggle a manual document between submitted and missing. */
export async function setDocumentStatus(input: {
  documentId: string;
  status: DocumentStatus;
}): Promise<Result<true>> {
  try {
    const { error } = await supabase
      .from('application_documents')
      .update({
        status: input.status,
        uploaded_at: input.status === 'submitted' ? new Date().toISOString() : null,
      })
      .eq('id', input.documentId);
    if (error) return fail('setDocumentStatus', error);
    return { ok: true, data: true };
  } catch (err) {
    return fail('setDocumentStatus', err);
  }
}

/**
 * Record a decision. Remarks are required for approve/deny — the caller must
 * enforce it in the UI too, but this is the last line of defence so a decision
 * can never land without a reason attached.
 */
export async function decideApplication(input: {
  applicationId: string;
  status: ApplicationStatus;
  remarks: string;
  decidedBy: string;
}): Promise<Result<PromotionalApplication>> {
  const remarks = String(input.remarks ?? '').trim();
  const isDecision = input.status === 'approved' || input.status === 'denied';
  if (isDecision && !remarks) {
    return { ok: false, error: 'Remarks are required before approving or denying.' };
  }

  try {
    const { data, error } = await supabase
      .from('promotional_applications')
      .update({
        status: input.status,
        remarks: remarks || null,
        decided_by: isDecision ? input.decidedBy : null,
        decided_at: isDecision ? new Date().toISOString() : null,
      })
      .eq('id', input.applicationId)
      .select()
      .single();
    if (error) return fail('decideApplication', error);
    return { ok: true, data: data as PromotionalApplication };
  } catch (err) {
    return fail('decideApplication', err);
  }
}

// ── Eligibility Check ────────────────────────────────────────────────────────

export interface EligibilityRow {
  competencyId: number;
  competencyName: string;
  trainingStream: string;
  requiredLevel: ProficiencyLevel;
  /** null when no closed-IPCR computation exists for this competency. */
  score: number | null;
  result: 'Met' | 'Gap' | 'Pending';
}

export interface EligibilityReport {
  rows: EligibilityRow[];
  metCount: number;
  gapCount: number;
  pendingCount: number;
  /** False when the employee has no closed IPCR to compute scores from. */
  hasClosedIpcr: boolean;
  /** True when the position has no requirements set in Module 3. */
  missingRequirements: boolean;
}

/** Minimum IPCR-derived score (out of 5) that satisfies each proficiency level. */
const LEVEL_THRESHOLD: Record<ProficiencyLevel, number> = {
  Basic: 2.75,
  Intermediate: 3.25,
  Advanced: 4.0,
};

/**
 * Cross-reference the applicant's IPCR-derived competency scores against the
 * requirements Module 3 holds for the position being applied for.
 *
 * Scores are read-only and come from the closed IPCR computation — never
 * entered by PM. No closed IPCR (or no computation yet) means every row reports
 * Pending rather than a fabricated number.
 */
export async function runEligibilityCheck(input: {
  employeeId: string;
  positionAppliedFor: string;
}): Promise<Result<EligibilityReport>> {
  try {
    const [reqRes, standardsRes, closedIpcrIds] = await Promise.all([
      supabase
        .from('position_competency_requirements')
        .select('competency_id, proficiency_level')
        .eq('position_title', input.positionAppliedFor),
      supabase.from('competency_standards').select('*').order('id'),
      loadClosedIpcrEmployeeIds(),
    ]);

    if (reqRes.error) return fail('runEligibilityCheck.requirements', reqRes.error);
    if (standardsRes.error) return fail('runEligibilityCheck.standards', standardsRes.error);

    const standards: any[] = standardsRes.data ?? [];
    const standardById = new Map<number, any>(standards.map((s) => [s.id, s]));
    const requirements: any[] = reqRes.data ?? [];
    const employeeHasClosedIpcr = closedIpcrIds.has(norm(input.employeeId));

    // Scores would come from the closed IPCR's computation results. That data
    // doesn't exist yet (no closed IPCR carries computed competency scores), so
    // every row reports Pending instead of inventing a number. Once the
    // computation lands, resolve scores here and the table fills itself in.
    const scoreByCompetencyId = new Map<number, number>();

    const rows: EligibilityRow[] = requirements
      .map((req) => {
        const standard = standardById.get(req.competency_id);
        const requiredLevel = req.proficiency_level as ProficiencyLevel;
        const score = scoreByCompetencyId.get(req.competency_id) ?? null;
        const result: EligibilityRow['result'] =
          score == null ? 'Pending' : score >= LEVEL_THRESHOLD[requiredLevel] ? 'Met' : 'Gap';
        return {
          competencyId: req.competency_id,
          competencyName: standard?.competency_name ?? `Competency ${req.competency_id}`,
          trainingStream: standard?.training_stream ?? '',
          requiredLevel,
          score,
          result,
        };
      })
      .sort((a, b) => a.competencyId - b.competencyId);

    return {
      ok: true,
      data: {
        rows,
        metCount: rows.filter((r) => r.result === 'Met').length,
        gapCount: rows.filter((r) => r.result === 'Gap').length,
        pendingCount: rows.filter((r) => r.result === 'Pending').length,
        hasClosedIpcr: employeeHasClosedIpcr,
        missingRequirements: rows.length === 0,
      },
    };
  } catch (err) {
    return fail('runEligibilityCheck', err);
  }
}

/** Employees available to raise an application for. */
export async function listEmployeesForApplication(): Promise<
  Result<Array<{ id: string; employeeId: string; name: string; position: string }>>
> {
  try {
    const { data, error } = await supabase
      .from('employees_with_department')
      .select('id, employee_id, full_name, current_position')
      .order('full_name');
    if (error) return fail('listEmployeesForApplication', error);
    return {
      ok: true,
      data: (data ?? []).map((r: any) => ({
        id: String(r.id),
        employeeId: String(r.employee_id ?? r.id),
        name: String(r.full_name ?? '').trim(),
        position: String(r.current_position ?? '').trim(),
      })),
    };
  } catch (err) {
    return fail('listEmployeesForApplication', err);
  }
}
