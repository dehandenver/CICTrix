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

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
} from '../../types/employee.types';
import { emptyAddress, EDUCATION_LEVEL_LABELS } from '../../types/employee.types';
import { patchPortalEmployee } from '../../lib/api/employeePortal';
import {
  listChildren, saveChildren,
  listEducation, saveEducation, buildEducationRows,
  listEligibility, saveEligibility,
  listWorkExperience, saveWorkExperience,
  listVoluntaryWork, saveVoluntaryWork,
  listLdInterventions, saveLdInterventions,
  listReferences, saveReferences,
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
}> = ({ label, value, onChange, options }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold" style={{ color: BRAND.navy }}>{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none"
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
}> = ({ label, value, onChange, rows = 4, placeholder }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold" style={{ color: BRAND.navy }}>{label}</span>
    <textarea
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
      style={{ borderColor: BRAND.line, color: BRAND.navy }}
    />
  </label>
);

/** Tri-state Yes/No toggle for a legal disclosure: unanswered (null) is not the same as "No". Clicking the selected option again clears it back to unanswered. */
const YesNoField: React.FC<{ label: string; value: boolean | null; onChange: (v: boolean | null) => void }> = ({ label, value, onChange }) => (
  <div>
    <span className="mb-1 block text-xs font-semibold" style={{ color: BRAND.navy }}>{label}</span>
    <div className="flex gap-2">
      {([['Yes', true], ['No', false]] as const).map(([text, boolVal]) => {
        const isSelected = value === boolVal;
        return (
          <button
            key={text}
            type="button"
            onClick={() => onChange(isSelected ? null : boolVal)}
            className="rounded-md px-3 py-1.5 text-xs font-semibold"
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

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'personal', label: 'Personal Information' },
  { id: 'family', label: 'Family Background' },
  { id: 'education', label: 'Educational Background' },
  { id: 'eligibility', label: 'Civil Service Eligibility' },
  { id: 'workExperience', label: 'Work Experience' },
  { id: 'voluntaryWork', label: 'Voluntary Work' },
  { id: 'training', label: 'Learning & Development' },
  { id: 'otherInfo', label: 'Other Information' },
  { id: 'background', label: 'Background Information' },
];

const SaveBar: React.FC<{ saving: boolean; onSave: () => void; label: string; lastSaved?: string }> = ({ saving, onSave, label, lastSaved }) => (
  <div className="flex items-center justify-between pt-1">
    {lastSaved ? (
      <p className="text-xs" style={{ color: BRAND.navy, opacity: 0.6 }}>
        Last saved {new Date(lastSaved).toLocaleString()}
      </p>
    ) : <span />}
    <button
      type="button"
      onClick={onSave}
      disabled={saving}
      className="rounded-lg px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
      style={{ background: BRAND.blue }}
    >
      {saving ? 'Saving…' : label}
    </button>
  </div>
);

export const PersonalDataSheetSection: React.FC<Props> = ({ employeeId, profile, onSaved }) => {
  const [activeTab, setActiveTab] = useState<SubTab>('personal');
  const [draft, setDraft] = useState<ScalarDraft>(getScalarDraft(profile));
  const [residential, setResidential] = useState<AddressParts>(profile.residential || emptyAddress());
  const [permanent, setPermanent] = useState<AddressParts>(profile.permanent || emptyAddress());
  const [sameAsResidential, setSameAsResidential] = useState(false);

  const [children, setChildren] = useState<EmployeeChild[]>(profile.children || []);
  const [education, setEducation] = useState<EmployeeEducation[]>(buildEducationRows(profile.education || []));
  const [eligibility, setEligibility] = useState<EmployeeEligibility[]>(profile.eligibility || []);
  const [workExperience, setWorkExperience] = useState<EmployeeWorkExperience[]>(profile.workExperience || []);
  const [voluntaryWork, setVoluntaryWork] = useState<EmployeeVoluntaryWork[]>(profile.voluntaryWork || []);
  const [ldInterventions, setLdInterventions] = useState<EmployeeLdIntervention[]>(profile.ldInterventions || []);
  const [references, setReferences] = useState<EmployeeReference[]>(profile.references || []);

  const [listsLoading, setListsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    setDraft(getScalarDraft(profile));
    setResidential(profile.residential || emptyAddress());
    setPermanent(profile.permanent || emptyAddress());
  }, [profile]);

  useEffect(() => {
    if (!employeeId) return;
    let cancelled = false;
    setListsLoading(true);
    void (async () => {
      const [childrenRes, educationRes, eligibilityRes, workExperienceRes, voluntaryWorkRes, ldInterventionsRes, referencesRes] = await Promise.all([
        listChildren(employeeId),
        listEducation(employeeId),
        listEligibility(employeeId),
        listWorkExperience(employeeId),
        listVoluntaryWork(employeeId),
        listLdInterventions(employeeId),
        listReferences(employeeId),
      ]);
      if (cancelled) return;
      if (childrenRes.ok !== false) setChildren(childrenRes.data);
      if (educationRes.ok !== false) setEducation(buildEducationRows(educationRes.data));
      if (eligibilityRes.ok !== false) setEligibility(eligibilityRes.data);
      if (workExperienceRes.ok !== false) setWorkExperience(workExperienceRes.data);
      if (voluntaryWorkRes.ok !== false) setVoluntaryWork(voluntaryWorkRes.data);
      if (ldInterventionsRes.ok !== false) setLdInterventions(ldInterventionsRes.data);
      if (referencesRes.ok !== false) setReferences(referencesRes.data);
      setListsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [employeeId]);

  const set = <K extends keyof ScalarDraft>(key: K, value: ScalarDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const addChild = () => setChildren((prev) => [...prev, { fullName: '', dateOfBirth: '' }]);
  const removeChild = (i: number) => setChildren((prev) => prev.filter((_, idx) => idx !== i));
  const updateChild = (i: number, patch: Partial<EmployeeChild>) =>
    setChildren((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const updateEducation = (i: number, patch: Partial<EmployeeEducation>) =>
    setEducation((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const addEligibility = () => setEligibility((prev) => [...prev, { eligibilityName: '' }]);
  const removeEligibility = (i: number) => setEligibility((prev) => prev.filter((_, idx) => idx !== i));
  const updateEligibility = (i: number, patch: Partial<EmployeeEligibility>) =>
    setEligibility((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const addWorkExperience = () => setWorkExperience((prev) => [...prev, { positionTitle: '' }]);
  const removeWorkExperience = (i: number) => setWorkExperience((prev) => prev.filter((_, idx) => idx !== i));
  const updateWorkExperience = (i: number, patch: Partial<EmployeeWorkExperience>) =>
    setWorkExperience((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const addVoluntaryWork = () => setVoluntaryWork((prev) => [...prev, { orgNameAddress: '' }]);
  const removeVoluntaryWork = (i: number) => setVoluntaryWork((prev) => prev.filter((_, idx) => idx !== i));
  const updateVoluntaryWork = (i: number, patch: Partial<EmployeeVoluntaryWork>) =>
    setVoluntaryWork((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const addLdIntervention = () => setLdInterventions((prev) => [...prev, { title: '' }]);
  const removeLdIntervention = (i: number) => setLdInterventions((prev) => prev.filter((_, idx) => idx !== i));
  const updateLdIntervention = (i: number, patch: Partial<EmployeeLdIntervention>) =>
    setLdInterventions((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const addReference = () => setReferences((prev) => [...prev, { name: '' }]);
  const removeReference = (i: number) => setReferences((prev) => prev.filter((_, idx) => idx !== i));
  const updateReference = (i: number, patch: Partial<EmployeeReference>) =>
    setReferences((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const selectTab = (tab: SubTab) => {
    setActiveTab(tab);
    setSaveError(null);
    setSaveSuccess(null);
  };

  const savePersonalInfo = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

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
      heightM: draft.heightM ? Number.parseFloat(draft.heightM) : undefined,
      weightKg: draft.weightKg ? Number.parseFloat(draft.weightKg) : undefined,
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

    const res = await patchPortalEmployee(employeeId, scalarPatch);
    if (res.ok === false) {
      setSaveError(res.error ?? 'Failed to save Personal Information. Please try again.');
      setSaving(false);
      return;
    }

    onSaved(scalarPatch);
    setSaveSuccess('Personal Information saved.');
    setSaving(false);
  };

  const saveFamilyBackground = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const scalarPatch: Partial<Employee> = {
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
    };

    const [scalarRes, childrenRes] = await Promise.all([
      patchPortalEmployee(employeeId, scalarPatch),
      saveChildren(employeeId, children),
    ]);

    if (scalarRes.ok === false || childrenRes.ok === false) {
      const error =
        (scalarRes.ok === false && scalarRes.error) ||
        (childrenRes.ok === false && childrenRes.error) ||
        'Failed to save Family Background. Please try again.';
      setSaveError(error);
      setSaving(false);
      return;
    }

    onSaved(scalarPatch);
    setSaveSuccess('Family Background saved.');
    setSaving(false);
  };

  const saveEducationalBackground = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const res = await saveEducation(employeeId, education);
    if (res.ok === false) {
      setSaveError(res.error ?? 'Failed to save Educational Background. Please try again.');
      setSaving(false);
      return;
    }

    onSaved({});
    setSaveSuccess('Educational Background saved.');
    setSaving(false);
  };

  const saveEligibilitySection = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const res = await saveEligibility(employeeId, eligibility);
    if (res.ok === false) {
      setSaveError(res.error ?? 'Failed to save Civil Service Eligibility. Please try again.');
      setSaving(false);
      return;
    }

    onSaved({});
    setSaveSuccess('Civil Service Eligibility saved.');
    setSaving(false);
  };

  const saveWorkExperienceSection = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const res = await saveWorkExperience(employeeId, workExperience);
    if (res.ok === false) {
      setSaveError(res.error ?? 'Failed to save Work Experience. Please try again.');
      setSaving(false);
      return;
    }

    onSaved({});
    setSaveSuccess('Work Experience saved.');
    setSaving(false);
  };

  const saveVoluntaryWorkSection = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const res = await saveVoluntaryWork(employeeId, voluntaryWork);
    if (res.ok === false) {
      setSaveError(res.error ?? 'Failed to save Voluntary Work. Please try again.');
      setSaving(false);
      return;
    }

    onSaved({});
    setSaveSuccess('Voluntary Work saved.');
    setSaving(false);
  };

  const saveLdInterventionsSection = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const res = await saveLdInterventions(employeeId, ldInterventions);
    if (res.ok === false) {
      setSaveError(res.error ?? 'Failed to save Learning & Development history. Please try again.');
      setSaving(false);
      return;
    }

    onSaved({});
    setSaveSuccess('Learning & Development history saved.');
    setSaving(false);
  };

  const saveOtherInfoSection = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const scalarPatch: Partial<Employee> = {
      specialSkillsHobbies: draft.specialSkillsHobbies.trim(),
      nonAcademicDistinctions: draft.nonAcademicDistinctions.trim(),
      membershipAssociations: draft.membershipAssociations.trim(),
    };

    const res = await patchPortalEmployee(employeeId, scalarPatch);
    if (res.ok === false) {
      setSaveError(res.error ?? 'Failed to save Other Information. Please try again.');
      setSaving(false);
      return;
    }

    onSaved(scalarPatch);
    setSaveSuccess('Other Information saved.');
    setSaving(false);
  };

  const saveBackgroundSection = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const scalarPatch: Partial<Employee> = {
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
    };

    const [scalarRes, referencesRes] = await Promise.all([
      patchPortalEmployee(employeeId, scalarPatch),
      saveReferences(employeeId, references),
    ]);

    if (scalarRes.ok === false || referencesRes.ok === false) {
      const error =
        (scalarRes.ok === false && scalarRes.error) ||
        (referencesRes.ok === false && referencesRes.error) ||
        'Failed to save Background Information. Please try again.';
      setSaveError(error);
      setSaving(false);
      return;
    }

    onSaved(scalarPatch);
    setSaveSuccess('Background Information saved.');
    setSaving(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {SUB_TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                borderRadius: 8, padding: '0.45rem 0.9rem',
                fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                border: isActive ? `1.5px solid ${BRAND.blue}` : `1.5px solid ${BRAND.line}`,
                background: isActive ? BRAND.blue : '#F0F2FD',
                color: isActive ? '#ffffff' : BRAND.navy,
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {saveError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{saveError}</p>
      )}
      {saveSuccess && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{saveSuccess}</p>
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
          <AddressFields value={residential} onChange={setResidential} />
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
          {!sameAsResidential && <AddressFields value={permanent} onChange={setPermanent} />}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Telephone No." value={draft.telephoneNumber} onChange={(v) => set('telephoneNumber', v)} />
          <Field label="Mobile No." value={draft.mobileNumber} onChange={(v) => set('mobileNumber', v)} />
          <Field label="E-mail Address" type="email" value={draft.email} onChange={(v) => set('email', v)} />
        </div>

        <SaveBar saving={saving} onSave={() => void savePersonalInfo()} label="Save Personal Information" lastSaved={profile.pdsUpdatedAt} />
      </SectionCard>
      )}

      {activeTab === 'family' && (
      <SectionCard title="II. Family Background">
        <div>
          <h3 className="mb-2 text-sm font-bold" style={{ color: BRAND.navy }}>Spouse</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Field label="Surname" value={draft.spouseSurname} onChange={(v) => set('spouseSurname', v)} />
            <Field label="First Name" value={draft.spouseFirstName} onChange={(v) => set('spouseFirstName', v)} />
            <Field label="Middle Name" value={draft.spouseMiddleName} onChange={(v) => set('spouseMiddleName', v)} />
            <Field label="Name Extension" value={draft.spouseNameExtension} onChange={(v) => set('spouseNameExtension', v)} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
            <Field label="Occupation" value={draft.spouseOccupation} onChange={(v) => set('spouseOccupation', v)} />
            <Field label="Employer/Business Name" value={draft.spouseEmployer} onChange={(v) => set('spouseEmployer', v)} />
            <Field label="Business Address" value={draft.spouseBusinessAddress} onChange={(v) => set('spouseBusinessAddress', v)} />
            <Field label="Telephone No." value={draft.spouseTelephone} onChange={(v) => set('spouseTelephone', v)} />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold" style={{ color: BRAND.navy }}>Children</h3>
            <button
              type="button"
              onClick={addChild}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold"
              style={{ borderColor: BRAND.line, color: BRAND.blue, background: '#EEF0FD' }}
            >
              <Plus className="h-3 w-3" /> Add child
            </button>
          </div>
          {children.length === 0 && (
            <p className="text-xs italic" style={{ color: BRAND.navy, opacity: 0.6 }}>No children on record.</p>
          )}
          <div className="space-y-2">
            {children.map((child, i) => (
              <div key={child.id ?? i} className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_180px_auto]">
                <Field label="Full Name" value={child.fullName} onChange={(v) => updateChild(i, { fullName: v })} />
                <Field label="Date of Birth" type="date" value={child.dateOfBirth || ''} onChange={(v) => updateChild(i, { dateOfBirth: v })} />
                <button
                  type="button"
                  onClick={() => removeChild(i)}
                  className="inline-flex h-9 items-center justify-center rounded-md border px-2 text-red-600"
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
            <Field label="Surname" value={draft.fatherSurname} onChange={(v) => set('fatherSurname', v)} />
            <Field label="First Name" value={draft.fatherFirstName} onChange={(v) => set('fatherFirstName', v)} />
            <Field label="Middle Name" value={draft.fatherMiddleName} onChange={(v) => set('fatherMiddleName', v)} />
            <Field label="Name Extension" value={draft.fatherNameExtension} onChange={(v) => set('fatherNameExtension', v)} />
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-bold" style={{ color: BRAND.navy }}>Mother's Maiden Name</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field label="Surname" value={draft.motherSurname} onChange={(v) => set('motherSurname', v)} />
            <Field label="First Name" value={draft.motherFirstName} onChange={(v) => set('motherFirstName', v)} />
            <Field label="Middle Name" value={draft.motherMiddleName} onChange={(v) => set('motherMiddleName', v)} />
          </div>
        </div>

        <SaveBar saving={saving} onSave={() => void saveFamilyBackground()} label="Save Family Background" />
      </SectionCard>
      )}

      {activeTab === 'education' && (
      <SectionCard title="III. Educational Background" description="Elementary through Graduate Studies.">
        {listsLoading ? (
          <p className="text-sm" style={{ color: BRAND.navy, opacity: 0.6 }}>Loading…</p>
        ) : (
          <div className="space-y-4">
            {education.map((row, i) => (
              <div key={row.level} className="rounded-lg border p-3" style={{ borderColor: BRAND.line }}>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: BRAND.blue }}>{EDUCATION_LEVEL_LABELS[row.level] ?? row.level}</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Field label="Name of School" value={row.school || ''} onChange={(v) => updateEducation(i, { school: v })} />
                  <Field label="Basic Education/Degree/Course" value={row.degree || ''} onChange={(v) => updateEducation(i, { degree: v })} />
                  <Field label="Units Earned (if not graduated)" type="number" value={row.highestLevelUnits != null ? String(row.highestLevelUnits) : ''} onChange={(v) => updateEducation(i, { highestLevelUnits: v ? Number.parseInt(v, 10) : null })} />
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <Field label="Year Attended From" type="number" value={row.periodFrom != null ? String(row.periodFrom) : ''} onChange={(v) => updateEducation(i, { periodFrom: v ? Number.parseInt(v, 10) : null })} />
                  <Field label="Year Attended To" type="number" value={row.periodTo != null ? String(row.periodTo) : ''} onChange={(v) => updateEducation(i, { periodTo: v ? Number.parseInt(v, 10) : null })} />
                  <Field label="Year Graduated" type="number" value={row.yearGraduated != null ? String(row.yearGraduated) : ''} onChange={(v) => updateEducation(i, { yearGraduated: v ? Number.parseInt(v, 10) : null })} />
                  <Field label="Scholarship/Academic Honors" value={row.scholarshipHonors || ''} onChange={(v) => updateEducation(i, { scholarshipHonors: v })} />
                </div>
              </div>
            ))}
          </div>
        )}

        <SaveBar saving={saving} onSave={() => void saveEducationalBackground()} label="Save Educational Background" />
      </SectionCard>
      )}

      {activeTab === 'eligibility' && (
      <SectionCard title="IV. Civil Service Eligibility">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs" style={{ color: BRAND.navy, opacity: 0.7 }}>CES/CSEE/Career Service/RA 1080 (Board/Bar)/Under Special Laws/eligibilities for uniformed personnel.</p>
          <button
            type="button"
            onClick={addEligibility}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold"
            style={{ borderColor: BRAND.line, color: BRAND.blue, background: '#EEF0FD' }}
          >
            <Plus className="h-3 w-3" /> Add eligibility
          </button>
        </div>
        {eligibility.length === 0 && (
          <p className="text-xs italic" style={{ color: BRAND.navy, opacity: 0.6 }}>No eligibility on record.</p>
        )}
        <div className="space-y-3">
          {eligibility.map((row, i) => (
            <div key={row.id ?? i} className="rounded-lg border p-3" style={{ borderColor: BRAND.line }}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold" style={{ color: BRAND.blue }}>Eligibility {i + 1}</p>
                <button type="button" onClick={() => removeEligibility(i)} className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-red-600" style={{ borderColor: BRAND.line }} aria-label="Remove eligibility">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label="Eligibility" value={row.eligibilityName} onChange={(v) => updateEligibility(i, { eligibilityName: v })} />
                <Field label="Rating (if applicable)" type="number" value={row.rating != null ? String(row.rating) : ''} onChange={(v) => updateEligibility(i, { rating: v ? Number.parseFloat(v) : null })} />
                <Field label="Date of Examination/Conferment" type="date" value={row.examDate || ''} onChange={(v) => updateEligibility(i, { examDate: v })} />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label="Place of Examination/Conferment" value={row.examPlace || ''} onChange={(v) => updateEligibility(i, { examPlace: v })} />
                <Field label="License Number" value={row.licenseNumber || ''} onChange={(v) => updateEligibility(i, { licenseNumber: v })} />
                <Field label="License Valid Until" type="date" value={row.licenseValidUntil || ''} onChange={(v) => updateEligibility(i, { licenseValidUntil: v })} />
              </div>
            </div>
          ))}
        </div>

        <SaveBar saving={saving} onSave={() => void saveEligibilitySection()} label="Save Civil Service Eligibility" />
      </SectionCard>
      )}

      {activeTab === 'workExperience' && (
      <SectionCard title="V. Work Experience" description="Include private employment. Start from your most recent work. Date From, Position Title and Department/Agency/Office/Company are required for an entry to save.">
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={addWorkExperience}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold"
            style={{ borderColor: BRAND.line, color: BRAND.blue, background: '#EEF0FD' }}
          >
            <Plus className="h-3 w-3" /> Add work experience
          </button>
        </div>
        {workExperience.length === 0 && (
          <p className="text-xs italic" style={{ color: BRAND.navy, opacity: 0.6 }}>No work experience on record.</p>
        )}
        <div className="space-y-3">
          {workExperience.map((row, i) => (
            <div key={row.id ?? i} className="rounded-lg border p-3" style={{ borderColor: BRAND.line }}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold" style={{ color: BRAND.blue }}>Entry {i + 1}</p>
                <button type="button" onClick={() => removeWorkExperience(i)} className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-red-600" style={{ borderColor: BRAND.line }} aria-label="Remove work experience">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <Field label="Date From" type="date" value={row.dateFrom || ''} onChange={(v) => updateWorkExperience(i, { dateFrom: v })} />
                <Field label="Date To" type="date" value={row.dateTo || ''} onChange={(v) => updateWorkExperience(i, { dateTo: v })} />
                <Field label="Position Title" value={row.positionTitle} onChange={(v) => updateWorkExperience(i, { positionTitle: v })} />
                <Field label="Status of Appointment" value={row.statusOfAppointment || ''} onChange={(v) => updateWorkExperience(i, { statusOfAppointment: v })} />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px]">
                <Field label="Department/Agency/Office/Company" value={row.departmentAgencyOfficeCompany || ''} onChange={(v) => updateWorkExperience(i, { departmentAgencyOfficeCompany: v })} />
                <YesNoField label="Gov't Service" value={row.govtService ?? null} onChange={(v) => updateWorkExperience(i, { govtService: v })} />
              </div>
            </div>
          ))}
        </div>

        <SaveBar saving={saving} onSave={() => void saveWorkExperienceSection()} label="Save Work Experience" />
      </SectionCard>
      )}

      {activeTab === 'voluntaryWork' && (
      <SectionCard title="VI. Voluntary Work" description="Civic / non-government / people's / voluntary organizations.">
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={addVoluntaryWork}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold"
            style={{ borderColor: BRAND.line, color: BRAND.blue, background: '#EEF0FD' }}
          >
            <Plus className="h-3 w-3" /> Add voluntary work
          </button>
        </div>
        {voluntaryWork.length === 0 && (
          <p className="text-xs italic" style={{ color: BRAND.navy, opacity: 0.6 }}>No voluntary work on record.</p>
        )}
        <div className="space-y-3">
          {voluntaryWork.map((row, i) => (
            <div key={row.id ?? i} className="rounded-lg border p-3" style={{ borderColor: BRAND.line }}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold" style={{ color: BRAND.blue }}>Entry {i + 1}</p>
                <button type="button" onClick={() => removeVoluntaryWork(i)} className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-red-600" style={{ borderColor: BRAND.line }} aria-label="Remove voluntary work">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <Field label="Name & Address of Organization" value={row.orgNameAddress} onChange={(v) => updateVoluntaryWork(i, { orgNameAddress: v })} />
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                <Field label="Date From" type="date" value={row.dateFrom || ''} onChange={(v) => updateVoluntaryWork(i, { dateFrom: v })} />
                <Field label="Date To" type="date" value={row.dateTo || ''} onChange={(v) => updateVoluntaryWork(i, { dateTo: v })} />
                <Field label="Number of Hours" type="number" value={row.numberOfHours != null ? String(row.numberOfHours) : ''} onChange={(v) => updateVoluntaryWork(i, { numberOfHours: v ? Number.parseFloat(v) : null })} />
                <Field label="Position/Nature of Work" value={row.positionNatureOfWork || ''} onChange={(v) => updateVoluntaryWork(i, { positionNatureOfWork: v })} />
              </div>
            </div>
          ))}
        </div>

        <SaveBar saving={saving} onSave={() => void saveVoluntaryWorkSection()} label="Save Voluntary Work" />
      </SectionCard>
      )}

      {activeTab === 'training' && (
      <SectionCard title="VII. Learning & Development Interventions" description="Training programs attended.">
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={addLdIntervention}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold"
            style={{ borderColor: BRAND.line, color: BRAND.blue, background: '#EEF0FD' }}
          >
            <Plus className="h-3 w-3" /> Add training
          </button>
        </div>
        {ldInterventions.length === 0 && (
          <p className="text-xs italic" style={{ color: BRAND.navy, opacity: 0.6 }}>No L&amp;D interventions on record.</p>
        )}
        <div className="space-y-3">
          {ldInterventions.map((row, i) => (
            <div key={row.id ?? i} className="rounded-lg border p-3" style={{ borderColor: BRAND.line }}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold" style={{ color: BRAND.blue }}>Entry {i + 1}</p>
                <button type="button" onClick={() => removeLdIntervention(i)} className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-red-600" style={{ borderColor: BRAND.line }} aria-label="Remove training">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <Field label="Title of L&D Intervention/Training Program" value={row.title} onChange={(v) => updateLdIntervention(i, { title: v })} />
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                <Field label="Date From" type="date" value={row.dateFrom || ''} onChange={(v) => updateLdIntervention(i, { dateFrom: v })} />
                <Field label="Date To" type="date" value={row.dateTo || ''} onChange={(v) => updateLdIntervention(i, { dateTo: v })} />
                <Field label="Number of Hours" type="number" value={row.numberOfHours != null ? String(row.numberOfHours) : ''} onChange={(v) => updateLdIntervention(i, { numberOfHours: v ? Number.parseFloat(v) : null })} />
                <Field label="Type (Managerial/Supervisory/Technical/etc)" value={row.ldType || ''} onChange={(v) => updateLdIntervention(i, { ldType: v })} />
              </div>
              <div className="mt-3">
                <Field label="Conducted/Sponsored By" value={row.conductedBy || ''} onChange={(v) => updateLdIntervention(i, { conductedBy: v })} />
              </div>
            </div>
          ))}
        </div>

        <SaveBar saving={saving} onSave={() => void saveLdInterventionsSection()} label="Save Learning & Development" />
      </SectionCard>
      )}

      {activeTab === 'otherInfo' && (
      <SectionCard title="VIII. Other Information">
        <TextAreaField label="Special Skills and Hobbies" value={draft.specialSkillsHobbies} onChange={(v) => set('specialSkillsHobbies', v)} />
        <TextAreaField label="Non-Academic Distinctions/Recognition" value={draft.nonAcademicDistinctions} onChange={(v) => set('nonAcademicDistinctions', v)} />
        <TextAreaField label="Membership in Association/Organization" value={draft.membershipAssociations} onChange={(v) => set('membershipAssociations', v)} />

        <SaveBar saving={saving} onSave={() => void saveOtherInfoSection()} label="Save Other Information" />
      </SectionCard>
      )}

      {activeTab === 'background' && (
      <SectionCard title="Background Information" description="Items 34-42 of the Personal Data Sheet.">
        <div className="space-y-3">
          <p className="text-xs font-semibold" style={{ color: BRAND.navy }}>34. Are you related by consanguinity or affinity to the appointing or recommending authority, or to the chief of bureau/office or your immediate supervisor?</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <YesNoField label="a. Within the third degree?" value={draft.relatedThirdDegree} onChange={(v) => set('relatedThirdDegree', v)} />
            <YesNoField label="b. Within the fourth degree (LGU career employees)?" value={draft.relatedFourthDegree} onChange={(v) => set('relatedFourthDegree', v)} />
          </div>
          {(draft.relatedThirdDegree || draft.relatedFourthDegree) && (
            <Field label="If YES, give details" value={draft.relatedDetails} onChange={(v) => set('relatedDetails', v)} />
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold" style={{ color: BRAND.navy }}>35a. Have you ever been found guilty of any administrative offense?</p>
          <YesNoField label="Found guilty" value={draft.adminOffenseGuilty} onChange={(v) => set('adminOffenseGuilty', v)} />
          {draft.adminOffenseGuilty && (
            <Field label="If YES, give details" value={draft.adminOffenseDetails} onChange={(v) => set('adminOffenseDetails', v)} />
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold" style={{ color: BRAND.navy }}>35b. Have you been criminally charged before any court?</p>
          <YesNoField label="Criminally charged" value={draft.criminallyCharged} onChange={(v) => set('criminallyCharged', v)} />
          {draft.criminallyCharged && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="If YES, give details" value={draft.criminalChargeDetails} onChange={(v) => set('criminalChargeDetails', v)} />
              <Field label="Date Filed" type="date" value={draft.criminalCaseDateFiled} onChange={(v) => set('criminalCaseDateFiled', v)} />
              <Field label="Status of Case" value={draft.criminalCaseStatus} onChange={(v) => set('criminalCaseStatus', v)} />
            </div>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold" style={{ color: BRAND.navy }}>36. Have you ever been convicted of any crime or violation of any law, decree, ordinance or regulation?</p>
          <YesNoField label="Convicted" value={draft.convictedOfCrime} onChange={(v) => set('convictedOfCrime', v)} />
          {draft.convictedOfCrime && (
            <Field label="If YES, give details" value={draft.convictedDetails} onChange={(v) => set('convictedDetails', v)} />
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold" style={{ color: BRAND.navy }}>37. Have you ever been separated from the service (resignation, retirement, dropped from the rolls, dismissal, termination, end of term, finished contract, or phased out)?</p>
          <YesNoField label="Separated" value={draft.separatedFromService} onChange={(v) => set('separatedFromService', v)} />
          {draft.separatedFromService && (
            <Field label="If YES, give details" value={draft.separatedDetails} onChange={(v) => set('separatedDetails', v)} />
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold" style={{ color: BRAND.navy }}>38a. Have you ever been a candidate in a national or local election (except Barangay election) held within the last year?</p>
          <YesNoField label="Candidate" value={draft.electionCandidate} onChange={(v) => set('electionCandidate', v)} />
          {draft.electionCandidate && (
            <Field label="If YES, give details" value={draft.electionCandidateDetails} onChange={(v) => set('electionCandidateDetails', v)} />
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold" style={{ color: BRAND.navy }}>38b. Have you resigned from the government service during the 3-month period before the last election to campaign for a candidate?</p>
          <YesNoField label="Resigned to campaign" value={draft.resignedToCampaign} onChange={(v) => set('resignedToCampaign', v)} />
          {draft.resignedToCampaign && (
            <Field label="If YES, give details" value={draft.resignedToCampaignDetails} onChange={(v) => set('resignedToCampaignDetails', v)} />
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold" style={{ color: BRAND.navy }}>39. Have you acquired the status of an immigrant or permanent resident of another country?</p>
          <YesNoField label="Immigrant/permanent resident" value={draft.immigrantStatus} onChange={(v) => set('immigrantStatus', v)} />
          {draft.immigrantStatus && (
            <Field label="If YES, which country?" value={draft.immigrantCountry} onChange={(v) => set('immigrantCountry', v)} />
          )}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold" style={{ color: BRAND.navy }}>40. Indigenous group / person with disability / solo parent status</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <YesNoField label="a. Member of an indigenous group?" value={draft.indigenousGroupMember} onChange={(v) => set('indigenousGroupMember', v)} />
              {draft.indigenousGroupMember && (
                <div className="mt-2"><Field label="Please specify" value={draft.indigenousGroupSpecify} onChange={(v) => set('indigenousGroupSpecify', v)} /></div>
              )}
            </div>
            <div>
              <YesNoField label="b. Person with disability?" value={draft.personWithDisability} onChange={(v) => set('personWithDisability', v)} />
              {draft.personWithDisability && (
                <div className="mt-2"><Field label="PWD ID No." value={draft.pwdIdNumber} onChange={(v) => set('pwdIdNumber', v)} /></div>
              )}
            </div>
            <div>
              <YesNoField label="c. Solo parent?" value={draft.soloParent} onChange={(v) => set('soloParent', v)} />
              {draft.soloParent && (
                <div className="mt-2"><Field label="Solo Parent ID No." value={draft.soloParentIdNumber} onChange={(v) => set('soloParentIdNumber', v)} /></div>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold" style={{ color: BRAND.navy }}>41. References</h3>
            <button
              type="button"
              onClick={addReference}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold"
              style={{ borderColor: BRAND.line, color: BRAND.blue, background: '#EEF0FD' }}
            >
              <Plus className="h-3 w-3" /> Add reference
            </button>
          </div>
          <p className="mb-2 text-xs" style={{ color: BRAND.navy, opacity: 0.7 }}>Person not related by consanguinity or affinity to you.</p>
          {references.length === 0 && (
            <p className="text-xs italic" style={{ color: BRAND.navy, opacity: 0.6 }}>No references on record.</p>
          )}
          <div className="space-y-2">
            {references.map((ref, i) => (
              <div key={ref.id ?? i} className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                <Field label="Name" value={ref.name} onChange={(v) => updateReference(i, { name: v })} />
                <Field label="Office/Residential Address" value={ref.address || ''} onChange={(v) => updateReference(i, { address: v })} />
                <Field label="Contact No. / Email" value={ref.contactInfo || ''} onChange={(v) => updateReference(i, { contactInfo: v })} />
                <button
                  type="button"
                  onClick={() => removeReference(i)}
                  className="inline-flex h-9 items-center justify-center rounded-md border px-2 text-red-600"
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
            <Field label="Government Issued ID (Passport, GSIS, SSS, PRC, Driver's License, etc.)" value={draft.govIdType} onChange={(v) => set('govIdType', v)} />
            <Field label="ID/License/Passport No." value={draft.govIdNumber} onChange={(v) => set('govIdNumber', v)} />
            <Field label="Date/Place of Issuance" value={draft.govIdIssuedDatePlace} onChange={(v) => set('govIdIssuedDatePlace', v)} />
          </div>
        </div>

        <SaveBar saving={saving} onSave={() => void saveBackgroundSection()} label="Save Background Information" />
      </SectionCard>
      )}
    </div>
  );
};
