import type { ApplicantFormData, ValidationErrors } from '../types/applicant.types';

export const validateApplicantForm = (data: ApplicantFormData): ValidationErrors => {
  const errors: ValidationErrors = {};

  // First name validation
  if (!data.first_name.trim()) {
    errors.first_name = 'First name is required';
  } else if (data.first_name.trim().length < 2) {
    errors.first_name = 'First name must be at least 2 characters';
  }

  // Middle name validation (optional but if provided must be valid)
  if (data.middle_name.trim() && data.middle_name.trim().length < 2) {
    errors.middle_name = 'Middle name must be at least 2 characters';
  }

  // Last name validation
  if (!data.last_name.trim()) {
    errors.last_name = 'Last name is required';
  } else if (data.last_name.trim().length < 2) {
    errors.last_name = 'Last name must be at least 2 characters';
  }

  // Gender validation
  if (!data.gender.trim()) {
    errors.gender = 'Gender is required';
  } else if (!['Male', 'Female'].includes(data.gender)) {
    errors.gender = 'Please select a valid gender';
  }

  // Address validation
  if (!data.address.trim()) {
    errors.address = 'Address is required';
  } else if (data.address.trim().length < 5) {
    errors.address = 'Address must be at least 5 characters';
  }

  // Contact number validation
  if (!data.contact_number.trim()) {
    errors.contact_number = 'Contact number is required';
  } else if (!/^[\d\s\-\+\(\)]+$/.test(data.contact_number)) {
    errors.contact_number = 'Invalid contact number format';
  }

  // Email validation
  if (!data.email.trim()) {
    errors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = 'Invalid email format';
  }

  // Position validation
  if (!data.position.trim()) {
    errors.position = 'Position is required';
  }

  // Office validation
  if (!data.office.trim()) {
    errors.office = 'Office is required';
  }

  // Relevant Work Experience validation
  const hasExperienceYears = data.work_experience_years && data.work_experience_years.trim();
  const hasExperienceMonths = data.work_experience_months && data.work_experience_months.trim();
  const hasExperienceFilled =
    hasExperienceYears ||
    hasExperienceMonths ||
    (data.relevant_experience_position && data.relevant_experience_position.trim()) ||
    (data.relevant_experience_company && data.relevant_experience_company.trim()) ||
    (data.relevant_experience_duties && data.relevant_experience_duties.trim());

  if (hasExperienceFilled) {
    if (!hasExperienceYears && !hasExperienceMonths) {
      errors.work_experience_years = 'Years/months of experience is required';
    }
    if (!data.relevant_experience_position || !data.relevant_experience_position.trim()) {
      errors.relevant_experience_position = 'Position held is required';
    }
    if (!data.relevant_experience_company || !data.relevant_experience_company.trim()) {
      errors.relevant_experience_company = 'Company/organization is required';
    }
    if (!data.relevant_experience_duties || !data.relevant_experience_duties.trim()) {
      errors.relevant_experience_duties = 'Description of duties is required';
    }
  }

  // Government ID validation for original application
  if (data.application_type === 'job') {
    if (!data.gov_id_type) {
      errors.gov_id_type = 'Government ID type is required';
    }
    
    const needsExpiration = ['Passport', "Driver's License", 'PRC ID', 'Postal ID'].includes(data.gov_id_type);
    if (needsExpiration) {
      if (!data.gov_id_expiration) {
        errors.gov_id_expiration = 'Expiration date is required';
      } else {
        const expDate = new Date(data.gov_id_expiration);
        const today = new Date();
        today.setHours(0,0,0,0);
        if (expDate <= today) {
          errors.gov_id_expiration = 'The ID must not be expired';
        }
      }
    }
  }

  return errors;
};

export const validateFiles = (
  files: File[],
  categorizedFiles?: any[],
  applicationType: 'job' | 'promotion' = 'job'
): string | null => {
  if (applicationType === 'promotion') {
    if (files.length === 0) {
      return 'Upload at least one supporting document for your promotional application';
    }
  }

  // Check if required documents are uploaded
  if (applicationType !== 'promotion' && categorizedFiles) {
    const requiredDocTypes = [
      'application_letter',
      'pds_with_photo',
      'eligibility_proof',
      'training_certificate',
      'transcript_of_records',
      'drug_test',
      'government_id'
    ];

    const uploadedTypes = categorizedFiles.map(f => f.documentType);
    const missingRequired = requiredDocTypes.filter(type => !uploadedTypes.includes(type));

    if (missingRequired.length > 0) {
      const docNames: Record<string, string> = {
        application_letter: 'Application Letter',
        pds_with_photo: 'Personal Data Sheet (PDS)',
        eligibility_proof: 'Proof of Eligibility Rating/License',
        training_certificate: 'Certificate of Relevant Training/Seminars',
        transcript_of_records: 'Transcript of Records',
        drug_test: 'Drug Test Result',
        government_id: 'Government-Issued ID'
      };
      const missing = missingRequired.map(type => docNames[type]).join(', ');
      return `Missing required documents: ${missing}`;
    }
  } else if (files.length === 0) {
    return 'At least one file is required';
  }

  const maxFileSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/jpg'
  ];

  for (const file of files) {
    if (file.size > maxFileSize) {
      return `File "${file.name}" exceeds 10MB limit`;
    }
    
    if (!allowedTypes.includes(file.type)) {
      return `File "${file.name}" has unsupported format. Please upload PDF, DOC, DOCX, JPG, or PNG files`;
    }
  }

  return null;
};
