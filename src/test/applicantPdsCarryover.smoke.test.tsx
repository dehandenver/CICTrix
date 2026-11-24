import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAFTS_KEY, type ApplyDrafts, type PlantillaChoice } from '../modules/applicant/flow/applicationDrafts';
import type { ApplicantFormData } from '../types/applicant.types';

// This smoke test starts on the Review step via sessionStorage to exercise
// qualification carryover through external hire -> PDS -> evidence review.
vi.mock('../utils/validation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/validation')>();
  return { ...actual, validateFiles: () => null };
});

type Row = Record<string, unknown>;

const store = vi.hoisted(() => ({
  seq: 0,
  workRevision: 'rev-work-1',
  eduRevision: 'rev-edu-1',
  refRevision: 'rev-ref-1',
  applicants: [] as Row[],
  employees: [] as Row[],
  educationRows: [] as Row[],
  workRows: [] as Row[],
  eligibilityRows: [] as Row[],
  trainingRows: [] as Row[],
  referenceRows: [] as Row[],
  reviewRows: [] as Row[],
  criticalPositions: [] as Row[],
}));

const EDU_LEVEL_MAP: Record<string, string> = {
  'Elementary Level': 'Elementary',
  'Elementary Graduate': 'Elementary',
  Elementary: 'Elementary',
  'High School Level': 'Secondary',
  'High School Graduate': 'Secondary',
  Secondary: 'Secondary',
  Vocational: 'Vocational',
  'College Level': 'College',
  'College Graduate': 'College',
  College: 'College',
  'Masteral Units': 'Graduate Studies',
  'Graduate School': 'Graduate Studies',
  'Graduate Studies': 'Graduate Studies',
  Doctorate: 'Doctorate',
};

vi.mock('../lib/supabase', () => {
  const tableRows = (table: string): Row[] => {
    switch (table) {
      case 'applicants':
        return store.applicants;
      case 'employees':
        return store.employees;
      case 'employee_education':
        return store.educationRows;
      case 'employee_work_experience':
        return store.workRows;
      case 'employee_eligibility':
        return store.eligibilityRows;
      case 'employee_training':
        return store.trainingRows;
      case 'employee_references':
        return store.referenceRows;
      case 'succession_evidence_reviews':
        return store.reviewRows;
      case 'critical_positions':
        return store.criticalPositions;
      default:
        return [];
    }
  };

  const from = (table: string) => {
    const filters: Array<{ op: 'eq' | 'in' | 'ilike' | 'or' | 'is'; col: string; val: unknown }> = [];
    let mode: 'select' | 'insert' = 'select';
    let payloadRows: Row[] = [];
    let isSingle = false;
    let isMaybeSingle = false;

    const matchRows = (rows: Row[]) =>
      rows.filter((row) =>
        filters.every((f) => {
          if (f.op === 'eq') return String(row[f.col] ?? '') === String(f.val ?? '');
          if (f.op === 'is' && f.val === null) return row[f.col] == null;
          if (f.op === 'in') return (f.val as unknown[]).map(String).includes(String(row[f.col] ?? ''));
          if (f.op === 'ilike') {
            return String(row[f.col] ?? '').trim().toLowerCase() === String(f.val ?? '').trim().toLowerCase();
          }
          if (f.op === 'or') {
            const expr = String(f.val ?? '');
            return expr.split(',').some((clause) => {
              const idMatch = clause.match(/^id\.eq\.(.+)$/);
              if (idMatch) return String(row.id ?? '') === idMatch[1];
              const emailMatch = clause.match(/^email\.ilike\.(.+)$/);
              if (emailMatch) {
                return String(row.email ?? '').trim().toLowerCase() === emailMatch[1].trim().toLowerCase();
              }
              return false;
            });
          }
          return true;
        }),
      );

    const execute = async () => {
      if (mode === 'insert') {
        const rows = tableRows(table);
        const inserted: Row[] = payloadRows.map((r) => {
          const next = {
            id: r.id ?? `${table}-${++store.seq}`,
            reference_no: table === 'applicants' ? `REF-2026-000${store.seq}` : r.reference_no,
            ...r,
          };
          rows.push(next);
          return next;
        });
        if (isSingle) {
          return { data: inserted[0] ?? null, error: inserted[0] ? null : { message: 'insert failed' } };
        }
        return { data: inserted, error: null };
      }

      const matched = matchRows(tableRows(table));
      if (isSingle) {
        if (matched.length !== 1) {
          return { data: null, error: { code: 'PGRST116', message: 'Row not found' } };
        }
        return { data: matched[0], error: null };
      }
      if (isMaybeSingle) {
        return { data: matched[0] ?? null, error: null };
      }
      return { data: matched, error: null };
    };

    const chain: any = {
      select: () => chain,
      insert: (rows: Row | Row[]) => {
        mode = 'insert';
        payloadRows = Array.isArray(rows) ? rows : [rows];
        return chain;
      },
      eq: (col: string, val: unknown) => {
        filters.push({ op: 'eq', col, val });
        return chain;
      },
      in: (col: string, val: unknown[]) => {
        filters.push({ op: 'in', col, val });
        return chain;
      },
      ilike: (col: string, val: unknown) => {
        filters.push({ op: 'ilike', col, val });
        return chain;
      },
      or: (val: string) => {
        filters.push({ op: 'or', col: 'or', val });
        return chain;
      },
      is: (col: string, val: unknown) => {
        filters.push({ op: 'is', col, val });
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      single: () => {
        isSingle = true;
        return chain;
      },
      maybeSingle: () => {
        isMaybeSingle = true;
        return chain;
      },
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        execute().then(onFulfilled, onRejected),
    };
    return chain;
  };

  const rpc = (fn: string, params: Record<string, unknown>) => {
    const run = async () => {
      if (fn === 'complete_external_hire') {
      const applicant = store.applicants.find((a) => a.id === params.p_applicant_id);
      if (!applicant) {
        return { data: null, error: { code: 'P0001', hint: 'application_not_found', message: 'Applicant not found' } };
      }
      const existing = store.employees.find((e) => e.application_id === applicant.id);
      if (existing) {
        return {
          data: {
            applicant_id: applicant.id,
            employee_uuid: existing.id,
            employee_number: existing.employee_number,
            slot_id: applicant.plantilla_slot_id ?? 'slot-27',
            completed_at: existing.created_at,
            already_completed: true,
          },
          error: null,
        };
      }

      const empId = `emp-${++store.seq}`;
      const empNumber = `EMP-3300000${store.seq}`;
      const nowIso = '2026-11-22T03:00:00.000Z';
      store.employees.push({
        id: empId,
        application_id: applicant.id,
        employee_number: empNumber,
        first_name: applicant.first_name,
        middle_name: applicant.middle_name ?? null,
        last_name: applicant.last_name,
        email: applicant.email,
        phone: applicant.contact_number,
        current_address_street: applicant.address,
        sex: applicant.gender,
        highest_educational_attainment: applicant.education_level ?? null,
        person_with_disability: applicant.is_pwd ?? false,
        position: applicant.position,
        department: applicant.office,
        status: 'Active',
        date_hired: '2026-11-22',
        created_at: nowIso,
      });

      const eduLevel = EDU_LEVEL_MAP[String(applicant.education_level ?? '').trim()] ?? null;
      const eduSchool = String(applicant.education_school ?? '').trim();
      if (eduLevel && eduSchool) {
        store.educationRows.push({
          id: `edu-${++store.seq}`,
          employee_id: empId,
          level: eduLevel,
          school_name: eduSchool,
          course: applicant.education_degree ?? null,
          sort_order: 0,
        });
      }

      const workEntries = Array.isArray(applicant.work_experience_entries)
        ? (applicant.work_experience_entries as Row[])
        : [];
      workEntries.forEach((entry, index) => {
        const isPresent = Boolean(entry.is_present);
        store.workRows.push({
          id: `work-${++store.seq}`,
          employee_id: empId,
          position_title: entry.position_title,
          company_name: entry.company_name,
          from_date: entry.from_date,
          to_date: isPresent ? null : entry.to_date ?? null,
          is_present: isPresent,
          is_government_service: Boolean(entry.is_government_service),
          duties_responsibilities: entry.duties_responsibilities ?? null,
          sort_order: index,
        });
      });

      applicant.status = 'Hired';
      applicant.employee_id = empNumber;

      return {
        data: {
          applicant_id: applicant.id,
          employee_uuid: empId,
          employee_number: empNumber,
          slot_id: applicant.plantilla_slot_id ?? 'slot-27',
          completed_at: nowIso,
          already_completed: false,
        },
        error: null,
      };
    }

    if (fn === 'read_pds_section') {
      const empId = String(params.p_employee_id);
      const section = String(params.p_section);
      const emp = store.employees.find((e) => e.id === empId);
      if (section === 'education') {
        return {
          data: {
            rows: store.educationRows.filter((r) => r.employee_id === empId),
            revision: store.eduRevision,
            scalars: {},
          },
          error: null,
        };
      }
      if (section === 'workExperience') {
        return {
          data: {
            rows: store.workRows.filter((r) => r.employee_id === empId),
            revision: store.workRevision,
            scalars: {},
          },
          error: null,
        };
      }
      if (section === 'references') {
        return {
          data: {
            rows: store.referenceRows.filter((r) => r.employee_id === empId),
            revision: store.refRevision,
            scalars: {
              person_with_disability: emp?.person_with_disability ?? null,
            },
          },
          error: null,
        };
      }
    }

    if (fn === 'save_pds_section' && params.p_section === 'workExperience') {
      const empId = String(params.p_employee_id);
      if (params.p_expected_revision !== store.workRevision) {
        return { data: null, error: { code: '40001', hint: 'pds_revision_conflict', message: 'conflict' } };
      }
      const existingById = new Map(store.workRows.map((r) => [String(r.id), r]));
      const incoming = (params.p_rows as Row[]) ?? [];
      const reconciled = incoming.map((item, idx) => {
        const prior = item.id ? existingById.get(String(item.id)) : undefined;
        const toDate = item.to_date ? String(item.to_date).trim() : null;
        return {
          id: prior ? String(prior.id) : `work-${++store.seq}`,
          employee_id: empId,
          from_date: item.from_date,
          to_date: toDate,
          is_present: toDate ? false : Boolean(prior?.is_present ?? false),
          position_title: item.position_title,
          company_name: item.company_name,
          status_of_appointment: item.status_of_appointment ?? null,
          is_government_service: item.is_government_service ?? null,
          duties_responsibilities: prior?.duties_responsibilities ?? null,
          sort_order: idx,
        };
      });
      store.workRows = [...store.workRows.filter((r) => r.employee_id !== empId), ...reconciled];
      store.workRevision = `rev-work-${++store.seq}`;
      return {
        data: { rows: reconciled, revision: store.workRevision, scalars: {} },
        error: null,
      };
    }

    return { data: null, error: { code: 'PGRST202', message: `Unexpected rpc ${fn}` } };
    };

    const builder: any = {
      abortSignal: () => builder,
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        run().then(onFulfilled, onRejected),
    };
    return builder;
  };

  return {
    ATTACHMENTS_BUCKET: 'attachments',
    isMockModeEnabled: false,
    supabase: {
      from,
      rpc,
      storage: { from: () => ({ upload: vi.fn() }) },
    },
  };
});

vi.mock('../lib/crypto', () => ({ encryptApplicantFile: async (file: File) => file }));
vi.mock('../lib/recruitmentData', () => ({
  getAuthoritativeJobPostings: () => [],
  loadJobPostings: async () => [],
  syncApplicantSubmissionToRecruitment: vi.fn(),
}));
vi.mock('../lib/plantillaSlots', () => ({ linkApplicationToSlots: async () => ({ ok: true }) }));
vi.mock('../lib/employeePortalData', () => ({
  PROMOTIONAL_AUTH_ERROR: {
    INVALID_CREDENTIALS: 'invalid_credentials',
    AMBIGUOUS_ACCOUNT: 'ambiguous_account',
    MISSING_EMPLOYEE_NUMBER: 'missing_employee_number',
    LOOKUP_UNAVAILABLE: 'lookup_unavailable',
  },
  authenticatePromotionalEmployee: async () => ({ ok: false, error: 'invalid_credentials' }),
  findEmployeePortalAccount: () => undefined,
  getEmployeePortalAccounts: () => [],
  findEmployeePortalAccountFromSupabaseByEmployeeIdOrEmail: async () => undefined,
}));

import { ApplicantWizard } from '../modules/applicant/ApplicantWizard';
import { completeExternalHire } from '../lib/api/externalHiring';
import { listEducation, listReferences, listWorkExperience, saveWorkExperience } from '../lib/api/personalDataSheet';
import { CandidateEvidenceReviewModal } from '../components/CandidateEvidenceReviewModal';
import { fetchEmployeeApplicationProfile } from '../lib/api/employeeApplicationProfile';
import { parsePositionRequirementsV2 } from '../lib/api/successionPipelineV2';

const choice: PlantillaChoice = {
  key: 'slot-27',
  slotId: 'slot-27',
  slotNumber: 27,
  label: 'Plantilla 27',
  itemNumber: 'ITEM-27',
  salaryGrade: 11,
  status: 'open',
};

const sampleFormData = (): ApplicantFormData => ({
  first_name: 'Danica',
  middle_name: 'Navarro',
  last_name: 'Ocampo',
  gender: 'Female',
  address: 'Jaro, Iloilo City',
  contact_number: '09171234567',
  email: 'danica.ocampo@example.com',
  position: 'Administrative Officer II',
  item_number: 'ITEM-27',
  office: 'City Human Resource Office',
  is_pwd: true,
  application_type: 'job',
  employee_id: '',
  current_position: '',
  current_department: '',
  current_division: '',
  employee_username: '',
  education_attainment: 'College Graduate',
  education_degree: 'Bachelor of Science in Information Technology',
  education_school: 'West Visayas State University',
  work_experience_years: '4',
  work_experience_months: '0',
  relevant_experience_position: 'Administrative Aide IV',
  relevant_experience_company: 'City Government of Iloilo',
  relevant_experience_duties: 'Maintains 201 personnel records',
  work_experience_entries: [
    {
      from_date: '2024-03-01',
      to_date: '',
      is_present: true,
      position_title: 'Administrative Aide IV',
      company_name: 'City Government of Iloilo',
      duties_responsibilities: 'Maintains 201 personnel records',
      is_government_service: true,
    },
    {
      from_date: '2022-04-01',
      to_date: '2024-02-28',
      is_present: false,
      position_title: 'Records Clerk',
      company_name: 'Panay Tech Corp',
      duties_responsibilities: 'Encoded personnel documents',
      is_government_service: false,
    },
  ],
  gov_id_type: 'UMID',
  gov_id_expiration: '',
});

describe('Applicant-to-PDS qualification carryover end-to-end smoke', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    store.seq = 0;
    store.workRevision = 'rev-work-1';
    store.eduRevision = 'rev-edu-1';
    store.refRevision = 'rev-ref-1';
    store.applicants = [];
    store.employees = [];
    store.educationRows = [];
    store.workRows = [];
    store.eligibilityRows = [];
    store.trainingRows = [];
    store.referenceRows = [];
    store.reviewRows = [];
    store.criticalPositions = [
      {
        id: 'crit-pos-1',
        title: 'Administrative Officer II',
        required_education: 'Bachelor',
        required_eligibility: 'Career Service Professional',
        min_years_experience: 2,
        required_training_hours: 8,
      },
    ];
    window.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('carries /apply work history, education, and PWD through complete_external_hire into PDS, evidence review, and promotional prefill', async () => {
    const draft: ApplyDrafts = {
      version: 2,
      entryMode: 'wizard',
      step: 'review',
      posting: {
        id: 'posting-1',
        title: 'Administrative Officer II',
        department: 'City Human Resource Office',
      },
      choices: [choice],
      drafts: { [choice.key]: sampleFormData() },
      activeKey: choice.key,
      authenticatedEmployeeAccount: null,
      lockedPosition: true,
      formPage: 1,
    };
    sessionStorage.setItem(DRAFTS_KEY, JSON.stringify(draft));

    render(
      <MemoryRouter>
        <ApplicantWizard />
      </MemoryRouter>,
    );

    expect(screen.getByText(/West Visayas State University/)).toBeInTheDocument();
    expect(screen.getByText(/Administrative Aide IV · City Government of Iloilo/)).toBeInTheDocument();
    expect(screen.getByText(/Records Clerk · Panay Tech Corp/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /I hereby certify/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Application' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Submit' }));

    expect(await screen.findByRole('heading', { name: 'Application submitted' })).toBeInTheDocument();
    expect(store.applicants).toHaveLength(1);
    const submittedApp = store.applicants[0];
    expect(submittedApp.education_school).toBe('West Visayas State University');
    expect(submittedApp.is_pwd).toBe(true);
    expect(Number(submittedApp.years_of_experience)).toBeGreaterThan(3);
    expect(submittedApp.work_experience_entries).toHaveLength(2);

    // Complete external hire and replay once to verify single-seeding guarantee
    const hire = await completeExternalHire(String(submittedApp.id));
    expect(hire.alreadyCompleted).toBe(false);
    const replay = await completeExternalHire(String(submittedApp.id));
    expect(replay.alreadyCompleted).toBe(true);
    expect(store.educationRows).toHaveLength(1);
    expect(store.workRows).toHaveLength(2);

    // PDS reads immediately reflect carried-over education, work history, and PWD
    const eduRes = await listEducation(hire.employeeUuid);
    expect(eduRes.ok).toBe(true);
    if (eduRes.ok === true) {
      expect(eduRes.data.rows).toHaveLength(1);
      expect(eduRes.data.rows[0]).toMatchObject({
        level: 'College',
        school: 'West Visayas State University',
        degree: 'Bachelor of Science in Information Technology',
      });
    }

    const workRes = await listWorkExperience(hire.employeeUuid);
    expect(workRes.ok).toBe(true);
    if (workRes.ok !== true) return;
    expect(workRes.data.rows).toHaveLength(2);
    expect(workRes.data.rows[0].positionTitle).toBe('Administrative Aide IV');
    expect(workRes.data.rows[1].positionTitle).toBe('Records Clerk');

    const refRes = await listReferences(hire.employeeUuid);
    expect(refRes.ok).toBe(true);
    if (refRes.ok === true) {
      expect(refRes.data.scalars.personWithDisability).toBe(true);
    }

    // Saving a Date To on the seeded current-job row clears is_present = false while preserving duties
    const editedRows = [
      { ...workRes.data.rows[0], dateTo: '2026-10-31' },
      workRes.data.rows[1],
    ];
    const saveRes = await saveWorkExperience(hire.employeeUuid, editedRows, workRes.data.revision);
    expect(saveRes.ok).toBe(true);
    expect(store.workRows[0].is_present).toBe(false);
    expect(store.workRows[0].to_date).toBe('2026-10-31');
    expect(store.workRows[0].duties_responsibilities).toBe('Maintains 201 personnel records');

    // Downstream CandidateEvidenceReviewModal + promotional prefill reflect the carried-over data
    cleanup();
    render(
      <CandidateEvidenceReviewModal
        isOpen
        onClose={() => {}}
        candidate={{ employeeId: hire.employeeUuid, name: 'Danica Ocampo' }}
        criticalPosition={{
          id: 'crit-pos-1',
          title: 'Administrative Officer II',
          requirements: parsePositionRequirementsV2(store.criticalPositions[0]),
        }}
        onReviewSaved={() => {}}
      />,
    );

    expect(await screen.findByText(/City Government of Iloilo/)).toBeInTheDocument();
    expect(screen.getByText(/Panay Tech Corp/)).toBeInTheDocument();
    expect(screen.getByText(/2024-03-01 to 2026-10-31/)).toBeInTheDocument();
    expect(screen.queryByText(/Failed to load work experience/i)).not.toBeInTheDocument();

    const profile = await fetchEmployeeApplicationProfile(hire.employeeNumber);
    expect(profile).not.toBeNull();
    expect(profile?.educationAttainment).toBe('College Graduate');
    expect(profile?.educationDegree).toBe('Bachelor of Science in Information Technology');
    expect(profile?.educationSchool).toBe('West Visayas State University');
    expect(profile?.workExperienceEntries).toHaveLength(2);
    expect(profile?.workExperienceEntries[0].duties_responsibilities).toBe('Maintains 201 personnel records');

    await waitFor(() => expect(store.applicants[0].status).toBe('Hired'));
  });
});
