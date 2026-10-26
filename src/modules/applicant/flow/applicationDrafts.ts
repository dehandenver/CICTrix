/**
 * Per-plantilla application drafts, shared by the three steps of the apply
 * flow:
 *   1. Choose plantilla   → Job Details page (/job-details/:id)
 *   2. Fill up application → ApplicantWizard (/apply)
 *   3. Review & submit     → ApplicantWizard (/apply)
 *
 * Every selected plantilla item gets its own, isolated form copy keyed by its
 * plantilla key, so answers for Plantilla 1 can never leak into Plantilla 2.
 *
 * Stored in sessionStorage: survives a refresh and the trip back to Step 1,
 * clears when the tab closes. UI state only — File objects are not
 * serializable, so uploads live in memory and are re-attached after a reload.
 */
import type { ApplicantFormData } from '../../../types/applicant.types';
import type { JobPosting, PlantillaSlot } from '../../../types/recruitment.types';
import type { EmployeePortalAccount } from '../../../lib/employeePortalData';
import { plantillaLabel } from '../../../lib/plantillaRules';
import { isBlankWorkExperience, workExperiencesOf, type LegacyWorkExperienceFields } from '../../../lib/workExperience';

export const DRAFTS_KEY = 'cictrix_apply_drafts_v2';
/** The pre-redesign single-form cache; cleared so it can't resurrect old state. */
const LEGACY_WIZARD_KEY = 'cictrix_wizard_state';
/** Items this browser has already submitted an application for. */
const APPLIED_KEY = 'cictrix_applied_plantilla';

/** Key used for an application that isn't tied to a posting's plantilla item. */
export const GENERAL_KEY = 'general';

export type ChoiceStatus = 'open' | 'closing' | 'filled' | 'closed' | 'applied';

/** One plantilla item as the applicant sees it. */
export interface PlantillaChoice {
  /** Stable key for drafts: the slot id, or `legacy:<postingId>` for a posting with no slot rows. */
  key: string;
  /** Real `plantilla_slots.id`, or null when there is nothing to link to. */
  slotId: string | null;
  slotNumber: number;
  /** Admin-entered name, e.g. "Plantilla 2". What the applicant sees. */
  label: string;
  itemNumber: string;
  salaryGrade?: number;
  monthlySalary?: number;
  status: ChoiceStatus;
}

export interface ApplyDrafts {
  version: 2;
  entryMode: 'landing' | 'wizard';
  step: 'fill' | 'review';
  posting: {
    id: string;
    title: string;
    department: string;
  } | null;
  /** Selected items in Step 1 order. Empty for a general application. */
  choices: PlantillaChoice[];
  drafts: Record<string, ApplicantFormData>;
  activeKey: string;
  authenticatedEmployeeAccount: EmployeePortalAccount | null;
  /** Position/department were set by the posting and can't be edited. */
  lockedPosition: boolean;
  /** Current page of Step 2 (flow/formPages.ts), 1-based. */
  formPage: number;
}

export const emptyDrafts = (): ApplyDrafts => ({
  lockedPosition: false,
  formPage: 1,
  version: 2,
  entryMode: 'landing',
  step: 'fill',
  posting: null,
  choices: [],
  drafts: {},
  activeKey: GENERAL_KEY,
  authenticatedEmployeeAccount: null,
});

export const loadDrafts = (): ApplyDrafts => {
  try {
    sessionStorage.removeItem(LEGACY_WIZARD_KEY);
    const raw = sessionStorage.getItem(DRAFTS_KEY);
    if (!raw) return emptyDrafts();
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 2) return emptyDrafts();
    const state: ApplyDrafts = { ...emptyDrafts(), ...parsed };
    return { ...state, drafts: Object.fromEntries(Object.entries(state.drafts ?? {}).map(([key, data]) => [key, withWorkExperienceList(data)])) };
  } catch {
    return emptyDrafts();
  }
};

export const saveDrafts = (state: ApplyDrafts): void => {
  try {
    sessionStorage.setItem(DRAFTS_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage may be unavailable (private mode); not fatal.
  }
};

export const clearDrafts = (): void => {
  try {
    sessionStorage.removeItem(DRAFTS_KEY);
  } catch {
    // ignore
  }
};

/**
 * Drafts saved before work experience became a list carry five flat fields;
 * turn them into a one-item list so a reload keeps what was typed.
 */
const withWorkExperienceList = (data: ApplicantFormData & LegacyWorkExperienceFields): ApplicantFormData => {
  const {
    work_experience_years: _years,
    work_experience_months: _months,
    relevant_experience_position: _position,
    relevant_experience_company: _company,
    relevant_experience_duties: _duties,
    ...rest
  } = data;
  return { ...rest, work_experiences: workExperiencesOf(data) };
};

/** True once the applicant has typed anything the posting didn't prefill. */
export const draftHasData = (data: ApplicantFormData | undefined): boolean =>
  Boolean(
    data &&
      (data.first_name ||
        data.middle_name ||
        data.last_name ||
        data.email ||
        data.contact_number ||
        data.address ||
        data.gender ||
        data.education_attainment ||
        (data.work_experiences ?? []).some((entry) => !isBlankWorkExperience(entry)) ||
        data.gov_id_type ||
        data.employee_id),
  );

/** Drafts for `postingId` that already hold answers, keyed by plantilla key. */
export const draftKeysWithData = (postingId: string): Set<string> => {
  const state = loadDrafts();
  if (state.posting?.id !== postingId) return new Set();
  return new Set(
    Object.entries(state.drafts)
      .filter(([, data]) => draftHasData(data))
      .map(([key]) => key),
  );
};

/** Plantilla keys chosen last time for `postingId`, so Step 1 can restore them. */
export const previouslySelectedKeys = (postingId: string): string[] => {
  const state = loadDrafts();
  return state.posting?.id === postingId ? state.choices.map((choice) => choice.key) : [];
};

// ── Already-applied registry ────────────────────────────────────────────────
// The public portal has no applicant account, so the only authoritative
// "already applied" signal is the database at submit time (see the wizard).
// This local registry only remembers what this browser submitted. It never
// blocks an item: browsers are shared (family PCs, kiosks, the RSP office), so
// treating it as "this person applied" stopped the next applicant on the same
// device. The database check by email is what rejects a real duplicate.

type AppliedMap = Record<string, { referenceNo: string; at: string }>;

const readApplied = (): AppliedMap => {
  try {
    const parsed = JSON.parse(localStorage.getItem(APPLIED_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const markApplied = (key: string, referenceNo: string): void => {
  try {
    const next = readApplied();
    next[key] = { referenceNo, at: new Date().toISOString() };
    localStorage.setItem(APPLIED_KEY, JSON.stringify(next));
  } catch {
    // Best effort only.
  }
};


// ── Posting → choices ───────────────────────────────────────────────────────

const CLOSING_SOON_DAYS = 3; // DESIGN_IDENTITY.md §10: "Closing soon (≤ 3 days)"

const isClosingSoon = (closingDate: string | undefined): boolean => {
  if (!closingDate) return false;
  const close = new Date(closingDate);
  if (Number.isNaN(close.getTime())) return false;
  const msLeft = close.getTime() - Date.now();
  return msLeft >= 0 && msLeft <= CLOSING_SOON_DAYS * 24 * 60 * 60 * 1000;
};

/**
 * The plantilla items a posting offers. A posting created before plantilla
 * slots existed has no slot rows; it still advertises exactly one item (its
 * own item number), so it gets one synthetic choice with nothing to link.
 */
export const buildPlantillaChoices = (
  job: Pick<JobPosting, 'id' | 'jobCode' | 'status' | 'salaryGrade' | 'monthlySalary' | 'applicationDeadline'> & {
    plantillaSlots?: PlantillaSlot[];
  },
): PlantillaChoice[] => {
  const closing = isClosingSoon(job.applicationDeadline);
  const slots = job.plantillaSlots ?? [];

  if (slots.length === 0) {
    const key = `legacy:${job.id}`;
    const postingOpen = String(job.status ?? '').toLowerCase() === 'active';
    return [
      {
        key,
        slotId: null,
        slotNumber: 1,
        label: 'Plantilla 1',
        itemNumber: job.jobCode ?? '',
        salaryGrade: job.salaryGrade,
        monthlySalary: job.monthlySalary,
        status: !postingOpen ? 'closed' : closing ? 'closing' : 'open',
      },
    ];
  }

  return [...slots]
    .sort((a, b) => a.slotNumber - b.slotNumber)
    .map((slot) => {
      const base: ChoiceStatus =
        slot.status === 'filled' ? 'filled' : slot.status === 'closed' ? 'closed' : closing ? 'closing' : 'open';
      return {
        key: slot.id,
        // `legacy:` / `pending:` ids are synthetic — nothing real to link to.
        slotId: slot.id.startsWith('legacy:') || slot.id.startsWith('pending:') ? null : slot.id,
        slotNumber: slot.slotNumber,
        label: plantillaLabel(slot),
        itemNumber: slot.itemNumber,
        salaryGrade: slot.salaryGrade ?? job.salaryGrade,
        monthlySalary: slot.monthlySalary ?? job.monthlySalary,
        status: base,
      };
    });
};

export const isSelectable = (choice: PlantillaChoice): boolean =>
  choice.status === 'open' || choice.status === 'closing';

/** "Plantilla 2 · ABYAN-2026-298" */
/** "Plantilla 2": the admin label only. A plantilla never shows a code. */
export const choiceLabel = (choice: Pick<PlantillaChoice, "slotNumber"> & { label?: string }): string =>
  plantillaLabel(choice);

/** Dates everywhere read "Sep 25, 2026" (DESIGN_IDENTITY.md §9.5). */
export const formatShortDate = (value: string | undefined | null): string => {
  if (!value) return 'Not specified';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Not specified';
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};
