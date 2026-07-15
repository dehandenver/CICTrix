import React, { useEffect, useRef, useState } from 'react';
import { Card, Input, Select } from '../../components';
import { DEPARTMENT_OPTIONS, POSITION_TO_DEPARTMENT_MAP } from '../../constants/positions';
import { ensureRecruitmentSeedData, getAuthoritativeJobPostings, loadJobPostings } from '../../lib/recruitmentData';
import type { ApplicantFormData, ValidationErrors } from '../../types/applicant.types';

interface ApplicantAssessmentFormProps {
  formData: ApplicantFormData;
  errors: ValidationErrors;
  onChange: (field: keyof ApplicantFormData, value: string | boolean) => void;
  applicationType?: 'job' | 'promotion';
  /** True when the user is verified as a current employee (active session or employee_id). */
  isEmployee?: boolean;
  /** Called when a non-employee toggles the application type radio group. Ignored when isEmployee. */
  onApplicationTypeChange?: (next: 'job' | 'promotion') => void;
  /** When true the position/department were prefilled from a job click and should be locked */
  lockedPosition?: boolean;
}

export const ApplicantAssessmentForm: React.FC<ApplicantAssessmentFormProps> = ({
  formData,
  errors,
  onChange,
  applicationType = 'job',
  isEmployee = false,
  onApplicationTypeChange,
  lockedPosition = false,
}) => {
  const [dynamicPositionOptions, setDynamicPositionOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [positionDepartmentMap, setPositionDepartmentMap] = useState<Record<string, string>>({});
  const hasLoadedPositionsRef = useRef(false);

  const syncPostedPositions = (currentSelectedPosition?: string) => {
    ensureRecruitmentSeedData();

    const activeRows = getAuthoritativeJobPostings().filter(
      (row) => String(row?.status ?? '').trim().toLowerCase() === 'active'
    );

    if (activeRows.length === 0) {
      setPositionDepartmentMap({});
      // If there are no authoritative job rows yet, preserve any
      // prefilled position coming from the landing page so the user
      // doesn't lose the selection while the background loader runs.
      if (currentSelectedPosition) {
        setDynamicPositionOptions([{ value: currentSelectedPosition, label: currentSelectedPosition }]);
        // Keep existing office value — do not clear it here.
      } else {
        setDynamicPositionOptions([]);
      }

      return;
    }

    hasLoadedPositionsRef.current = true;

    const seen = new Set<string>();
    const nextOptions: Array<{ value: string; label: string }> = [];
    const nextDepartmentMap: Record<string, string> = {};

    activeRows.forEach((row) => {
      const title = String(row?.title ?? '').trim();
      const department = String(row?.department ?? '').trim();
      if (!title) return;

      const normalized = title.toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        nextOptions.push({ value: title, label: title });
      }

      if (department && !nextDepartmentMap[title]) {
        nextDepartmentMap[title] = department;
      }
    });

    setPositionDepartmentMap(nextDepartmentMap);
    // If the current selected position came from a landing/page click and
    // isn't present in the active job options, make sure the dropdown still
    // contains it so the prefilled value remains visible and selectable.
    if (currentSelectedPosition && !nextOptions.some((option) => option.value === currentSelectedPosition)) {
      const fallbackDept = POSITION_TO_DEPARTMENT_MAP[currentSelectedPosition] || '';
      nextOptions.unshift({ value: currentSelectedPosition, label: currentSelectedPosition });
      if (fallbackDept && !nextDepartmentMap[currentSelectedPosition]) {
        nextDepartmentMap[currentSelectedPosition] = fallbackDept;
      }
    }

    setDynamicPositionOptions(nextOptions);
    setPositionDepartmentMap(nextDepartmentMap);
  };

  useEffect(() => {
    syncPostedPositions(formData.position);
    loadJobPostings().then(() => syncPostedPositions(formData.position));

    const onFocus = () => {
      loadJobPostings().then(() => syncPostedPositions(formData.position));
    };
    const onUpdated = () => syncPostedPositions(formData.position);
    window.addEventListener('focus', onFocus);
    window.addEventListener('cictrix:job-postings-updated', onUpdated as EventListener);

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('cictrix:job-postings-updated', onUpdated as EventListener);
    };
  }, [formData.position, onChange]);

  useEffect(() => {
    if (lockedPosition) return; // preserve prefilled values when fields are locked
    if (!formData.position) return;
    // Only clear the position if positions have been loaded at least once
    // This prevents clearing valid prefilled values while options are still loading
    if (!hasLoadedPositionsRef.current) return;

    const exists = dynamicPositionOptions.some((option) => option.value === formData.position);
    if (exists) return;

    onChange('position', '');
    onChange('office', '');
  }, [dynamicPositionOptions, formData.position, onChange, lockedPosition]);

  // Extract base position title (without rank level like I, II, III, IV, V, etc.)
  const getBasePositionTitle = (position: string): string => {
    return position.replace(/\s+(I+|V|X|XI+|IX|IV)$/i, '').trim();
  };

  // Auto-populate department when position is set (from prefilled data)
  useEffect(() => {
    if (!formData.position || formData.office) return;
    const basePosition = getBasePositionTitle(formData.position);
    const assignedDepartment = positionDepartmentMap[formData.position]
      ?? positionDepartmentMap[basePosition]
      ?? POSITION_TO_DEPARTMENT_MAP[formData.position]
      ?? POSITION_TO_DEPARTMENT_MAP[basePosition];
    if (assignedDepartment) {
      onChange('office', assignedDepartment);
    }
  }, [formData.position, formData.office, positionDepartmentMap, onChange]);

  const handlePositionChange = (positionValue: string) => {
    onChange('position', positionValue);

    // Auto-assign department based on position (handle rank levels like I, II, III, V)
    const basePosition = getBasePositionTitle(positionValue);
    const assignedDepartment = positionDepartmentMap[positionValue]
      ?? positionDepartmentMap[basePosition]
      ?? POSITION_TO_DEPARTMENT_MAP[positionValue]
      ?? POSITION_TO_DEPARTMENT_MAP[basePosition];
    if (assignedDepartment) {
      onChange('office', assignedDepartment);
    }
  };

  const isPromotion = applicationType === 'promotion';

  return (
    <Card title="Applicant Assessment Form">      {/* Application Type — radio group for both Original and Promotional. */}
      <fieldset className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <legend className="px-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
          Application Type
        </legend>

        <div role="radiogroup" aria-required className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {([
            { value: 'job' as const, label: 'Original', description: 'Initial entry into the service.' },
            { value: 'promotion' as const, label: 'Promotional', description: 'Higher position or specific eligibility.' },
          ]).map((opt) => {
            const checked = applicationType === opt.value;
            return (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  checked
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="application_type"
                  value={opt.value}
                  checked={checked}
                  onChange={() => onApplicationTypeChange?.(opt.value)}
                  className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">{opt.label}</span>
                  <span className="block text-xs text-slate-600">{opt.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-md md:grid-cols-2">
        {isPromotion && (
          <>
            <Input
              label="Employee ID"
              placeholder="Enter your employee ID"
              value={formData.employee_id}
              onChange={(e) => onChange('employee_id', e.target.value)}
              error={errors.employee_id}
              required
            />

            <Input
              label="Employee Portal Username"
              placeholder="Enter your portal username"
              value={formData.employee_username}
              onChange={(e) => onChange('employee_username', e.target.value)}
            />

            <Input
              label="Current Position"
              placeholder="Enter your current position"
              value={formData.current_position}
              onChange={(e) => onChange('current_position', e.target.value)}
              error={errors.current_position}
              required
            />

            <Input
              label="Current Department"
              placeholder="Enter your current department"
              value={formData.current_department}
              onChange={(e) => onChange('current_department', e.target.value)}
              error={errors.current_department}
              required
            />

            <Input
              label="Current Division"
              placeholder="Enter your current division (optional)"
              value={formData.current_division}
              onChange={(e) => onChange('current_division', e.target.value)}
            />
          </>
        )}

        <Input
          label="First Name"
          placeholder="Enter your first name"
          value={formData.first_name}
          onChange={(e) => onChange('first_name', e.target.value)}
          error={errors.first_name}
          required
        />

        <Input
          label="Middle Name"
          placeholder="Enter your middle name"
          value={formData.middle_name}
          onChange={(e) => onChange('middle_name', e.target.value)}
          error={errors.middle_name}
        />

        <Input
          label="Last Name"
          placeholder="Enter your last name"
          value={formData.last_name}
          onChange={(e) => onChange('last_name', e.target.value)}
          error={errors.last_name}
          required
        />

        <Select
          label="Gender"
          options={[
            { value: 'Male', label: 'Male' },
            { value: 'Female', label: 'Female' }
          ]}
          value={formData.gender}
          onChange={(e) => onChange('gender', e.target.value)}
          error={errors.gender}
          required
        />

        <Input
          label="Email Address"
          type="email"
          placeholder="your.email@example.com"
          value={formData.email}
          onChange={(e) => onChange('email', e.target.value)}
          error={errors.email}
          required
        />

        <Input
          label="Contact Number"
          type="tel"
          placeholder="+63 912 345 6789"
          value={formData.contact_number}
          onChange={(e) => onChange('contact_number', e.target.value)}
          error={errors.contact_number}
          required
        />

        <div className="md:col-span-2">
          <Input
            label="Address"
            placeholder="Enter your complete address"
            value={formData.address}
            onChange={(e) => onChange('address', e.target.value)}
            error={errors.address}
            required
          />
        </div>

        {lockedPosition ? (
          <Input
            label="Position Applied For"
            value={formData.position}
            readOnly
          />
        ) : (
          (() => {
            const posOpts: Array<{ value: string; label: string }> = [...dynamicPositionOptions];
            if (formData.position && !posOpts.some((p) => p.value === formData.position)) {
              posOpts.unshift({ value: formData.position, label: formData.position });
            }

            return (
              <Select
                label="Position Applied For"
                options={posOpts}
                value={formData.position}
                onChange={(e) => handlePositionChange(e.target.value)}
                error={errors.position}
                required
              />
            );
          })()
        )}

        <Input
          label="Item Number"
          placeholder="Generated automatically while filling out the form"
          value={formData.item_number}
          readOnly
        />

        {
          // Ensure the department dropdown contains the prefilled office
          // (e.g., 'Human Resource Management Office') when it doesn't
          // exactly match the static `DEPARTMENT_OPTIONS` list.
        }
        {lockedPosition ? (
          <Input
            label="Department"
            value={formData.office}
            readOnly
          />
        ) : (
          (() => {
            const deptOpts: Array<{ value: string; label: string }> = [...DEPARTMENT_OPTIONS];
            if (formData.office && !deptOpts.some((d) => d.value === formData.office)) {
              deptOpts.unshift({ value: formData.office, label: formData.office });
            }

            return (
              <Select
                label="Department"
                options={deptOpts}
                value={formData.office}
                onChange={(e) => onChange('office', e.target.value)}
                error={errors.office}
                required
              />
            );
          })()
        )}

        <div className="md:col-span-2">
          <p className="mb-2 text-sm font-medium text-slate-700">Are you a Person with Disability (PWD)?</p>
          <div className="flex gap-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="is_pwd"
                value="yes"
                checked={formData.is_pwd === true}
                onChange={() => onChange('is_pwd', true)}
                className="h-4 w-4 accent-blue-600"
              />
              Yes, I am a PWD
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="is_pwd"
                value="no"
                checked={formData.is_pwd === false}
                onChange={() => onChange('is_pwd', false)}
                className="h-4 w-4 accent-blue-600"
              />
              No
            </label>
          </div>
        </div>
      </div>

      {/* Educational Background */}
      <fieldset className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <legend className="px-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
          Educational Background
        </legend>
        <div className="space-y-3">
          <div>
            <label htmlFor="education-attainment" className="mb-1.5 block text-sm font-medium text-slate-700">
              Highest Educational Attainment
            </label>
            <select
              id="education-attainment"
              value={formData.education_attainment}
              onChange={(e) => {
                const next = e.target.value;
                onChange('education_attainment', next);
                const needsDegree =
                  next === 'College Graduate' ||
                  next === 'Masteral Units' ||
                  next === 'Graduate School';
                if (!needsDegree && formData.education_degree) {
                  onChange('education_degree', '');
                }
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select educational attainment...</option>
              <option value="Elementary Level">Elementary Level</option>
              <option value="Elementary Graduate">Elementary Graduate</option>
              <option value="High School Level">High School Level</option>
              <option value="High School Graduate">High School Graduate</option>
              <option value="College Level">College Level</option>
              <option value="College Graduate">College Graduate</option>
              <option value="Masteral Units">Masteral Units</option>
              <option value="Graduate School">Graduate School</option>
            </select>
          </div>

          {(formData.education_attainment === 'College Graduate' ||
            formData.education_attainment === 'Masteral Units' ||
            formData.education_attainment === 'Graduate School') && (
            <Input
              label="Degree / Course"
              placeholder="e.g. Bachelor of Science in Information Technology"
              value={formData.education_degree}
              onChange={(e) => onChange('education_degree', e.target.value)}
            />
          )}
        </div>
      </fieldset>

      {/* Work Experience */}
      <fieldset className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <legend className="px-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
          Relevant Work Experience
        </legend>
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <strong>HR Policy Notice:</strong> Only work experience relevant to the position you are applying for should be entered if required by HR policies. In Step 2, you will be asked to upload your <strong>Curriculum Vitae (CV)</strong> as supporting document.
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Years of Relevant Experience"
            type="number"
            min={0}
            placeholder="e.g. 5"
            value={formData.work_experience_years}
            onChange={(e) => onChange('work_experience_years', e.target.value)}
            error={errors.work_experience_years}
          />
          <Input
            label="Additional Months"
            type="number"
            min={0}
            max={11}
            placeholder="e.g. 6"
            value={formData.work_experience_months}
            onChange={(e) => onChange('work_experience_months', e.target.value)}
          />
          <div className="sm:col-span-2">
            <Input
              label="Position Held"
              placeholder="e.g. Senior Administrative Assistant"
              value={formData.relevant_experience_position || ''}
              onChange={(e) => onChange('relevant_experience_position', e.target.value)}
              error={errors.relevant_experience_position}
            />
          </div>
          <div className="sm:col-span-2">
            <Input
              label="Company / Organization"
              placeholder="e.g. Department of Public Works and Highways"
              value={formData.relevant_experience_company || ''}
              onChange={(e) => onChange('relevant_experience_company', e.target.value)}
              error={errors.relevant_experience_company}
            />
          </div>
          <div className="sm:col-span-2 mb-2">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Description of Duties (Related to the job applied for)
            </label>
            <textarea
              placeholder="Describe your relevant duties and achievements..."
              value={formData.relevant_experience_duties || ''}
              onChange={(e) => onChange('relevant_experience_duties', e.target.value)}
              className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 min-h-[80px] ${
                errors.relevant_experience_duties ? 'border-red-500 ring-1 ring-red-500' : ''
              }`}
            />
            {errors.relevant_experience_duties && (
              <span className="text-sm font-medium text-red-500 mt-1 block">
                {errors.relevant_experience_duties}
              </span>
            )}
          </div>
        </div>
      </fieldset>
    </Card>
  );
};
