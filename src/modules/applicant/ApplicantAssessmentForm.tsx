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

// Position to Department Mapping
const POSITION_TO_DEPARTMENT: Record<string, string> = {
  'Software Developer': 'Information Technology',
  'Project Manager': 'Operations',
  'Business Analyst': 'Operations',
  'QA Engineer': 'Information Technology',
  'DevOps Engineer': 'Information Technology',
  'UI/UX Designer': 'Product Management',
  'Data Analyst': 'Product Management',
  'System Administrator': 'Information Technology',
};

export const ApplicantAssessmentForm: React.FC<ApplicantAssessmentFormProps> = ({
  formData,
  errors,
  onChange,
}) => {
  const handlePositionChange = (positionValue: string) => {
    onChange('position', positionValue);
    
    // Auto-assign department based on position
    const assignedDepartment = POSITION_TO_DEPARTMENT[positionValue];
    if (assignedDepartment) {
      onChange('office', assignedDepartment);
    }
  };
  return (
    <Card title="Applicant Assessment Form">
      <div className="grid gap-md md:grid-cols-2">
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
          onChange={(e) => handlePositionChange(e.target.value)}
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
