/**
 * Employee Portal — Personal Data Sheet, CS Form No. 212 (Revised 2025), page 1 / sheet "C1".
 *
 * Mirrors the official form's sections and numbered items (I. Personal Information,
 * II. Family Background, III. Educational Background — table only, page 1 stops there),
 * but styled as an ordinary CICTrix card form rather than a copy of the spreadsheet's
 * grid/boxes. One always-editable form, one Save button — the sheet is short enough
 * that per-field Edit/Cancel toggles would only add friction.
 *
 * All reads/writes go through the data layer commit 06f3ccd already built:
 *   - scalars + addresses -> patchPortalEmployee (lib/api/employeePortal.ts)
 *   - item 23 (children) and item 26 (education) -> lib/api/personalDataSheet.ts,
 *     which use replace-all semantics for these two repeating lists.
 */

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { AddressParts, Employee, EmployeeChild, EmployeeEducation } from '../../types/employee.types';
import { emptyAddress } from '../../types/employee.types';
import { patchPortalEmployee } from '../../lib/api/employeePortal';
import { listChildren, saveChildren, listEducation, saveEducation, buildEducationRows } from '../../lib/api/personalDataSheet';

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

type SubTab = 'personal' | 'family' | 'education';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'personal', label: 'Personal Information' },
  { id: 'family', label: 'Family Background' },
  { id: 'education', label: 'Educational Background' },
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
      const [childrenRes, educationRes] = await Promise.all([
        listChildren(employeeId),
        listEducation(employeeId),
      ]);
      if (cancelled) return;
      if (childrenRes.ok !== false) setChildren(childrenRes.data);
      if (educationRes.ok !== false) setEducation(buildEducationRows(educationRes.data));
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
                <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: BRAND.blue }}>{row.level}</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Field label="Name of School" value={row.school || ''} onChange={(v) => updateEducation(i, { school: v })} />
                  <Field label="Basic Education/Degree/Course" value={row.degree || ''} onChange={(v) => updateEducation(i, { degree: v })} />
                  <Field label="Highest Level/Units Earned" value={row.highestLevelUnits || ''} onChange={(v) => updateEducation(i, { highestLevelUnits: v })} />
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <Field label="Period From" value={row.periodFrom || ''} onChange={(v) => updateEducation(i, { periodFrom: v })} />
                  <Field label="Period To" value={row.periodTo || ''} onChange={(v) => updateEducation(i, { periodTo: v })} />
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
    </div>
  );
};
