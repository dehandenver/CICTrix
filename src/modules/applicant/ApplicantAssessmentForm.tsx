import React from 'react';
import { Card, Checkbox, Input, Select } from '../../components';
import type { ApplicantFormData, ValidationErrors } from '../../types/applicant.types';

interface ApplicantAssessmentFormProps {
  formData: ApplicantFormData;
  errors: ValidationErrors;
  onChange: (field: keyof ApplicantFormData, value: string | boolean) => void;
}

const POSITION_OPTIONS = [
  { value: 'Software Developer', label: 'Software Developer' },
  { value: 'Project Manager', label: 'Project Manager' },
  { value: 'Business Analyst', label: 'Business Analyst' },
  { value: 'QA Engineer', label: 'QA Engineer' },
  { value: 'DevOps Engineer', label: 'DevOps Engineer' },
  { value: 'UI/UX Designer', label: 'UI/UX Designer' },
  { value: 'Data Analyst', label: 'Data Analyst' },
  { value: 'System Administrator', label: 'System Administrator' },
];

const OFFICE_OPTIONS = [
  { value: 'Human Resources', label: 'Human Resources' },
  { value: 'Finance', label: 'Finance' },
  { value: 'Information Technology', label: 'Information Technology' },
  { value: 'Operations', label: 'Operations' },
  { value: 'Sales & Marketing', label: 'Sales & Marketing' },
  { value: 'Customer Support', label: 'Customer Support' },
  { value: 'Legal', label: 'Legal' },
  { value: 'Product Management', label: 'Product Management' },
];

export const ApplicantAssessmentForm: React.FC<ApplicantAssessmentFormProps> = ({
  formData,
  errors,
  onChange,
}) => {
  return (
    <Card title="Applicant Assessment Form">
      <div className="grid gap-md md:grid-cols-2">
        <Input
          label="Full Name"
          placeholder="Enter your full name"
          value={formData.name}
          onChange={(e) => onChange('name', e.target.value)}
          error={errors.name}
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

        <Select
          label="Position Applied For"
          options={POSITION_OPTIONS}
          value={formData.position}
          onChange={(e) => onChange('position', e.target.value)}
          error={errors.position}
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
          label="Department"
          options={OFFICE_OPTIONS}
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
