/**
 * Employee Portal — Personal Data Sheet, CS Form No. 212 (Revised 2025), sheets C1-C4.
 *
 * Mirrors the official form's sections and numbered items (I-VIII, plus the
 * unheaded background-disclosure/references run at the end of page 4), but
 * styled as an ordinary CICTrix card form rather than a copy of the
 * spreadsheet's grid/boxes. One sub-tab per section, each an always-editable
 * form with its own Save button — per-field Edit/Cancel toggles would only
 * add friction on a sheet this long.
 *
 * All reads/writes go through the data layer:
 *   - scalars + addresses -> patchPortalEmployee (lib/api/employeePortal.ts)
 *   - every repeating list (children, education, eligibility, work
 *     experience, voluntary work, L&D interventions, references) ->
 *     lib/api/personalDataSheet.ts, which uses replace-all semantics for
 *     all of them.
 *
 * Out of scope: the printed form's photo box, signature capture, right
 * thumbmark, and notarial/administering-oath fields (item 42) — those need
 * real file/image capture and a signing flow, which is a separate feature,
 * not a data-entry field.
 */

import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { ActionFeedback } from '../../components/action-feedback';
import { ErrorBanner } from '../../components/ErrorBanner';
import type {
  AddressParts,
  Employee,
  EmployeeChild,
  EmployeeEducation,
  EmployeeEligibility,
  EmployeeWorkExperience,
  EmployeeVoluntaryWork,
  EmployeeLdIntervention,
  EmployeeReference,
  PdsFieldIssue,
  PdsListSection,
} from '../../types/employee.types';
import { emptyAddress, EDUCATION_LEVEL_LABELS } from '../../types/employee.types';
import { PdsStepList } from './PdsStepList';
import { patchPortalEmployee } from '../../lib/api/employeePortal';
import {
  listChildren, saveChildren,
  listEducation, saveEducation, buildEducationRows,
  listEligibility, saveEligibility,
  listWorkExperience, saveWorkExperience,
  listVoluntaryWork, saveVoluntaryWork,
  listLdInterventions, saveLdInterventions,
  listReferences, saveReferences,
  validatePdsRows,
  doesSnapshotMatchIntendedSave,
  type PdsResult,
  type PdsSectionSnapshot,
} from '../../lib/api/personalDataSheet';

const BRAND = { blue: '#363EE8', navy: '#040E6B', line: '#C8D1FF' };

interface Props {
  employeeId: string; // supabaseId — the row this sheet reads/writes
  profile: Employee;
  onSaved: (patch: Partial<Employee>) => void;
}

type ScalarDraft = {
  surname: string;
  firstName: string;
  middleName: string;
  nameExtension: string;
  dateOfBirth: string;
  placeOfBirth: string;
  gender: Employee['gender'];
  civilStatus: Employee['civilStatus'];
  heightM: string;
  weightKg: string;
  bloodType: string;
  umidNumber: string;
  philsysNumber: string;
  sssNumber: string;
  philhealthNumber: string;
  pagibigNumber: string;
  tinNumber: string;
  citizenship: string;
  citizenshipBasis: 'By birth' | 'By naturalization' | '';
  dualCitizenshipCountry: string;
  telephoneNumber: string;
  mobileNumber: string;
  email: string;
  spouseSurname: string;
  spouseFirstName: string;
  spouseMiddleName: string;
  spouseNameExtension: string;
  spouseOccupation: string;
  spouseEmployer: string;
  spouseBusinessAddress: string;
  spouseTelephone: string;
  fatherSurname: string;
  fatherFirstName: string;
  fatherMiddleName: string;
  fatherNameExtension: string;
  motherSurname: string;
  motherFirstName: string;
  motherMiddleName: string;
  specialSkillsHobbies: string;
  nonAcademicDistinctions: string;
  membershipAssociations: string;
  relatedThirdDegree: boolean | null;
  relatedFourthDegree: boolean | null;
  relatedDetails: string;
  adminOffenseGuilty: boolean | null;
  adminOffenseDetails: string;
  criminallyCharged: boolean | null;
  criminalChargeDetails: string;
  criminalCaseDateFiled: string;
  criminalCaseStatus: string;
  convictedOfCrime: boolean | null;
  convictedDetails: string;
  separatedFromService: boolean | null;
  separatedDetails: string;
  electionCandidate: boolean | null;
  electionCandidateDetails: string;
  resignedToCampaign: boolean | null;
  resignedToCampaignDetails: string;
  immigrantStatus: boolean | null;
  immigrantCountry: string;
  indigenousGroupMember: boolean | null;
  indigenousGroupSpecify: string;
  personWithDisability: boolean | null;
  pwdIdNumber: string;
  soloParent: boolean | null;
  soloParentIdNumber: string;
  govIdType: string;
  govIdNumber: string;
  govIdIssuedDatePlace: string;
};

const getScalarDraft = (p: Employee): ScalarDraft => ({
  surname: p.surname || '',
  firstName: p.firstName || '',
  middleName: p.middleName || '',
  nameExtension: p.nameExtension || '',
  dateOfBirth: p.dateOfBirth || '',
  placeOfBirth: p.placeOfBirth || '',
  gender: p.gender || 'Prefer not to say',
  civilStatus: p.civilStatus || 'Single',
  heightM: p.heightM != null ? String(p.heightM) : '',
  weightKg: p.weightKg != null ? String(p.weightKg) : '',
  bloodType: p.bloodType || '',
  umidNumber: p.umidNumber || '',
  philsysNumber: p.philsysNumber || '',
  sssNumber: p.sssNumber || '',
  philhealthNumber: p.philhealthNumber || '',
  pagibigNumber: p.pagibigNumber || '',
  tinNumber: p.tinNumber || '',
  citizenship: p.citizenship || '',
  citizenshipBasis: p.citizenshipBasis || '',
  dualCitizenshipCountry: p.dualCitizenshipCountry || '',
  telephoneNumber: p.telephoneNumber || '',
  mobileNumber: p.mobileNumber || '',
  email: p.email || '',
  spouseSurname: p.spouseSurname || '',
  spouseFirstName: p.spouseFirstName || '',
  spouseMiddleName: p.spouseMiddleName || '',
  spouseNameExtension: p.spouseNameExtension || '',
  spouseOccupation: p.spouseOccupation || '',
  spouseEmployer: p.spouseEmployer || '',
  spouseBusinessAddress: p.spouseBusinessAddress || '',
  spouseTelephone: p.spouseTelephone || '',
  fatherSurname: p.fatherSurname || '',
  fatherFirstName: p.fatherFirstName || '',
  fatherMiddleName: p.fatherMiddleName || '',
  fatherNameExtension: p.fatherNameExtension || '',
  motherSurname: p.motherSurname || '',
  motherFirstName: p.motherFirstName || '',
  motherMiddleName: p.motherMiddleName || '',
  specialSkillsHobbies: p.specialSkillsHobbies || '',
  nonAcademicDistinctions: p.nonAcademicDistinctions || '',
  membershipAssociations: p.membershipAssociations || '',
  relatedThirdDegree: p.relatedThirdDegree ?? null,
  relatedFourthDegree: p.relatedFourthDegree ?? null,
  relatedDetails: p.relatedDetails || '',
  adminOffenseGuilty: p.adminOffenseGuilty ?? null,
  adminOffenseDetails: p.adminOffenseDetails || '',
  criminallyCharged: p.criminallyCharged ?? null,
  criminalChargeDetails: p.criminalChargeDetails || '',
  criminalCaseDateFiled: p.criminalCaseDateFiled || '',
  criminalCaseStatus: p.criminalCaseStatus || '',
  convictedOfCrime: p.convictedOfCrime ?? null,
  convictedDetails: p.convictedDetails || '',
  separatedFromService: p.separatedFromService ?? null,
  separatedDetails: p.separatedDetails || '',
  electionCandidate: p.electionCandidate ?? null,
  electionCandidateDetails: p.electionCandidateDetails || '',
  resignedToCampaign: p.resignedToCampaign ?? null,
  resignedToCampaignDetails: p.resignedToCampaignDetails || '',
  immigrantStatus: p.immigrantStatus ?? null,
  immigrantCountry: p.immigrantCountry || '',
  indigenousGroupMember: p.indigenousGroupMember ?? null,
  indigenousGroupSpecify: p.indigenousGroupSpecify || '',
  personWithDisability: p.personWithDisability ?? null,
  pwdIdNumber: p.pwdIdNumber || '',
  soloParent: p.soloParent ?? null,
  soloParentIdNumber: p.soloParentIdNumber || '',
  govIdType: p.govIdType || '',
  govIdNumber: p.govIdNumber || '',
  govIdIssuedDatePlace: p.govIdIssuedDatePlace || '',
});

// ── Small field primitives, styled to match the rest of the employee portal ──

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  disabled?: boolean;
  placeholder?: string;
}> = ({ label, value, onChange, type = 'text', disabled = false, placeholder }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold" style={{ color: BRAND.navy }}>{label}</span>
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      style={{ borderColor: BRAND.line, color: BRAND.navy }}
    />
  </label>
);

const SelectField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  disabled?: boolean;
}> = ({ label, value, onChange, options, disabled = false }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold" style={{ color: BRAND.navy }}>{label}</span>
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      style={{ borderColor: BRAND.line, color: BRAND.navy }}
    >
      <option value="">Select…</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  </label>
);

const SectionCard: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <section className="rounded-xl border bg-white p-5" style={{ borderColor: BRAND.line }}>
    <div className="mb-4">
      <h2 className="text-lg font-bold" style={{ color: BRAND.blue }}>{title}</h2>
      {description && <p className="text-sm" style={{ color: BRAND.navy, opacity: 0.7 }}>{description}</p>}
    </div>
    <div className="space-y-4">{children}</div>
  </section>
);

const TextAreaField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
}> = ({ label, value, onChange, rows = 4, placeholder, disabled = false }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold" style={{ color: BRAND.navy }}>{label}</span>
    <textarea
      rows={rows}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      style={{ borderColor: BRAND.line, color: BRAND.navy }}
    />
  </label>
);

/** Tri-state Yes/No toggle for a legal disclosure: unanswered (null) is not the same as "No". Clicking the selected option again clears it back to unanswered. */
const YesNoField: React.FC<{
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  disabled?: boolean;
}> = ({ label, value, onChange, disabled = false }) => (
  <div>
    <span className="mb-1 block text-xs font-semibold" style={{ color: BRAND.navy }}>{label}</span>
    <div className="flex gap-2">
      {([['Yes', true], ['No', false]] as const).map(([text, boolVal]) => {
        const isSelected = value === boolVal;
        return (
          <button
            key={text}
            type="button"
            disabled={disabled}
            onClick={() => onChange(isSelected ? null : boolVal)}
            className="rounded-md px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              border: isSelected ? `1.5px solid ${BRAND.blue}` : `1.5px solid ${BRAND.line}`,
              background: isSelected ? BRAND.blue : '#ffffff',
              color: isSelected ? '#ffffff' : BRAND.navy,
            }}
          >
            {text}
          </button>
        );
      })}
    </div>
  </div>
);

const AddressFields: React.FC<{ value: AddressParts; onChange: (v: AddressParts) => void }> = ({ value, onChange }) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
    <Field label="House/Block/Lot No." value={value.houseLot || ''} onChange={(v) => onChange({ ...value, houseLot: v })} />
    <Field label="Street" value={value.street || ''} onChange={(v) => onChange({ ...value, street: v })} />
    <Field label="Subdivision/Village" value={value.subdivision || ''} onChange={(v) => onChange({ ...value, subdivision: v })} />
    <Field label="Barangay" value={value.barangay || ''} onChange={(v) => onChange({ ...value, barangay: v })} />
    <Field label="City/Municipality" value={value.city || ''} onChange={(v) => onChange({ ...value, city: v })} />
    <Field label="Province" value={value.province || ''} onChange={(v) => onChange({ ...value, province: v })} />
    <Field label="ZIP Code" value={value.zip || ''} onChange={(v) => onChange({ ...value, zip: v })} />
  </div>
);

const GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'] as const;
const CIVIL_STATUS_OPTIONS = ['Single', 'Married', 'Widowed', 'Divorced', 'Separated'] as const;
const CITIZENSHIP_BASIS_OPTIONS = ['By birth', 'By naturalization'] as const;

type SubTab =
  | 'personal' | 'family' | 'education'
  | 'eligibility' | 'workExperience' | 'voluntaryWork' | 'training'
  | 'otherInfo' | 'background';

const SUB_TABS: { id: SubTab; label: string; numeral: string }[] = [
  { id: 'personal', label: 'Personal Information', numeral: 'I' },
  { id: 'family', label: 'Family Background', numeral: 'II' },
  { id: 'education', label: 'Educational Background', numeral: 'III' },
  { id: 'eligibility', label: 'Civil Service Eligibility', numeral: 'IV' },
  { id: 'workExperience', label: 'Work Experience', numeral: 'V' },
  { id: 'voluntaryWork', label: 'Voluntary Work', numeral: 'VI' },
  { id: 'training', label: 'Learning & Development', numeral: 'VII' },
  { id: 'otherInfo', label: 'Other Information', numeral: 'VIII' },
  { id: 'background', label: 'Background Information', numeral: 'IX' },
];

interface LoadedLists {
  children?: EmployeeChild[];
  education?: EmployeeEducation[];
  eligibility?: EmployeeEligibility[];
  workExperience?: EmployeeWorkExperience[];
  voluntaryWork?: EmployeeVoluntaryWork[];
  ldInterventions?: EmployeeLdIntervention[];
  references?: EmployeeReference[];
}

const hasText = (v: string | null | undefined) => !!v && v.trim() !== '';

const describePdsIssues = (issues: PdsFieldIssue[]) =>
  issues.map((issue) => `Row ${issue.rowIndex + 1}: ${issue.message}`).join(' ');

/**
 * Sections that already hold saved data. Adjust the field choices here.
 * Scalar sections read `profile`; list sections read only the lists passed in
 * (omitted list = unknown, so it never counts).
 */
export function getInitiallySavedSections(profile: Employee, lists: LoadedLists): Set<SubTab> {
  const saved = new Set<SubTab>();
  // Not the name: HR fills that in at hire. Place of birth only comes from the employee's own PDS save.
  if (hasText(profile.placeOfBirth)) saved.add('personal');
  if (
    [
      profile.spouseSurname, profile.spouseFirstName,
      profile.fatherSurname, profile.fatherFirstName,
      profile.motherSurname, profile.motherFirstName,
    ].some(hasText) ||
    (lists.children?.length ?? 0) > 0
  ) saved.add('family');
  if (lists.education?.some((r) => hasText(r.school))) saved.add('education');
  if ((lists.eligibility?.length ?? 0) > 0) saved.add('eligibility');
  if ((lists.workExperience?.length ?? 0) > 0) saved.add('workExperience');
  if ((lists.voluntaryWork?.length ?? 0) > 0) saved.add('voluntaryWork');
  if ((lists.ldInterventions?.length ?? 0) > 0) saved.add('training');
  if ([profile.specialSkillsHobbies, profile.nonAcademicDistinctions, profile.membershipAssociations].some(hasText)) saved.add('otherInfo');
  if (
    profile.relatedThirdDegree != null ||
    profile.personWithDisability != null ||
    hasText(profile.govIdType) ||
    (lists.references?.length ?? 0) > 0
  ) saved.add('background');
  return saved;
}

/** Back/Next between sections, reachable without scrolling back up to the tab bar. Reuses whatever handler the tab bar itself uses, so behavior (including clearing stale save banners) stays identical either way. */
const TabNavBar: React.FC<{ activeTab: SubTab; onSelect: (t: SubTab) => void }> = ({ activeTab, onSelect }) => {
  const idx = SUB_TABS.findIndex((t) => t.id === activeTab);
  const prev = idx > 0 ? SUB_TABS[idx - 1] : null;
  const next = idx < SUB_TABS.length - 1 ? SUB_TABS[idx + 1] : null;
  const navButtonStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
    borderRadius: 8, padding: '0.45rem 0.9rem',
    fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
    border: `1.5px solid ${BRAND.line}`, background: '#ffffff', color: BRAND.navy,
  };
  return (
    <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: BRAND.line }}>
      {prev ? (
        <button type="button" onClick={() => onSelect(prev.id)} style={navButtonStyle}>
          <ChevronLeft className="h-3.5 w-3.5" /> Back: {prev.label}
        </button>
      ) : <span />}
      {next ? (
        <button type="button" onClick={() => onSelect(next.id)} style={navButtonStyle}>
          Next: {next.label} <ChevronRight className="h-3.5 w-3.5" />
        </button>
      ) : <span />}
    </div>
  );
};

const SaveBar: React.FC<{
  saving: boolean;
  disabled?: boolean;
  onSave: () => void;
  label: string;
  lastSaved?: string;
}> = ({ saving, disabled = false, onSave, label, lastSaved }) => (
  <div className="flex items-center justify-between pt-1">
    {lastSaved ? (
      <p className="text-xs" style={{ color: BRAND.navy, opacity: 0.6 }}>
        Last saved {new Date(lastSaved).toLocaleString()}
      </p>
    ) : <span />}
    <button
      type="button"
      onClick={onSave}
      disabled={saving || disabled}
      aria-busy={saving || undefined}
      className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
      style={{ background: BRAND.blue }}
    >
      {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {label}
    </button>
  </div>
);

/** Compare two address blocks field by field, treating a missing part as blank. */
const addressEquals = (a: AddressParts, b: AddressParts) =>
  (Object.keys(emptyAddress()) as Array<keyof AddressParts>).every(
    (key) => (a[key] || '') === (b[key] || ''),
  );

/** Only the fields the caller submitted, taken from the checked returned row. */
const pickConfirmedFields = (
  confirmed: Employee,
  submitted: Partial<Employee>,
): Partial<Employee> => {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(submitted)) {
    out[key] = (confirmed as unknown as Record<string, unknown>)[key];
  }
  return out as Partial<Employee>;
};

export type PdsSectionStatus = 'loading' | 'ready' | 'failed' | 'saving' | 'uncertain';

type SectionState<Row> = {
  status: PdsSectionStatus;
  revision: string | null;
  baselineRows: Row[];
  baselineScalars?: Partial<Employee>;
  draftRows: Row[];
  loadError: string | null;
  conflictError: string | null;
  pendingConflictReload: boolean;
  uncertainCheckFailed: boolean;
  pendingSave?: {
    preSaveRevision: string;
    rows: Row[];
    scalars?: Partial<Employee>;
    submittedDraft: ScalarDraft;
  };
};

type ListSectionStateMap = {
  children: SectionState<EmployeeChild>;
  education: SectionState<EmployeeEducation>;
  eligibility: SectionState<EmployeeEligibility>;
  workExperience: SectionState<EmployeeWorkExperience>;
  voluntaryWork: SectionState<EmployeeVoluntaryWork>;
  training: SectionState<EmployeeLdIntervention>;
  references: SectionState<EmployeeReference>;
};

const LIST_SECTIONS: readonly PdsListSection[] = [
  'children',
  'education',
  'eligibility',
  'workExperience',
  'voluntaryWork',
  'training',
  'references',
];

const SUB_TAB_TO_LIST_SECTION: Partial<Record<SubTab, PdsListSection>> = {
  family: 'children',
  education: 'education',
  eligibility: 'eligibility',
  workExperience: 'workExperience',
  voluntaryWork: 'voluntaryWork',
  training: 'training',
  background: 'references',
};

const FAMILY_SCALAR_KEYS: ReadonlyArray<keyof ScalarDraft> = [
  'spouseSurname', 'spouseFirstName', 'spouseMiddleName', 'spouseNameExtension',
  'spouseOccupation', 'spouseEmployer', 'spouseBusinessAddress', 'spouseTelephone',
  'fatherSurname', 'fatherFirstName', 'fatherMiddleName', 'fatherNameExtension',
  'motherSurname', 'motherFirstName', 'motherMiddleName',
];

const BACKGROUND_SCALAR_KEYS: ReadonlyArray<keyof ScalarDraft> = [
  'relatedThirdDegree', 'relatedFourthDegree', 'relatedDetails',
  'adminOffenseGuilty', 'adminOffenseDetails',
  'criminallyCharged', 'criminalChargeDetails', 'criminalCaseDateFiled', 'criminalCaseStatus',
  'convictedOfCrime', 'convictedDetails',
  'separatedFromService', 'separatedDetails',
  'electionCandidate', 'electionCandidateDetails',
  'resignedToCampaign', 'resignedToCampaignDetails',
  'immigrantStatus', 'immigrantCountry',
  'indigenousGroupMember', 'indigenousGroupSpecify',
  'personWithDisability', 'pwdIdNumber',
  'soloParent', 'soloParentIdNumber',
  'govIdType', 'govIdNumber', 'govIdIssuedDatePlace',
];

const LIST_SECTION_META: Record<PdsListSection, {
  subTab: SubTab;
  label: string;
  successMessage: string;
  listKey: keyof LoadedLists;
  scalarKeys?: ReadonlyArray<keyof ScalarDraft>;
  read: (employeeId: string) => Promise<PdsResult<PdsSectionSnapshot<any>>>;
  save: (
    employeeId: string,
    rows: any[],
    revision: string,
    scalarPatch?: Partial<Employee>,
  ) => Promise<PdsResult<PdsSectionSnapshot<any>>>;
}> = {
  children: {
    subTab: 'family',
    label: 'Family Background',
    successMessage: 'Family Background saved.',
    listKey: 'children',
    scalarKeys: FAMILY_SCALAR_KEYS,
    read: listChildren,
    save: saveChildren,
  },
  education: {
    subTab: 'education',
    label: 'Educational Background',
    successMessage: 'Educational Background saved.',
    listKey: 'education',
    read: listEducation,
    save: saveEducation,
  },
  eligibility: {
    subTab: 'eligibility',
    label: 'Civil Service Eligibility',
    successMessage: 'Civil Service Eligibility saved.',
    listKey: 'eligibility',
    read: listEligibility,
    save: saveEligibility,
  },
  workExperience: {
    subTab: 'workExperience',
    label: 'Work Experience',
    successMessage: 'Work Experience saved.',
    listKey: 'workExperience',
    read: listWorkExperience,
    save: saveWorkExperience,
  },
  voluntaryWork: {
    subTab: 'voluntaryWork',
    label: 'Voluntary Work',
    successMessage: 'Voluntary Work saved.',
    listKey: 'voluntaryWork',
    read: listVoluntaryWork,
    save: saveVoluntaryWork,
  },
  training: {
    subTab: 'training',
    label: 'Learning & Development history',
    successMessage: 'Learning & Development history saved.',
    listKey: 'ldInterventions',
    read: listLdInterventions,
    save: saveLdInterventions,
  },
  references: {
    subTab: 'background',
    label: 'Background Information',
    successMessage: 'Background Information saved.',
    listKey: 'references',
    scalarKeys: BACKGROUND_SCALAR_KEYS,
    read: listReferences,
    save: saveReferences,
  },
};

function createEmptySectionState<Row>(employeeId: string): SectionState<Row> {
  if (!employeeId) {
    return {
      status: 'failed',
      revision: null,
      baselineRows: [],
      draftRows: [],
      loadError: 'Employee record is unavailable.',
      conflictError: null,
      pendingConflictReload: false,
      uncertainCheckFailed: false,
    };
  }
  return {
    status: 'loading',
    revision: null,
    baselineRows: [],
    draftRows: [],
    loadError: null,
    conflictError: null,
    pendingConflictReload: false,
    uncertainCheckFailed: false,
  };
}

function createInitialListSections(employeeId: string): ListSectionStateMap {
  return {
    children: createEmptySectionState<EmployeeChild>(employeeId),
    education: createEmptySectionState<EmployeeEducation>(employeeId),
    eligibility: createEmptySectionState<EmployeeEligibility>(employeeId),
    workExperience: createEmptySectionState<EmployeeWorkExperience>(employeeId),
    voluntaryWork: createEmptySectionState<EmployeeVoluntaryWork>(employeeId),
    training: createEmptySectionState<EmployeeLdIntervention>(employeeId),
    references: createEmptySectionState<EmployeeReference>(employeeId),
  };
}

const isMutationFrozen = (status: PdsSectionStatus): boolean =>
  status === 'failed' || status === 'saving' || status === 'uncertain';

export const PersonalDataSheetSection: React.FC<Props> = ({ employeeId, profile, onSaved }) => {
  const [activeTab, setActiveTab] = useState<SubTab>('personal');
  const [draft, setDraft] = useState<ScalarDraft>(getScalarDraft(profile));
  const [residential, setResidential] = useState<AddressParts>(profile.residential || emptyAddress());
  const [permanent, setPermanent] = useState<AddressParts>(profile.permanent || emptyAddress());
  const [sameAsResidential, setSameAsResidential] = useState(false);

  const [sections, setSections] = useState<ListSectionStateMap>(() =>
    createInitialListSections(employeeId),
  );
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  const updateSection = <S extends PdsListSection>(
    section: S,
    updater: (prev: ListSectionStateMap[S]) => ListSectionStateMap[S],
  ) => {
    const nextSection = updater(sectionsRef.current[section]);
    const nextMap = { ...sectionsRef.current, [section]: nextSection };
    sectionsRef.current = nextMap;
    setSections(nextMap);
  };

  const [scalarSaving, setScalarSaving] = useState(false);
  const [saveErrors, setSaveErrors] = useState<Partial<Record<SubTab, string | null>>>({});
  const [saveSuccesses, setSaveSuccesses] = useState<Partial<Record<SubTab, string | null>>>({});
  const [savedIds, setSavedIds] = useState<Set<SubTab>>(() => getInitiallySavedSections(profile, profile));

  // Which scalar inputs the employee has touched. A confirmed save or a new
  // profile snapshot may refresh only fields that are still clean, so a save in
  // one section can never erase unsaved edits in another.
  const identityKey = employeeId || profile.supabaseId || profile.employeeId;
  const dirtyScalarFields = useRef(new Set<keyof ScalarDraft>());
  const residentialDirty = useRef(false);
  const permanentDirty = useRef(false);
  const loadedIdentity = useRef(identityKey);
  const previousProfile = useRef(profile);
  const residentialRef = useRef(residential);
  const permanentRef = useRef(permanent);
  residentialRef.current = residential;
  permanentRef.current = permanent;
  const loadSeqRef = useRef<Record<PdsListSection, number>>({
    children: 0,
    education: 0,
    eligibility: 0,
    workExperience: 0,
    voluntaryWork: 0,
    training: 0,
    references: 0,
  });

  // A save or load response belongs to the employee and mount it started under.
  // The generation is bumped during render, so a continuation cannot slip through
  // between an identity switch and its reset effect. A → B → A stays stale.
  const currentIdentity = useRef(identityKey);
  const identityGeneration = useRef(0);
  if (currentIdentity.current !== identityKey) {
    currentIdentity.current = identityKey;
    identityGeneration.current += 1;
  }
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const captureMutation = () => ({
    identity: currentIdentity.current,
    generation: identityGeneration.current,
  });
  const isCurrentMutation = (token: { identity: string; generation: number }) =>
    mounted.current &&
    currentIdentity.current === token.identity &&
    identityGeneration.current === token.generation;

  const markSaved = (...ids: SubTab[]) =>
    setSavedIds((prev) => (ids.every((id) => prev.has(id)) ? prev : new Set([...prev, ...ids])));

  const setTabError = (tab: SubTab, error: string | null) =>
    setSaveErrors((prev) => ({ ...prev, [tab]: error }));

  const setTabSuccess = (tab: SubTab, message: string | null) =>
    setSaveSuccesses((prev) => ({ ...prev, [tab]: message }));

  // A different employee means nothing from the previous one may remain: clear
  // the lists, revisions, saved markers and dirty drafts before the new reads.
  useEffect(() => {
    if (loadedIdentity.current === identityKey) return;
    loadedIdentity.current = identityKey;
    dirtyScalarFields.current.clear();
    residentialDirty.current = false;
    permanentDirty.current = false;
    for (const s of LIST_SECTIONS) loadSeqRef.current[s] += 1;
    const resetMap = createInitialListSections(employeeId);
    sectionsRef.current = resetMap;
    setSections(resetMap);
    setDraft(getScalarDraft(profile));
    setResidential(profile.residential || emptyAddress());
    setPermanent(profile.permanent || emptyAddress());
    setSameAsResidential(false);
    setSavedIds(getInitiallySavedSections(profile, {}));
    setSaveErrors({});
    setSaveSuccesses({});
    setScalarSaving(false);
    // Identity is the trigger; profile is read only for the new initial values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityKey]);

  // Hydrate fields whose value actually changed in the profile, including
  // after a confirmed save. An unrelated parent update carries the old
  // family/background values forward; those must not replace the canonical
  // paired-read snapshot in the draft. Dirty fields keep their unsaved input.
  useEffect(() => {
    const before = previousProfile.current;
    const fresh = getScalarDraft(profile);
    const previous = getScalarDraft(before);
    previousProfile.current = profile;
    setDraft((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of Object.keys(fresh) as Array<keyof ScalarDraft>) {
        if (dirtyScalarFields.current.has(key)) continue;
        if (previous[key] === fresh[key]) continue;
        if (prev[key] !== fresh[key]) {
          (next as Record<string, unknown>)[key] = fresh[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    const previousResidential = before.residential || emptyAddress();
    const nextResidential = profile.residential || emptyAddress();
    if (!residentialDirty.current && !addressEquals(previousResidential, nextResidential)) {
      setResidential(nextResidential);
    }
    const previousPermanent = before.permanent || emptyAddress();
    const nextPermanent = profile.permanent || emptyAddress();
    if (!permanentDirty.current && !addressEquals(previousPermanent, nextPermanent)) {
      setPermanent(nextPermanent);
    }
    markSaved(...getInitiallySavedSections(profile, {}));
  }, [profile]);

  const hydrateSectionScalars = (
    section: PdsListSection,
    scalars: Partial<Employee> | undefined,
    overwriteDirty: boolean,
  ) => {
    const meta = LIST_SECTION_META[section];
    if (!meta.scalarKeys || !scalars) return;
    if (overwriteDirty) {
      for (const key of meta.scalarKeys) dirtyScalarFields.current.delete(key);
    }
    if (Object.keys(scalars).length === 0) return;
    const fresh = getScalarDraft(scalars as Employee);
    setDraft((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of meta.scalarKeys!) {
        if (!(key in scalars)) continue;
        if (!overwriteDirty && dirtyScalarFields.current.has(key)) continue;
        if (prev[key] !== fresh[key]) {
          (next as Record<string, unknown>)[key] = fresh[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  };

  const loadListSection = async <S extends PdsListSection>(
    section: S,
    mode: 'initial' | 'retry' | 'conflictReload' | 'reconcileUncertain',
    isCancelled?: () => boolean,
  ) => {
    const meta = LIST_SECTION_META[section];
    if (!employeeId) {
      updateSection(section, (prev) => ({
        ...prev,
        status: 'failed',
        revision: null,
        loadError: 'Employee record is unavailable.',
      }));
      return;
    }

    loadSeqRef.current[section] += 1;
    const seq = loadSeqRef.current[section];
    const mutation = captureMutation();
    const isConflictReload =
      mode === 'conflictReload' ||
      (mode === 'retry' && sectionsRef.current[section].pendingConflictReload);

    if (mode !== 'reconcileUncertain') {
      updateSection(section, (prev) => ({
        ...prev,
        status: 'loading',
        loadError: null,
        conflictError: null,
        pendingConflictReload: isConflictReload,
      }));
      setTabError(meta.subTab, null);
      setTabSuccess(meta.subTab, null);
    }

    const res = await meta.read(employeeId);
    if (isCancelled?.() || !isCurrentMutation(mutation) || seq !== loadSeqRef.current[section]) {
      return;
    }

    if (mode === 'reconcileUncertain') {
      if (res.ok === false) {
        updateSection(section, (prev) => ({
          ...prev,
          status: 'uncertain',
          uncertainCheckFailed: true,
        }));
        return;
      }

      const currentState = sectionsRef.current[section];
      const pending = currentState.pendingSave;
      const canonicalRows = res.data.rows;
      const matched = pending
        ? doesSnapshotMatchIntendedSave(section, pending.rows as never[], pending.scalars, res.data)
        : false;

      if (matched && pending) {
        const nextDraftRows =
          section === 'education'
            ? buildEducationRows(canonicalRows as EmployeeEducation[])
            : canonicalRows;
        updateSection(section, (prev) => ({
          ...prev,
          status: 'ready',
          revision: res.data.revision,
          baselineRows: canonicalRows,
          baselineScalars: res.data.scalars,
          draftRows: nextDraftRows as ListSectionStateMap[S]['draftRows'],
          loadError: null,
          conflictError: null,
          uncertainCheckFailed: false,
          pendingSave: undefined,
        }));
        const confirmedScalars = res.data.scalars ?? {};
        if (pending.scalars) {
          applyConfirmedValues(confirmedScalars, pending.scalars, pending.submittedDraft);
        }
        onSaved(confirmedScalars);
        markSaved(meta.subTab);
        setTabError(meta.subTab, null);
        setTabSuccess(meta.subTab, meta.successMessage);
        return;
      }

      if (pending && res.data.revision === pending.preSaveRevision) {
        updateSection(section, (prev) => ({
          ...prev,
          status: 'ready',
          revision: res.data.revision,
          baselineRows: canonicalRows,
          baselineScalars: res.data.scalars,
          loadError: null,
          conflictError: null,
          uncertainCheckFailed: false,
          pendingSave: undefined,
        }));
        setTabError(
          meta.subTab,
          'Your previous save did not reach the server. Your unsaved edits are still here — review and save again.',
        );
        return;
      }

      updateSection(section, (prev) => ({
        ...prev,
        status: 'ready',
        revision: res.data.revision,
        baselineRows: canonicalRows,
        baselineScalars: res.data.scalars,
        loadError: null,
        conflictError:
          'This section changed on the server and differs from your unsaved draft. Reload it before saving again.',
        uncertainCheckFailed: false,
        pendingSave: undefined,
      }));
      return;
    }

    if (res.ok === false) {
      updateSection(section, (prev) => ({
        ...prev,
        status: 'failed',
        revision: null,
        loadError: res.error || `Failed to load ${meta.label}.`,
        conflictError: null,
        pendingConflictReload: isConflictReload,
      }));
      return;
    }

    const canonicalRows = res.data.rows;
    const nextDraftRows =
      section === 'education'
        ? buildEducationRows(canonicalRows as EmployeeEducation[])
        : canonicalRows;
    updateSection(section, (prev) => ({
      ...prev,
      status: 'ready',
      revision: res.data.revision,
      baselineRows: canonicalRows,
      baselineScalars: res.data.scalars,
      draftRows: nextDraftRows as ListSectionStateMap[S]['draftRows'],
      loadError: null,
      conflictError: null,
      pendingConflictReload: false,
      uncertainCheckFailed: false,
      pendingSave: undefined,
    }));
    hydrateSectionScalars(section, res.data.scalars, isConflictReload);
    markSaved(
      ...getInitiallySavedSections((res.data.scalars ?? {}) as Employee, {
        [meta.listKey]: canonicalRows,
      }),
    );
  };

  useEffect(() => {
    if (!employeeId) {
      const failedMap = createInitialListSections('');
      sectionsRef.current = failedMap;
      setSections(failedMap);
      return;
    }
    let cancelled = false;
    const isCancelled = () => cancelled;
    for (const section of LIST_SECTIONS) {
      void loadListSection(section, 'initial', isCancelled);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  const set = <K extends keyof ScalarDraft>(key: K, value: ScalarDraft[K]) => {
    dirtyScalarFields.current.add(key);
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const editResidential = (value: AddressParts) => {
    residentialDirty.current = true;
    setResidential(value);
  };

  const editPermanent = (value: AddressParts) => {
    permanentDirty.current = true;
    setPermanent(value);
  };

  /**
   * Apply values from the checked returned row to the draft. A field the
   * employee changed while the write was in flight is left alone, so a slow
   * response cannot overwrite newer typing.
   */
  const applyConfirmedValues = (
    confirmed: Partial<Employee>,
    submitted: Partial<Employee>,
    submittedDraft: ScalarDraft,
    submittedAddresses?: { residential: AddressParts; permanent: AddressParts },
  ) => {
    const confirmedDraft = getScalarDraft({ ...profile, ...confirmed } as Employee);
    setDraft((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of Object.keys(submitted) as Array<keyof Employee>) {
        const draftKey = key as keyof ScalarDraft;
        if (!(key in confirmed) || !(draftKey in confirmedDraft)) continue;
        if (prev[draftKey] !== submittedDraft[draftKey]) continue;
        dirtyScalarFields.current.delete(draftKey);
        if (next[draftKey] !== confirmedDraft[draftKey]) {
          (next as Record<string, unknown>)[draftKey] = confirmedDraft[draftKey];
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    if (
      submittedAddresses &&
      confirmed.residential !== undefined &&
      addressEquals(residentialRef.current, submittedAddresses.residential)
    ) {
      residentialDirty.current = false;
      setResidential(confirmed.residential);
    }
    if (
      submittedAddresses &&
      confirmed.permanent !== undefined &&
      addressEquals(permanentRef.current, submittedAddresses.permanent)
    ) {
      permanentDirty.current = false;
      setPermanent(confirmed.permanent);
    }
  };

  const updateDraftRows = <S extends PdsListSection>(
    section: S,
    updater: (rows: ListSectionStateMap[S]['draftRows']) => ListSectionStateMap[S]['draftRows'],
  ) =>
    updateSection(section, (prev) => ({
      ...prev,
      draftRows: updater(prev.draftRows),
    }));

  const addChild = () =>
    updateDraftRows('children', (prev) => [...prev, { fullName: '', dateOfBirth: '' }]);
  const removeChild = (i: number) =>
    updateDraftRows('children', (prev) => prev.filter((_, idx) => idx !== i));
  const updateChild = (i: number, patch: Partial<EmployeeChild>) =>
    updateDraftRows('children', (prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const updateEducation = (i: number, patch: Partial<EmployeeEducation>) =>
    updateDraftRows('education', (prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const addEligibility = () =>
    updateDraftRows('eligibility', (prev) => [...prev, { eligibilityName: '' }]);
  const removeEligibility = (i: number) =>
    updateDraftRows('eligibility', (prev) => prev.filter((_, idx) => idx !== i));
  const updateEligibility = (i: number, patch: Partial<EmployeeEligibility>) =>
    updateDraftRows('eligibility', (prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const addWorkExperience = () =>
    updateDraftRows('workExperience', (prev) => [...prev, { positionTitle: '' }]);
  const removeWorkExperience = (i: number) =>
    updateDraftRows('workExperience', (prev) => prev.filter((_, idx) => idx !== i));
  const updateWorkExperience = (i: number, patch: Partial<EmployeeWorkExperience>) =>
    updateDraftRows('workExperience', (prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const addVoluntaryWork = () =>
    updateDraftRows('voluntaryWork', (prev) => [...prev, { orgNameAddress: '' }]);
  const removeVoluntaryWork = (i: number) =>
    updateDraftRows('voluntaryWork', (prev) => prev.filter((_, idx) => idx !== i));
  const updateVoluntaryWork = (i: number, patch: Partial<EmployeeVoluntaryWork>) =>
    updateDraftRows('voluntaryWork', (prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const addLdIntervention = () =>
    updateDraftRows('training', (prev) => [...prev, { title: '' }]);
  const removeLdIntervention = (i: number) =>
    updateDraftRows('training', (prev) => prev.filter((_, idx) => idx !== i));
  const updateLdIntervention = (i: number, patch: Partial<EmployeeLdIntervention>) =>
    updateDraftRows('training', (prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const addReference = () =>
    updateDraftRows('references', (prev) => [...prev, { name: '' }]);
  const removeReference = (i: number) =>
    updateDraftRows('references', (prev) => prev.filter((_, idx) => idx !== i));
  const updateReference = (i: number, patch: Partial<EmployeeReference>) =>
    updateDraftRows('references', (prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const selectTab = (tab: SubTab) => {
    setActiveTab(tab);
    setTabError(tab, null);
    setTabSuccess(tab, null);
  };

  const savePersonalInfo = async () => {
    const mutation = captureMutation();
    setScalarSaving(true);
    setTabError('personal', null);
    setTabSuccess('personal', null);

    const effectivePermanent = sameAsResidential ? residential : permanent;

    const scalarPatch: Partial<Employee> = {
      surname: draft.surname.trim(),
      firstName: draft.firstName.trim(),
      middleName: draft.middleName.trim(),
      nameExtension: draft.nameExtension.trim(),
      dateOfBirth: draft.dateOfBirth.trim(),
      placeOfBirth: draft.placeOfBirth.trim(),
      gender: draft.gender,
      civilStatus: draft.civilStatus,
      heightM: draft.heightM.trim() ? Number.parseFloat(draft.heightM) : null,
      weightKg: draft.weightKg.trim() ? Number.parseFloat(draft.weightKg) : null,
      bloodType: draft.bloodType.trim(),
      umidNumber: draft.umidNumber.trim(),
      philsysNumber: draft.philsysNumber.trim(),
      sssNumber: draft.sssNumber.trim(),
      philhealthNumber: draft.philhealthNumber.trim(),
      pagibigNumber: draft.pagibigNumber.trim(),
      tinNumber: draft.tinNumber.trim(),
      citizenship: draft.citizenship.trim(),
      citizenshipBasis: draft.citizenshipBasis || undefined,
      dualCitizenshipCountry: draft.dualCitizenshipCountry.trim(),
      telephoneNumber: draft.telephoneNumber.trim(),
      mobileNumber: draft.mobileNumber.trim(),
      email: draft.email.trim(),
      residential,
      permanent: effectivePermanent,
    };
    const submittedDraft = { ...draft };
    const submittedAddresses = { residential, permanent: effectivePermanent };

    const res = await patchPortalEmployee(employeeId, scalarPatch);
    if (!isCurrentMutation(mutation)) return;
    if (res.ok === false) {
      setTabError('personal', res.error ?? 'Failed to save Personal Information. Please try again.');
      setScalarSaving(false);
      return;
    }

    applyConfirmedValues(res.data, scalarPatch, submittedDraft, submittedAddresses);
    onSaved(pickConfirmedFields(res.data, scalarPatch));
    setTabSuccess('personal', 'Personal Information saved.');
    markSaved('personal');
    setScalarSaving(false);
  };

  const saveListSection = async <S extends PdsListSection>(
    section: S,
    scalarPatch?: Partial<Employee>,
  ) => {
    const meta = LIST_SECTION_META[section];
    const current = sectionsRef.current[section];

    setTabError(meta.subTab, null);
    setTabSuccess(meta.subTab, null);

    if (!employeeId || current.status === 'failed' || current.status === 'saving' || current.status === 'uncertain' || current.conflictError) {
      return;
    }

    if (current.status !== 'ready' || !current.revision) {
      setTabError(meta.subTab, `Reload ${meta.label} before saving.`);
      return;
    }

    const issues = validatePdsRows(section, current.draftRows as never[]);
    if (issues.length > 0) {
      setTabError(meta.subTab, describePdsIssues(issues));
      return;
    }

    const mutation = captureMutation();
    const preSaveRevision = current.revision;
    const intendedRows = current.draftRows;
    const submittedDraft = { ...draft };

    updateSection(section, (prev) => ({
      ...prev,
      status: 'saving',
      conflictError: null,
    }));

    const res =
      scalarPatch !== undefined
        ? await meta.save(employeeId, intendedRows, preSaveRevision, scalarPatch)
        : await meta.save(employeeId, intendedRows, preSaveRevision);

    if (!isCurrentMutation(mutation)) return;

    if (res.ok === false) {
      if (res.kind === 'conflict') {
        updateSection(section, (prev) => ({
          ...prev,
          status: 'ready',
          conflictError:
            res.error ?? 'This section changed since it was loaded. Reload it before saving again.',
        }));
        return;
      }

      if (res.kind === 'uncertain') {
        updateSection(section, (prev) => ({
          ...prev,
          status: 'uncertain',
          uncertainCheckFailed: false,
          pendingSave: {
            preSaveRevision,
            rows: intendedRows,
            scalars: scalarPatch,
            submittedDraft,
          },
        }));
        return;
      }

      updateSection(section, (prev) => ({
        ...prev,
        status: 'ready',
      }));
      setTabError(
        meta.subTab,
        res.fieldIssues?.length
          ? describePdsIssues(res.fieldIssues)
          : res.error ?? `Failed to save ${meta.label}. Please try again.`,
      );
      return;
    }

    const canonicalRows = res.data.rows;
    const nextDraftRows =
      section === 'education'
        ? buildEducationRows(canonicalRows as EmployeeEducation[])
        : canonicalRows;
    updateSection(section, (prev) => ({
      ...prev,
      status: 'ready',
      revision: res.data.revision,
      baselineRows: canonicalRows,
      baselineScalars: res.data.scalars,
      draftRows: nextDraftRows as ListSectionStateMap[S]['draftRows'],
      loadError: null,
      conflictError: null,
      uncertainCheckFailed: false,
      pendingSave: undefined,
    }));

    const confirmedScalars = res.data.scalars ?? {};
    if (scalarPatch !== undefined) {
      applyConfirmedValues(confirmedScalars, scalarPatch, submittedDraft);
    }
    onSaved(confirmedScalars);
    setTabSuccess(meta.subTab, meta.successMessage);
    markSaved(meta.subTab);
  };

  const saveFamilyBackground = () =>
    saveListSection('children', {
      spouseSurname: draft.spouseSurname.trim(),
      spouseFirstName: draft.spouseFirstName.trim(),
      spouseMiddleName: draft.spouseMiddleName.trim(),
      spouseNameExtension: draft.spouseNameExtension.trim(),
      spouseOccupation: draft.spouseOccupation.trim(),
      spouseEmployer: draft.spouseEmployer.trim(),
      spouseBusinessAddress: draft.spouseBusinessAddress.trim(),
      spouseTelephone: draft.spouseTelephone.trim(),
      fatherSurname: draft.fatherSurname.trim(),
      fatherFirstName: draft.fatherFirstName.trim(),
      fatherMiddleName: draft.fatherMiddleName.trim(),
      fatherNameExtension: draft.fatherNameExtension.trim(),
      motherSurname: draft.motherSurname.trim(),
      motherFirstName: draft.motherFirstName.trim(),
      motherMiddleName: draft.motherMiddleName.trim(),
    });

  const saveOtherInfoSection = async () => {
    const mutation = captureMutation();
    setScalarSaving(true);
    setTabError('otherInfo', null);
    setTabSuccess('otherInfo', null);

    const scalarPatch: Partial<Employee> = {
      specialSkillsHobbies: draft.specialSkillsHobbies.trim(),
      nonAcademicDistinctions: draft.nonAcademicDistinctions.trim(),
      membershipAssociations: draft.membershipAssociations.trim(),
    };
    const submittedDraft = { ...draft };

    const res = await patchPortalEmployee(employeeId, scalarPatch);
    if (!isCurrentMutation(mutation)) return;
    if (res.ok === false) {
      setTabError('otherInfo', res.error ?? 'Failed to save Other Information. Please try again.');
      setScalarSaving(false);
      return;
    }

    applyConfirmedValues(res.data, scalarPatch, submittedDraft);
    onSaved(pickConfirmedFields(res.data, scalarPatch));
    setTabSuccess('otherInfo', 'Other Information saved.');
    markSaved('otherInfo');
    setScalarSaving(false);
  };

  const saveBackgroundSection = () =>
    saveListSection('references', {
      relatedThirdDegree: draft.relatedThirdDegree,
      relatedFourthDegree: draft.relatedFourthDegree,
      relatedDetails: draft.relatedDetails.trim(),
      adminOffenseGuilty: draft.adminOffenseGuilty,
      adminOffenseDetails: draft.adminOffenseDetails.trim(),
      criminallyCharged: draft.criminallyCharged,
      criminalChargeDetails: draft.criminalChargeDetails.trim(),
      criminalCaseDateFiled: draft.criminalCaseDateFiled.trim(),
      criminalCaseStatus: draft.criminalCaseStatus.trim(),
      convictedOfCrime: draft.convictedOfCrime,
      convictedDetails: draft.convictedDetails.trim(),
      separatedFromService: draft.separatedFromService,
      separatedDetails: draft.separatedDetails.trim(),
      electionCandidate: draft.electionCandidate,
      electionCandidateDetails: draft.electionCandidateDetails.trim(),
      resignedToCampaign: draft.resignedToCampaign,
      resignedToCampaignDetails: draft.resignedToCampaignDetails.trim(),
      immigrantStatus: draft.immigrantStatus,
      immigrantCountry: draft.immigrantCountry.trim(),
      indigenousGroupMember: draft.indigenousGroupMember,
      indigenousGroupSpecify: draft.indigenousGroupSpecify.trim(),
      personWithDisability: draft.personWithDisability,
      pwdIdNumber: draft.pwdIdNumber.trim(),
      soloParent: draft.soloParent,
      soloParentIdNumber: draft.soloParentIdNumber.trim(),
      govIdType: draft.govIdType.trim(),
      govIdNumber: draft.govIdNumber.trim(),
      govIdIssuedDatePlace: draft.govIdIssuedDatePlace.trim(),
    });

  const visibleSavedIds = new Set(savedIds);
  for (const section of LIST_SECTIONS) {
    const status = sections[section].status;
    if (status === 'failed' || status === 'uncertain') {
      visibleSavedIds.delete(LIST_SECTION_META[section].subTab);
    }
  }

  const activeListSection = SUB_TAB_TO_LIST_SECTION[activeTab];
  const activeListState = activeListSection ? sections[activeListSection] : undefined;
  const activeMeta = activeListSection ? LIST_SECTION_META[activeListSection] : undefined;
  const activeSaveError = saveErrors[activeTab] ?? null;
  const activeSaveSuccess = saveSuccesses[activeTab] ?? null;

  const children = sections.children.draftRows;
  const education = sections.education.draftRows;
  const eligibility = sections.eligibility.draftRows;
  const workExperience = sections.workExperience.draftRows;
  const voluntaryWork = sections.voluntaryWork.draftRows;
  const ldInterventions = sections.training.draftRows;
  const references = sections.references.draftRows;

  const familyFrozen = isMutationFrozen(sections.children.status);
  const educationFrozen = isMutationFrozen(sections.education.status);
  const eligibilityFrozen = isMutationFrozen(sections.eligibility.status);
  const workFrozen = isMutationFrozen(sections.workExperience.status);
  const voluntaryFrozen = isMutationFrozen(sections.voluntaryWork.status);
  const trainingFrozen = isMutationFrozen(sections.training.status);
  const backgroundFrozen = isMutationFrozen(sections.references.status);

  const isListSaveDisabled = (section: PdsListSection): boolean => {
    const state = sections[section];
    return isMutationFrozen(state.status) || Boolean(state.conflictError);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <PdsStepList steps={SUB_TABS} activeId={activeTab} savedIds={visibleSavedIds} onSelect={selectTab} />
        <div className="min-w-0 flex-1 space-y-5">

      {activeListSection && activeListState && activeMeta && activeListState.status === 'failed' && (
        <ErrorBanner
          error={activeListState.loadError}
          action={`load ${activeMeta.label}`}
          onRetry={() => void loadListSection(activeListSection, 'retry')}
        />
      )}
      {activeListSection && activeListState && activeMeta && activeListState.status === 'uncertain' && (
        <ActionFeedback
          tone="warning"
          title={`We couldn't confirm whether ${activeMeta.label} saved.`}
          message={
            activeListState.uncertainCheckFailed
              ? "We still couldn't reach the server to check the saved records. Your edits are kept here."
              : 'The connection dropped before the server responded. Your changes may or may not have been saved.'
          }
          nextStep="Check the latest saved records before making more changes."
          onRetry={() => void loadListSection(activeListSection, 'reconcileUncertain')}
          retryLabel={activeListState.uncertainCheckFailed ? 'Retry check' : 'Check saved status'}
        />
      )}
      {activeListSection && activeListState && activeMeta && activeListState.status !== 'failed' && activeListState.status !== 'uncertain' && activeListState.conflictError && (
        <ActionFeedback
          tone="error"
          title={`We couldn't save ${activeMeta.label}.`}
          message={activeListState.conflictError}
          nextStep="Reload the latest saved records before saving again."
          onRetry={() => void loadListSection(activeListSection, 'conflictReload')}
          retryLabel="Reload"
        />
      )}
      {(!activeListState || (activeListState.status !== 'failed' && activeListState.status !== 'uncertain' && !activeListState.conflictError)) && activeSaveError && (
        <ActionFeedback
          title="We couldn't save this section."
          message={activeSaveError}
          nextStep="Check the marked fields and your connection, then save again."
          onDismiss={() => setTabError(activeTab, null)}
        />
      )}
      {activeSaveSuccess && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{activeSaveSuccess}</p>
      )}

      {activeTab === 'personal' && (
      <SectionCard title="I. Personal Information">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Field label="Surname" value={draft.surname} onChange={(v) => set('surname', v)} />
          <Field label="First Name" value={draft.firstName} onChange={(v) => set('firstName', v)} />
          <Field label="Middle Name" value={draft.middleName} onChange={(v) => set('middleName', v)} />
          <Field label="Name Extension (Jr., Sr.)" value={draft.nameExtension} onChange={(v) => set('nameExtension', v)} />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Field label="Date of Birth" type="date" value={draft.dateOfBirth} onChange={(v) => set('dateOfBirth', v)} />
          <Field label="Place of Birth" value={draft.placeOfBirth} onChange={(v) => set('placeOfBirth', v)} />
          <SelectField label="Sex at Birth" value={draft.gender} onChange={(v) => set('gender', v as Employee['gender'])} options={GENDER_OPTIONS} />
          <SelectField label="Civil Status" value={draft.civilStatus} onChange={(v) => set('civilStatus', v as Employee['civilStatus'])} options={CIVIL_STATUS_OPTIONS} />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Field label="Height (m)" type="number" value={draft.heightM} onChange={(v) => set('heightM', v)} />
          <Field label="Weight (kg)" type="number" value={draft.weightKg} onChange={(v) => set('weightKg', v)} />
          <Field label="Blood Type" value={draft.bloodType} onChange={(v) => set('bloodType', v)} />
          <Field label="Agency Employee No." value={profile.agencyEmployeeNo || profile.employeeId || ''} onChange={() => {}} disabled />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Field label="UMID ID No." value={draft.umidNumber} onChange={(v) => set('umidNumber', v)} />
          <Field label="PhilSys Number (PSN)" value={draft.philsysNumber} onChange={(v) => set('philsysNumber', v)} />
          <Field label="PAG-IBIG No." value={draft.pagibigNumber} onChange={(v) => set('pagibigNumber', v)} />
          <Field label="PhilHealth No." value={draft.philhealthNumber} onChange={(v) => set('philhealthNumber', v)} />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Field label="TIN No." value={draft.tinNumber} onChange={(v) => set('tinNumber', v)} />
          <Field label="SSS No." value={draft.sssNumber} onChange={(v) => set('sssNumber', v)} />
          <SelectField label="Citizenship" value={draft.citizenshipBasis} onChange={(v) => set('citizenshipBasis', v as ScalarDraft['citizenshipBasis'])} options={CITIZENSHIP_BASIS_OPTIONS} />
          <Field label="If dual citizen, country" value={draft.dualCitizenshipCountry} onChange={(v) => set('dualCitizenshipCountry', v)} />
        </div>

        <div>
          <h3 className="mb-2 text-sm font-bold" style={{ color: BRAND.navy }}>Residential Address</h3>
          <AddressFields value={residential} onChange={editResidential} />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold" style={{ color: BRAND.navy }}>Permanent Address</h3>
            <label className="flex items-center gap-2 text-xs font-medium" style={{ color: BRAND.navy }}>
              <input
                type="checkbox"
                checked={sameAsResidential}
                onChange={(e) => setSameAsResidential(e.target.checked)}
              />
              Same as residential
            </label>
          </div>
          {!sameAsResidential && <AddressFields value={permanent} onChange={editPermanent} />}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Telephone No." value={draft.telephoneNumber} onChange={(v) => set('telephoneNumber', v)} />
          <Field label="Mobile No." value={draft.mobileNumber} onChange={(v) => set('mobileNumber', v)} />
          <Field label="E-mail Address" type="email" value={draft.email} onChange={(v) => set('email', v)} />
        </div>

        <TabNavBar activeTab={activeTab} onSelect={selectTab} />
        <SaveBar saving={scalarSaving} onSave={() => void savePersonalInfo()} label="Save Personal Information" lastSaved={profile.pdsUpdatedAt} />
      </SectionCard>
      )}

      {activeTab === 'family' && (
      <SectionCard title="II. Family Background">
        <div>
          <h3 className="mb-2 text-sm font-bold" style={{ color: BRAND.navy }}>Spouse</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Field label="Surname" value={draft.spouseSurname} disabled={familyFrozen} onChange={(v) => set('spouseSurname', v)} />
            <Field label="First Name" value={draft.spouseFirstName} disabled={familyFrozen} onChange={(v) => set('spouseFirstName', v)} />
            <Field label="Middle Name" value={draft.spouseMiddleName} disabled={familyFrozen} onChange={(v) => set('spouseMiddleName', v)} />
            <Field label="Name Extension" value={draft.spouseNameExtension} disabled={familyFrozen} onChange={(v) => set('spouseNameExtension', v)} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
            <Field label="Occupation" value={draft.spouseOccupation} disabled={familyFrozen} onChange={(v) => set('spouseOccupation', v)} />
            <Field label="Employer/Business Name" value={draft.spouseEmployer} disabled={familyFrozen} onChange={(v) => set('spouseEmployer', v)} />
            <Field label="Business Address" value={draft.spouseBusinessAddress} disabled={familyFrozen} onChange={(v) => set('spouseBusinessAddress', v)} />
            <Field label="Telephone No." value={draft.spouseTelephone} disabled={familyFrozen} onChange={(v) => set('spouseTelephone', v)} />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold" style={{ color: BRAND.navy }}>Children</h3>
            <button
              type="button"
              disabled={familyFrozen}
              onClick={addChild}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: BRAND.line, color: BRAND.blue, background: 'var(--color-primary-50)' }}
            >
              <Plus className="h-3 w-3" /> Add child
            </button>
          </div>
          {sections.children.status === 'loading' && (
            <p className="text-sm" style={{ color: BRAND.navy, opacity: 0.6 }}>Loading…</p>
          )}
          {sections.children.status === 'ready' && children.length === 0 && (
            <p className="text-xs italic" style={{ color: BRAND.navy, opacity: 0.6 }}>No children on record.</p>
          )}
          <div className="space-y-2">
            {children.map((child, i) => (
              <div key={child.id ?? i} className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_180px_auto]">
                <Field label="Full Name" value={child.fullName} disabled={familyFrozen} onChange={(v) => updateChild(i, { fullName: v })} />
                <Field label="Date of Birth" type="date" value={child.dateOfBirth || ''} disabled={familyFrozen} onChange={(v) => updateChild(i, { dateOfBirth: v })} />
                <button
                  type="button"
                  disabled={familyFrozen}
                  onClick={() => removeChild(i)}
                  className="inline-flex h-9 items-center justify-center rounded-md border px-2 text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ borderColor: BRAND.line }}
                  aria-label="Remove child"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-bold" style={{ color: BRAND.navy }}>Father</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Field label="Surname" value={draft.fatherSurname} disabled={familyFrozen} onChange={(v) => set('fatherSurname', v)} />
            <Field label="First Name" value={draft.fatherFirstName} disabled={familyFrozen} onChange={(v) => set('fatherFirstName', v)} />
            <Field label="Middle Name" value={draft.fatherMiddleName} disabled={familyFrozen} onChange={(v) => set('fatherMiddleName', v)} />
            <Field label="Name Extension" value={draft.fatherNameExtension} disabled={familyFrozen} onChange={(v) => set('fatherNameExtension', v)} />
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-bold" style={{ color: BRAND.navy }}>Mother's Maiden Name</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field label="Surname" value={draft.motherSurname} disabled={familyFrozen} onChange={(v) => set('motherSurname', v)} />
            <Field label="First Name" value={draft.motherFirstName} disabled={familyFrozen} onChange={(v) => set('motherFirstName', v)} />
            <Field label="Middle Name" value={draft.motherMiddleName} disabled={familyFrozen} onChange={(v) => set('motherMiddleName', v)} />
          </div>
        </div>

        <TabNavBar activeTab={activeTab} onSelect={selectTab} />
        <SaveBar saving={sections.children.status === 'saving'} disabled={isListSaveDisabled('children')} onSave={() => void saveFamilyBackground()} label="Save Family Background" />
      </SectionCard>
      )}

      {activeTab === 'education' && (
      <SectionCard title="III. Educational Background" description="Elementary through Doctorate.">
        {sections.education.status === 'loading' && (
          <p className="text-sm" style={{ color: BRAND.navy, opacity: 0.6 }}>Loading…</p>
        )}
        {sections.education.status !== 'loading' && education.length > 0 && (
          <div className="space-y-4">
            {education.map((row, i) => (
              <div key={row.id ?? `${row.level}-${i}`} className="rounded-lg border p-3" style={{ borderColor: BRAND.line }}>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: BRAND.blue }}>{EDUCATION_LEVEL_LABELS[row.level] ?? row.level}</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Field label="Name of School" value={row.school || ''} disabled={educationFrozen} onChange={(v) => updateEducation(i, { school: v })} />
                  <Field label="Basic Education/Degree/Course" value={row.degree || ''} disabled={educationFrozen} onChange={(v) => updateEducation(i, { degree: v })} />
                  <Field label="Units Earned (if not graduated)" type="number" value={row.highestLevelUnits != null ? String(row.highestLevelUnits) : ''} disabled={educationFrozen} onChange={(v) => updateEducation(i, { highestLevelUnits: v ? Number(v) : null })} />
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <Field label="Year Attended From" type="number" value={row.periodFrom != null ? String(row.periodFrom) : ''} disabled={educationFrozen} onChange={(v) => updateEducation(i, { periodFrom: v ? Number(v) : null })} />
                  <Field label="Year Attended To" type="number" value={row.periodTo != null ? String(row.periodTo) : ''} disabled={educationFrozen} onChange={(v) => updateEducation(i, { periodTo: v ? Number(v) : null })} />
                  <Field label="Year Graduated" type="number" value={row.yearGraduated != null ? String(row.yearGraduated) : ''} disabled={educationFrozen} onChange={(v) => updateEducation(i, { yearGraduated: v ? Number(v) : null })} />
                  <Field label="Scholarship/Academic Honors" value={row.scholarshipHonors || ''} disabled={educationFrozen} onChange={(v) => updateEducation(i, { scholarshipHonors: v })} />
                </div>
              </div>
            ))}
          </div>
        )}

        <TabNavBar activeTab={activeTab} onSelect={selectTab} />
        <SaveBar saving={sections.education.status === 'saving'} disabled={isListSaveDisabled('education')} onSave={() => void saveListSection('education')} label="Save Educational Background" />
      </SectionCard>
      )}

      {activeTab === 'eligibility' && (
      <SectionCard title="IV. Civil Service Eligibility">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs" style={{ color: BRAND.navy, opacity: 0.7 }}>CES/CSEE/Career Service/RA 1080 (Board/Bar)/Under Special Laws/eligibilities for uniformed personnel.</p>
          <button
            type="button"
            disabled={eligibilityFrozen}
            onClick={addEligibility}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: BRAND.line, color: BRAND.blue, background: 'var(--color-primary-50)' }}
          >
            <Plus className="h-3 w-3" /> Add eligibility
          </button>
        </div>
        {sections.eligibility.status === 'loading' && (
          <p className="text-sm" style={{ color: BRAND.navy, opacity: 0.6 }}>Loading…</p>
        )}
        {sections.eligibility.status === 'ready' && eligibility.length === 0 && (
          <p className="text-xs italic" style={{ color: BRAND.navy, opacity: 0.6 }}>No eligibility on record.</p>
        )}
        <div className="space-y-3">
          {eligibility.map((row, i) => (
            <div key={row.id ?? i} className="rounded-lg border p-3" style={{ borderColor: BRAND.line }}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold" style={{ color: BRAND.blue }}>Eligibility {i + 1}</p>
                <button type="button" disabled={eligibilityFrozen} onClick={() => removeEligibility(i)} className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-red-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ borderColor: BRAND.line }} aria-label="Remove eligibility">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label="Eligibility" value={row.eligibilityName} disabled={eligibilityFrozen} onChange={(v) => updateEligibility(i, { eligibilityName: v })} />
                <Field label="Rating (if applicable)" type="number" value={row.rating != null ? String(row.rating) : ''} disabled={eligibilityFrozen} onChange={(v) => updateEligibility(i, { rating: v ? Number.parseFloat(v) : null })} />
                <Field label="Date of Examination/Conferment" type="date" value={row.examDate || ''} disabled={eligibilityFrozen} onChange={(v) => updateEligibility(i, { examDate: v })} />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label="Place of Examination/Conferment" value={row.examPlace || ''} disabled={eligibilityFrozen} onChange={(v) => updateEligibility(i, { examPlace: v })} />
                <Field label="License Number" value={row.licenseNumber || ''} disabled={eligibilityFrozen} onChange={(v) => updateEligibility(i, { licenseNumber: v })} />
                <Field label="License Valid Until" type="date" value={row.licenseValidUntil || ''} disabled={eligibilityFrozen} onChange={(v) => updateEligibility(i, { licenseValidUntil: v })} />
              </div>
            </div>
          ))}
        </div>

        <TabNavBar activeTab={activeTab} onSelect={selectTab} />
        <SaveBar saving={sections.eligibility.status === 'saving'} disabled={isListSaveDisabled('eligibility')} onSave={() => void saveListSection('eligibility')} label="Save Civil Service Eligibility" />
      </SectionCard>
      )}

      {activeTab === 'workExperience' && (
      <SectionCard title="V. Work Experience" description="Include private employment. Start from your most recent work. Date From, Position Title and Department/Agency/Office/Company are required for an entry to save.">
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            disabled={workFrozen}
            onClick={addWorkExperience}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: BRAND.line, color: BRAND.blue, background: 'var(--color-primary-50)' }}
          >
            <Plus className="h-3 w-3" /> Add work experience
          </button>
        </div>
        {sections.workExperience.status === 'loading' && (
          <p className="text-sm" style={{ color: BRAND.navy, opacity: 0.6 }}>Loading…</p>
        )}
        {sections.workExperience.status === 'ready' && workExperience.length === 0 && (
          <p className="text-xs italic" style={{ color: BRAND.navy, opacity: 0.6 }}>No work experience on record.</p>
        )}
        <div className="space-y-3">
          {workExperience.map((row, i) => (
            <div key={row.id ?? i} className="rounded-lg border p-3" style={{ borderColor: BRAND.line }}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold" style={{ color: BRAND.blue }}>Entry {i + 1}</p>
                <button type="button" disabled={workFrozen} onClick={() => removeWorkExperience(i)} className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-red-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ borderColor: BRAND.line }} aria-label="Remove work experience">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <Field label="Date From" type="date" value={row.dateFrom || ''} disabled={workFrozen} onChange={(v) => updateWorkExperience(i, { dateFrom: v })} />
                <Field label="Date To" type="date" value={row.dateTo || ''} disabled={workFrozen} onChange={(v) => updateWorkExperience(i, { dateTo: v })} />
                <Field label="Position Title" value={row.positionTitle} disabled={workFrozen} onChange={(v) => updateWorkExperience(i, { positionTitle: v })} />
                <Field label="Status of Appointment" value={row.statusOfAppointment || ''} disabled={workFrozen} onChange={(v) => updateWorkExperience(i, { statusOfAppointment: v })} />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px]">
                <Field label="Department/Agency/Office/Company" value={row.departmentAgencyOfficeCompany || ''} disabled={workFrozen} onChange={(v) => updateWorkExperience(i, { departmentAgencyOfficeCompany: v })} />
                <YesNoField label="Gov't Service" value={row.govtService ?? null} disabled={workFrozen} onChange={(v) => updateWorkExperience(i, { govtService: v })} />
              </div>
            </div>
          ))}
        </div>

        <TabNavBar activeTab={activeTab} onSelect={selectTab} />
        <SaveBar saving={sections.workExperience.status === 'saving'} disabled={isListSaveDisabled('workExperience')} onSave={() => void saveListSection('workExperience')} label="Save Work Experience" />
      </SectionCard>
      )}

      {activeTab === 'voluntaryWork' && (
      <SectionCard title="VI. Voluntary Work" description="Civic / non-government / people's / voluntary organizations.">
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            disabled={voluntaryFrozen}
            onClick={addVoluntaryWork}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: BRAND.line, color: BRAND.blue, background: 'var(--color-primary-50)' }}
          >
            <Plus className="h-3 w-3" /> Add voluntary work
          </button>
        </div>
        {sections.voluntaryWork.status === 'loading' && (
          <p className="text-sm" style={{ color: BRAND.navy, opacity: 0.6 }}>Loading…</p>
        )}
        {sections.voluntaryWork.status === 'ready' && voluntaryWork.length === 0 && (
          <p className="text-xs italic" style={{ color: BRAND.navy, opacity: 0.6 }}>No voluntary work on record.</p>
        )}
        <div className="space-y-3">
          {voluntaryWork.map((row, i) => (
            <div key={row.id ?? i} className="rounded-lg border p-3" style={{ borderColor: BRAND.line }}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold" style={{ color: BRAND.blue }}>Entry {i + 1}</p>
                <button type="button" disabled={voluntaryFrozen} onClick={() => removeVoluntaryWork(i)} className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-red-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ borderColor: BRAND.line }} aria-label="Remove voluntary work">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <Field label="Name & Address of Organization" value={row.orgNameAddress} disabled={voluntaryFrozen} onChange={(v) => updateVoluntaryWork(i, { orgNameAddress: v })} />
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                <Field label="Date From" type="date" value={row.dateFrom || ''} disabled={voluntaryFrozen} onChange={(v) => updateVoluntaryWork(i, { dateFrom: v })} />
                <Field label="Date To" type="date" value={row.dateTo || ''} disabled={voluntaryFrozen} onChange={(v) => updateVoluntaryWork(i, { dateTo: v })} />
                <Field label="Number of Hours" type="number" value={row.numberOfHours != null ? String(row.numberOfHours) : ''} disabled={voluntaryFrozen} onChange={(v) => updateVoluntaryWork(i, { numberOfHours: v ? Number.parseFloat(v) : null })} />
                <Field label="Position/Nature of Work" value={row.positionNatureOfWork || ''} disabled={voluntaryFrozen} onChange={(v) => updateVoluntaryWork(i, { positionNatureOfWork: v })} />
              </div>
            </div>
          ))}
        </div>

        <TabNavBar activeTab={activeTab} onSelect={selectTab} />
        <SaveBar saving={sections.voluntaryWork.status === 'saving'} disabled={isListSaveDisabled('voluntaryWork')} onSave={() => void saveListSection('voluntaryWork')} label="Save Voluntary Work" />
      </SectionCard>
      )}

      {activeTab === 'training' && (
      <SectionCard title="VII. Learning & Development Interventions" description="Training programs attended.">
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            disabled={trainingFrozen}
            onClick={addLdIntervention}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: BRAND.line, color: BRAND.blue, background: 'var(--color-primary-50)' }}
          >
            <Plus className="h-3 w-3" /> Add training
          </button>
        </div>
        {sections.training.status === 'loading' && (
          <p className="text-sm" style={{ color: BRAND.navy, opacity: 0.6 }}>Loading…</p>
        )}
        {sections.training.status === 'ready' && ldInterventions.length === 0 && (
          <p className="text-xs italic" style={{ color: BRAND.navy, opacity: 0.6 }}>No L&amp;D interventions on record.</p>
        )}
        <div className="space-y-3">
          {ldInterventions.map((row, i) => (
            <div key={row.id ?? i} className="rounded-lg border p-3" style={{ borderColor: BRAND.line }}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold" style={{ color: BRAND.blue }}>Entry {i + 1}</p>
                <button type="button" disabled={trainingFrozen} onClick={() => removeLdIntervention(i)} className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-red-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ borderColor: BRAND.line }} aria-label="Remove training">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <Field label="Title of L&D Intervention/Training Program" value={row.title} disabled={trainingFrozen} onChange={(v) => updateLdIntervention(i, { title: v })} />
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                <Field label="Date From" type="date" value={row.dateFrom || ''} disabled={trainingFrozen} onChange={(v) => updateLdIntervention(i, { dateFrom: v })} />
                <Field label="Date To" type="date" value={row.dateTo || ''} disabled={trainingFrozen} onChange={(v) => updateLdIntervention(i, { dateTo: v })} />
                <Field label="Number of Hours" type="number" value={row.numberOfHours != null ? String(row.numberOfHours) : ''} disabled={trainingFrozen} onChange={(v) => updateLdIntervention(i, { numberOfHours: v ? Number.parseFloat(v) : null })} />
                <Field label="Type (Managerial/Supervisory/Technical/etc)" value={row.ldType || ''} disabled={trainingFrozen} onChange={(v) => updateLdIntervention(i, { ldType: v })} />
              </div>
              <div className="mt-3">
                <Field label="Conducted/Sponsored By" value={row.conductedBy || ''} disabled={trainingFrozen} onChange={(v) => updateLdIntervention(i, { conductedBy: v })} />
              </div>
            </div>
          ))}
        </div>

        <TabNavBar activeTab={activeTab} onSelect={selectTab} />
        <SaveBar saving={sections.training.status === 'saving'} disabled={isListSaveDisabled('training')} onSave={() => void saveListSection('training')} label="Save Learning & Development" />
      </SectionCard>
      )}

      {activeTab === 'otherInfo' && (
      <SectionCard title="VIII. Other Information">
        <TextAreaField label="Special Skills and Hobbies" value={draft.specialSkillsHobbies} onChange={(v) => set('specialSkillsHobbies', v)} />
        <TextAreaField label="Non-Academic Distinctions/Recognition" value={draft.nonAcademicDistinctions} onChange={(v) => set('nonAcademicDistinctions', v)} />
        <TextAreaField label="Membership in Association/Organization" value={draft.membershipAssociations} onChange={(v) => set('membershipAssociations', v)} />

        <TabNavBar activeTab={activeTab} onSelect={selectTab} />
        <SaveBar saving={scalarSaving} onSave={() => void saveOtherInfoSection()} label="Save Other Information" />
      </SectionCard>
      )}

      {activeTab === 'background' && (
      <SectionCard title="Background Information" description="Items 34-42 of the Personal Data Sheet.">
        <div className="space-y-3">
          <p className="text-xs font-semibold" style={{ color: BRAND.navy }}>34. Are you related by consanguinity or affinity to the appointing or recommending authority, or to the chief of bureau/office or your immediate supervisor?</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <YesNoField label="a. Within the third degree?" value={draft.relatedThirdDegree} disabled={backgroundFrozen} onChange={(v) => set('relatedThirdDegree', v)} />
            <YesNoField label="b. Within the fourth degree (LGU career employees)?" value={draft.relatedFourthDegree} disabled={backgroundFrozen} onChange={(v) => set('relatedFourthDegree', v)} />
          </div>
          {(draft.relatedThirdDegree || draft.relatedFourthDegree) && (
            <Field label="If YES, give details" value={draft.relatedDetails} disabled={backgroundFrozen} onChange={(v) => set('relatedDetails', v)} />
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold" style={{ color: BRAND.navy }}>35a. Have you ever been found guilty of any administrative offense?</p>
          <YesNoField label="Found guilty" value={draft.adminOffenseGuilty} disabled={backgroundFrozen} onChange={(v) => set('adminOffenseGuilty', v)} />
          {draft.adminOffenseGuilty && (
            <Field label="If YES, give details" value={draft.adminOffenseDetails} disabled={backgroundFrozen} onChange={(v) => set('adminOffenseDetails', v)} />
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold" style={{ color: BRAND.navy }}>35b. Have you been criminally charged before any court?</p>
          <YesNoField label="Criminally charged" value={draft.criminallyCharged} disabled={backgroundFrozen} onChange={(v) => set('criminallyCharged', v)} />
          {draft.criminallyCharged && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="If YES, give details" value={draft.criminalChargeDetails} disabled={backgroundFrozen} onChange={(v) => set('criminalChargeDetails', v)} />
              <Field label="Date Filed" type="date" value={draft.criminalCaseDateFiled} disabled={backgroundFrozen} onChange={(v) => set('criminalCaseDateFiled', v)} />
              <Field label="Status of Case" value={draft.criminalCaseStatus} disabled={backgroundFrozen} onChange={(v) => set('criminalCaseStatus', v)} />
            </div>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold" style={{ color: BRAND.navy }}>36. Have you ever been convicted of any crime or violation of any law, decree, ordinance or regulation?</p>
          <YesNoField label="Convicted" value={draft.convictedOfCrime} disabled={backgroundFrozen} onChange={(v) => set('convictedOfCrime', v)} />
          {draft.convictedOfCrime && (
            <Field label="If YES, give details" value={draft.convictedDetails} disabled={backgroundFrozen} onChange={(v) => set('convictedDetails', v)} />
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold" style={{ color: BRAND.navy }}>37. Have you ever been separated from the service (resignation, retirement, dropped from the rolls, dismissal, termination, end of term, finished contract, or phased out)?</p>
          <YesNoField label="Separated" value={draft.separatedFromService} disabled={backgroundFrozen} onChange={(v) => set('separatedFromService', v)} />
          {draft.separatedFromService && (
            <Field label="If YES, give details" value={draft.separatedDetails} disabled={backgroundFrozen} onChange={(v) => set('separatedDetails', v)} />
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold" style={{ color: BRAND.navy }}>38a. Have you ever been a candidate in a national or local election (except Barangay election) held within the last year?</p>
          <YesNoField label="Candidate" value={draft.electionCandidate} disabled={backgroundFrozen} onChange={(v) => set('electionCandidate', v)} />
          {draft.electionCandidate && (
            <Field label="If YES, give details" value={draft.electionCandidateDetails} disabled={backgroundFrozen} onChange={(v) => set('electionCandidateDetails', v)} />
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold" style={{ color: BRAND.navy }}>38b. Have you resigned from the government service during the 3-month period before the last election to campaign for a candidate?</p>
          <YesNoField label="Resigned to campaign" value={draft.resignedToCampaign} disabled={backgroundFrozen} onChange={(v) => set('resignedToCampaign', v)} />
          {draft.resignedToCampaign && (
            <Field label="If YES, give details" value={draft.resignedToCampaignDetails} disabled={backgroundFrozen} onChange={(v) => set('resignedToCampaignDetails', v)} />
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold" style={{ color: BRAND.navy }}>39. Have you acquired the status of an immigrant or permanent resident of another country?</p>
          <YesNoField label="Immigrant/permanent resident" value={draft.immigrantStatus} disabled={backgroundFrozen} onChange={(v) => set('immigrantStatus', v)} />
          {draft.immigrantStatus && (
            <Field label="If YES, which country?" value={draft.immigrantCountry} disabled={backgroundFrozen} onChange={(v) => set('immigrantCountry', v)} />
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold" style={{ color: BRAND.navy }}>40. Indigenous group / person with disability / solo parent status</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <YesNoField label="a. Member of an indigenous group?" value={draft.indigenousGroupMember} disabled={backgroundFrozen} onChange={(v) => set('indigenousGroupMember', v)} />
              {draft.indigenousGroupMember && (
                <div className="mt-2"><Field label="Please specify" value={draft.indigenousGroupSpecify} disabled={backgroundFrozen} onChange={(v) => set('indigenousGroupSpecify', v)} /></div>
              )}
            </div>
            <div>
              <YesNoField label="b. Person with disability?" value={draft.personWithDisability} disabled={backgroundFrozen} onChange={(v) => set('personWithDisability', v)} />
              {draft.personWithDisability && (
                <div className="mt-2"><Field label="PWD ID No." value={draft.pwdIdNumber} disabled={backgroundFrozen} onChange={(v) => set('pwdIdNumber', v)} /></div>
              )}
            </div>
            <div>
              <YesNoField label="c. Solo parent?" value={draft.soloParent} disabled={backgroundFrozen} onChange={(v) => set('soloParent', v)} />
              {draft.soloParent && (
                <div className="mt-2"><Field label="Solo Parent ID No." value={draft.soloParentIdNumber} disabled={backgroundFrozen} onChange={(v) => set('soloParentIdNumber', v)} /></div>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold" style={{ color: BRAND.navy }}>41. References</h3>
            <button
              type="button"
              disabled={backgroundFrozen}
              onClick={addReference}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: BRAND.line, color: BRAND.blue, background: 'var(--color-primary-50)' }}
            >
              <Plus className="h-3 w-3" /> Add reference
            </button>
          </div>
          <p className="mb-2 text-xs" style={{ color: BRAND.navy, opacity: 0.7 }}>Person not related by consanguinity or affinity to you.</p>
          {sections.references.status === 'loading' && (
            <p className="text-sm" style={{ color: BRAND.navy, opacity: 0.6 }}>Loading…</p>
          )}
          {sections.references.status === 'ready' && references.length === 0 && (
            <p className="text-xs italic" style={{ color: BRAND.navy, opacity: 0.6 }}>No references on record.</p>
          )}
          <div className="space-y-2">
            {references.map((ref, i) => (
              <div key={ref.id ?? i} className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                <Field label="Name" value={ref.name} disabled={backgroundFrozen} onChange={(v) => updateReference(i, { name: v })} />
                <Field label="Office/Residential Address" value={ref.address || ''} disabled={backgroundFrozen} onChange={(v) => updateReference(i, { address: v })} />
                <Field label="Contact No. / Email" value={ref.contactInfo || ''} disabled={backgroundFrozen} onChange={(v) => updateReference(i, { contactInfo: v })} />
                <button
                  type="button"
                  disabled={backgroundFrozen}
                  onClick={() => removeReference(i)}
                  className="inline-flex h-9 items-center justify-center rounded-md border px-2 text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ borderColor: BRAND.line }}
                  aria-label="Remove reference"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-bold" style={{ color: BRAND.navy }}>42. Government-Issued ID</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field label="Government Issued ID (Passport, GSIS, SSS, PRC, Driver's License, etc.)" value={draft.govIdType} disabled={backgroundFrozen} onChange={(v) => set('govIdType', v)} />
            <Field label="ID/License/Passport No." value={draft.govIdNumber} disabled={backgroundFrozen} onChange={(v) => set('govIdNumber', v)} />
            <Field label="Date/Place of Issuance" value={draft.govIdIssuedDatePlace} disabled={backgroundFrozen} onChange={(v) => set('govIdIssuedDatePlace', v)} />
          </div>
        </div>

        <TabNavBar activeTab={activeTab} onSelect={selectTab} />
        <SaveBar saving={sections.references.status === 'saving'} disabled={isListSaveDisabled('references')} onSave={() => void saveBackgroundSection()} label="Save Background Information" />
      </SectionCard>
      )}
        </div>
      </div>
    </div>
  );
};
