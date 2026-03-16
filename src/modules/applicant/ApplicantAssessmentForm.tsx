import React, { useEffect, useState } from 'react';
import { Card, Checkbox, Input, Select } from '../../components';
import { DEPARTMENT_OPTIONS, POSITION_TO_DEPARTMENT_MAP } from '../../constants/positions';
import { ensureRecruitmentSeedData, getAuthoritativeJobPostings } from '../../lib/recruitmentData';
import type { ApplicantFormData, ValidationErrors } from '../../types/applicant.types';

interface ApplicantAssessmentFormProps {
  formData: ApplicantFormData;
  errors: ValidationErrors;
  onChange: (field: keyof ApplicantFormData, value: string | boolean) => void;
  applicationType?: 'job' | 'promotion';
}

export const ApplicantAssessmentForm: React.FC<ApplicantAssessmentFormProps> = ({
  formData,
  errors,
  onChange,
  applicationType = 'job',
}) => {
  const [dynamicPositionOptions, setDynamicPositionOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [positionDepartmentMap, setPositionDepartmentMap] = useState<Record<string, string>>({});

  const syncPostedPositions = (currentSelectedPosition?: string) => {
    ensureRecruitmentSeedData();

    const activeRows = getAuthoritativeJobPostings().filter(
      (row) => String(row?.status ?? '').trim().toLowerCase() === 'active'
    );

    if (activeRows.length === 0) {
      setPositionDepartmentMap({});
      setDynamicPositionOptions([]);

      if (currentSelectedPosition) {
        onChange('position', '');
        onChange('office', '');
      }

      return;
    }

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
    setDynamicPositionOptions(nextOptions);

    if (currentSelectedPosition) {
      const stillActive = nextOptions.some((option) => option.value === currentSelectedPosition);
      if (!stillActive) {
        onChange('position', '');
        onChange('office', '');
      }
    }
  };

  useEffect(() => {
    syncPostedPositions(formData.position);

    const onFocus = () => syncPostedPositions(formData.position);
    const onUpdated = () => syncPostedPositions(formData.position);
    window.addEventListener('focus', onFocus);
    window.addEventListener('cictrix:job-postings-updated', onUpdated as EventListener);

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('cictrix:job-postings-updated', onUpdated as EventListener);
    };
  }, [formData.position, onChange]);

  useEffect(() => {
    if (!formData.position) return;
    const exists = dynamicPositionOptions.some((option) => option.value === formData.position);
    if (exists) return;

    onChange('position', '');
    onChange('office', '');
  }, [dynamicPositionOptions, formData.position, onChange]);

  const handlePositionChange = (positionValue: string) => {
    onChange('position', positionValue);

    // Auto-assign department based on position
    const assignedDepartment = positionDepartmentMap[positionValue] ?? POSITION_TO_DEPARTMENT_MAP[positionValue];
    if (assignedDepartment) {
      onChange('office', assignedDepartment);
    }
  };

  const isPromotion = applicationType === 'promotion';

  return (
    <Card title="Applicant Assessment Form">
      <div className="grid gap-md md:grid-cols-2">
        {isPromotion && (
          <>
            <Input
              label="Employee ID"
              value={formData.employee_id}
              error={errors.employee_id}
              readOnly
            />

            <Input
              label="Employee Portal Username"
              value={formData.employee_username}
              readOnly
            />

            <Input
              label="Current Position"
              value={formData.current_position}
              error={errors.current_position}
              readOnly
            />

            <Input
              label="Current Department"
              value={formData.current_department}
              error={errors.current_department}
              readOnly
            />

            <Input
              label="Current Division"
              value={formData.current_division || 'Not specified'}
              readOnly
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

        <Select
          label="Position Applied For"
          options={dynamicPositionOptions}
          value={formData.position}
          onChange={(e) => handlePositionChange(e.target.value)}
          error={errors.position}
          required
        />

        <Input
          label="Item Number"
          placeholder="Generated automatically while filling out the form"
          value={formData.item_number}
          readOnly
        />

        <Select
          label="Department"
          options={DEPARTMENT_OPTIONS}
          value={formData.office}
          onChange={(e) => onChange('office', e.target.value)}
          error={errors.office}
          required
        />

        <div className="md:col-span-2">
          <Checkbox
            label="I am a Person with Disability (PWD)"
            checked={formData.is_pwd}
            onChange={(e) => onChange('is_pwd', e.target.checked)}
          />
        </div>
      </div>
    </Card>
  );
};
