import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { Briefcase, BriefcaseBusiness, ClipboardList, GraduationCap, Mail, Plus, Trash2, UserRound } from 'lucide-react';
import { Input, Select } from '../../components';
import { FormSection } from './flow/FlowUi';
import { POSITION_TO_DEPARTMENT_MAP } from '../../constants/positions';
import { useDepartmentOptions } from '../../hooks/useDepartmentOptions';
import { ensureRecruitmentSeedData, getAuthoritativeJobPostings, loadJobPostings } from '../../lib/recruitmentData';
import type { ApplicantFormData, ValidationErrors } from '../../types/applicant.types';
import { COURSE_GROUPS, OTHER_COURSE, isCanonicalCourse } from '../../lib/courses';
import {
  MAX_WORK_EXPERIENCES,
  MONTHS_PER_YEAR,
  emptyWorkExperience,
  type WorkExperienceEntry,
  type WorkExperienceErrors,
  type WorkExperienceField,
} from '../../lib/workExperience';

interface ApplicantAssessmentFormProps {
  formData: ApplicantFormData;
  errors: ValidationErrors;
  onChange: (field: keyof ApplicantFormData, value: ApplicantFormData[keyof ApplicantFormData]) => void;
  applicationType?: 'job' | 'promotion';
  /** True when the user is verified as a current employee (active session or employee_id). */
  isEmployee?: boolean;
  /** True while the debounced auto-lookup is fetching employee data. */
  isLoadingPrefill?: boolean;
  /** Called when a non-employee toggles the application type radio group. Ignored when isEmployee. */
  onApplicationTypeChange?: (next: 'job' | 'promotion') => void;
  /** When true the position/department were prefilled from a job click and should be locked */
  lockedPosition?: boolean;
  /**
   * Rendered between Educational background and Relevant work experience, so
   * a short card from another component (Government ID) can sit beside
   * Education in the two-column grid while DOM order stays reading order.
   */
  afterEducation?: ReactNode;
  /** Name of the plantilla this form is for, e.g. "Plantilla 2". Blank for a general application. */
  plantillaName?: string;
  /** Makes element ids unique per plantilla form (one form per tab). */
  idPrefix?: string;
  /** Step 2 page to show (flow/formPages.ts). Omitted shows every section. */
  page?: number;
}

const icon = (Icon: typeof UserRound) => <Icon size={20} strokeWidth={1.75} />;

/**
 * Relevant work experience as a repeatable list (lib/workExperience): one card
 * per entry with the same five fields, its own heading and its own errors.
 * Starts with one entry; Remove is hidden while only one remains.
 */
const WorkExperienceList = ({
  entries,
  errors,
  idPrefix,
  onChange,
}: {
  entries: WorkExperienceEntry[];
  errors?: WorkExperienceErrors[];
  idPrefix: string;
  onChange: (next: WorkExperienceEntry[]) => void;
}) => {
  /** After Add, move focus to the new entry's heading so keyboard users land on it. */
  const focusIndex = useRef<number | null>(null);
  useEffect(() => {
    if (focusIndex.current === null) return;
    document.getElementById(`${idPrefix}-exp-${focusIndex.current}-title`)?.focus();
    focusIndex.current = null;
  }, [entries.length, idPrefix]);

  const update = (index: number, field: WorkExperienceField, value: string) =>
    onChange(entries.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry)));
  const add = () => {
    focusIndex.current = entries.length;
    onChange([...entries, emptyWorkExperience()]);
  };
  const remove = (index: number) => onChange(entries.filter((_, i) => i !== index));
  const atMax = entries.length >= MAX_WORK_EXPERIENCES;

  return (
    <div className="af-entries">
      {entries.map((entry, i) => {
        const err = errors?.[i] ?? {};
        const base = `${idPrefix}-exp-${i}`;
        return (
          <fieldset key={i} className="af-entry" aria-labelledby={`${base}-title`}>
            <div className="af-entry-head">
              <h3 id={`${base}-title`} className="af-entry-title" tabIndex={-1}>Work experience {i + 1}</h3>
              {entries.length > 1 && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => remove(i)}
                  aria-label={`Remove work experience ${i + 1}`}
                >
                  <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" /> Remove
                </button>
              )}
            </div>
            <div className="af-fields">
              <Input
                id={`${base}-years`}
                label="Years of Relevant Experience"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                placeholder="e.g. 5"
                value={entry.years}
                onChange={(e) => update(i, 'years', e.target.value)}
                error={err.years}
              />
              <Input
                id={`${base}-months`}
                label="Additional Months"
                type="number"
                min={0}
                max={MONTHS_PER_YEAR - 1}
                step={1}
                inputMode="numeric"
                placeholder="e.g. 6"
                value={entry.months}
                onChange={(e) => update(i, 'months', e.target.value)}
                error={err.months}
              />
              <Input
                id={`${base}-position`}
                label="Position Held"
                placeholder="e.g. Senior Administrative Assistant"
                value={entry.position}
                onChange={(e) => update(i, 'position', e.target.value)}
                error={err.position}
              />
              <Input
                id={`${base}-company`}
                label="Company / Organization"
                placeholder="e.g. Department of Public Works and Highways"
                value={entry.company}
                onChange={(e) => update(i, 'company', e.target.value)}
                error={err.company}
              />
              <div className="af-field af-field-full">
                <label htmlFor={`${base}-duties`} className="af-label">
                  Description of Duties (Related to the job applied for)
                </label>
                <textarea
                  id={`${base}-duties`}
                  placeholder="Describe your relevant duties and achievements..."
                  value={entry.duties}
                  onChange={(e) => update(i, 'duties', e.target.value)}
                  className="af-control"
                  aria-invalid={err.duties ? true : undefined}
                  aria-describedby={err.duties ? `${base}-duties-msg` : undefined}
                />
                {err.duties && (
                  <span id={`${base}-duties-msg`} className="af-error" role="alert">
                    {err.duties}
                  </span>
                )}
              </div>
            </div>
          </fieldset>
        );
      })}
      <div className="af-entries-foot">
        <button type="button" className="btn btn-secondary btn-md" onClick={add} disabled={atMax}>
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" /> Add another work experience
        </button>
        <span className="af-body-s">
          {atMax ? `You've added the maximum of ${MAX_WORK_EXPERIENCES}.` : `Up to ${MAX_WORK_EXPERIENCES} entries.`}
        </span>
      </div>
    </div>
  );
};

export const ApplicantAssessmentForm: React.FC<ApplicantAssessmentFormProps> = ({
  formData,
  errors,
  onChange,
  applicationType = 'job',
  isLoadingPrefill = false,
  onApplicationTypeChange,
  lockedPosition = false,
  afterEducation,
  idPrefix = 'af',
  plantillaName = '',
  page,
}) => {
  const onPage = (n: number) => page === undefined || page === n;
  const experiences = formData.work_experiences?.length ? formData.work_experiences : [emptyWorkExperience()];
  // Departments come from the canonical Supabase table, shared with every other
  // screen — never a list local to this form.
  const departmentOptions = useDepartmentOptions();
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

  // Two-column section cards (DESIGN_IDENTITY.md §9.3). Fields, labels and
  // validation are exactly what the single-card form had; only the grouping
  // and layout changed. DOM order = reading order (left→right, top→bottom).
  const educationNeedsDegree =
    formData.education_attainment === 'College Graduate' ||
    formData.education_attainment === 'Masteral Units' ||
    formData.education_attainment === 'Graduate School';

  // The course is picked from a standardised list so one degree stops being
  // stored under four spellings. What is stored is still the course name
  // itself, not a code, so nothing that reads education_degree has to change.
  //
  // An applicant can arrive with a value already saved — a resumed draft, or a
  // record created before the list existed. If it is not on the list, the
  // select shows "Others" and the free-text box holds what they had, so
  // returning to the form never silently discards their answer.
  const degreeIsListed = isCanonicalCourse(formData.education_degree);
  const degreeIsOther = Boolean(formData.education_degree) && !degreeIsListed;
  const [courseIsOther, setCourseIsOther] = useState(degreeIsOther);
  useEffect(() => {
    if (degreeIsOther) setCourseIsOther(true);
  }, [degreeIsOther]);

  return (
    <>
      {onPage(1) && (<>
      {/* Application Type — radio group for both Original and Promotional. */}
      <FormSection icon={icon(ClipboardList)} title="Application type" headingId={`${idPrefix}-type`}>
        <div role="radiogroup" aria-required aria-labelledby={`${idPrefix}-type`} className="af-options">
          {([
            { value: 'job' as const, label: 'Original', description: 'Initial entry into the service.' },
            { value: 'promotion' as const, label: 'Promotional', description: 'Higher position or specific eligibility.' },
          ]).map((opt) => {
            const checked = applicationType === opt.value;
            return (
              <label key={opt.value} className="af-option" data-checked={checked}>
                <input
                  type="radio"
                  name={`${idPrefix}-application_type`}
                  value={opt.value}
                  checked={checked}
                  onChange={() => onApplicationTypeChange?.(opt.value)}
                />
                <span>
                  <span className="af-option-title">{opt.label}</span>
                  <span className="af-option-desc">{opt.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </FormSection>

      <FormSection icon={icon(UserRound)} title="Personal information" headingId={`${idPrefix}-personal`}>
        <div className="af-fields">
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
                helperText={isLoadingPrefill ? 'Looking up your records...' : undefined}
                icon={isLoadingPrefill ? <span className="af-spinner" aria-hidden="true" /> : undefined}
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

          <fieldset className="af-field af-field-full af-fieldset">
            <legend className="af-label">Are you a Person with Disability (PWD)?</legend>
            <div className="af-inline-radios">
              <label>
                <input
                  type="radio"
                  name={`${idPrefix}-is_pwd`}
                  value="yes"
                  checked={formData.is_pwd === true}
                  onChange={() => onChange('is_pwd', true)}
                />
                Yes, I am a PWD
              </label>
              <label>
                <input
                  type="radio"
                  name={`${idPrefix}-is_pwd`}
                  value="no"
                  checked={formData.is_pwd === false}
                  onChange={() => onChange('is_pwd', false)}
                />
                No
              </label>
            </div>
          </fieldset>
        </div>
      </FormSection>
      </>)}

      {onPage(2) && (<>
      <FormSection icon={icon(Mail)} title="Contact and address" headingId={`${idPrefix}-contact`}>
        <div className="af-fields">
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

          <div className="af-field-full">
            <Input
              label="Address"
              placeholder="Enter your complete address"
              value={formData.address}
              onChange={(e) => onChange('address', e.target.value)}
              error={errors.address}
              required
            />
          </div>
        </div>
      </FormSection>

      <FormSection icon={icon(Briefcase)} title="Position applied for" headingId={`${idPrefix}-position`}>
        <div className="af-fields">
          <div className="af-field-full">
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
          </div>

          {/* The plantilla this application is for, by its admin-given name
              ("Plantilla 2"). Never a code: the applicant's tracking code is
              the Reference No., issued on submission. */}
          <Input
            label="Plantilla"
            placeholder="Applies only when you apply through a specific job posting"
            value={plantillaName}
            readOnly
          />

          {
            // Ensure the department dropdown contains the prefilled office when it
            // isn't in the canonical departments table (e.g. a legacy value).
          }
          {lockedPosition ? (
            <Input
              label="Department"
              value={formData.office}
              readOnly
            />
          ) : (
            (() => {
              const deptOpts: Array<{ value: string; label: string }> = [...departmentOptions];
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
        </div>
      </FormSection>
      </>)}

      {onPage(3) && (<>
      {/* Educational Background */}
      <FormSection icon={icon(GraduationCap)} title="Educational background" headingId={`${idPrefix}-education`}>
        <div className="af-fields">
          <div className="af-field af-field-full">
            <label htmlFor={`${idPrefix}-education-attainment`} className="af-label">
              Highest Educational Attainment
            </label>
            <select
              id={`${idPrefix}-education-attainment`}
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
                  // Also drop the "Others" state, or coming back to a degree
                  // attainment would reopen the free-text box with nothing in
                  // it instead of the list.
                  setCourseIsOther(false);
                }
              }}
              className="af-control"
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

          {educationNeedsDegree && (
            <div className="af-field af-field-full">
              <label htmlFor={`${idPrefix}-education-degree`} className="af-label">
                Degree / Course
              </label>
              <select
                id={`${idPrefix}-education-degree`}
                value={courseIsOther ? OTHER_COURSE : formData.education_degree}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next === OTHER_COURSE) {
                    // Clear the canonical value so the text box starts empty
                    // rather than inheriting the course they just moved away
                    // from, which would be stored as if they had typed it.
                    setCourseIsOther(true);
                    onChange('education_degree', '');
                    return;
                  }
                  setCourseIsOther(false);
                  onChange('education_degree', next);
                }}
                className="af-control"
              >
                <option value="">Select your course...</option>
                {COURSE_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.courses.map((course) => (
                      <option key={course} value={course}>
                        {course}
                      </option>
                    ))}
                  </optgroup>
                ))}
                <option value={OTHER_COURSE}>{OTHER_COURSE} (not listed)</option>
              </select>
              {courseIsOther && (
                <div style={{ marginTop: 12 }}>
                  <Input
                    label="Please specify your course"
                    placeholder="e.g. Bachelor of Science in Marine Transportation"
                    value={formData.education_degree}
                    onChange={(e) => onChange('education_degree', e.target.value)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </FormSection>

      {afterEducation}
      </>)}

      {/* Work Experience — wide: a list of entries, five fields each */}
      {onPage(4) && (
      <FormSection
        icon={icon(BriefcaseBusiness)}
        title="Relevant work experience"
        headingId={`${idPrefix}-experience`}
        wide
      >
        <p className="af-notice" style={{ marginBottom: 12 }}>
          <strong>HR policy notice:</strong> Only enter work experience relevant to the position you are applying for,
          if required by HR policies.
        </p>
        <p className="af-body-s" style={{ marginBottom: 20 }}>
          Add one entry per position. Count each period once: if two jobs overlapped, don&rsquo;t enter the overlapping
          months in both, because your total relevant experience is the sum of these entries.
        </p>
        <WorkExperienceList
          entries={experiences}
          errors={errors.work_experiences}
          idPrefix={idPrefix}
          onChange={(next) => onChange('work_experiences', next)}
        />
      </FormSection>
      )}
    </>
  );
};
