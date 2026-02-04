import type { ApplicantFormData, ValidationErrors } from '../types/applicant.types';

export const validateApplicantForm = (data: ApplicantFormData): ValidationErrors => {
  const errors: ValidationErrors = {};

  // Name validation
  if (!data.name.trim()) {
    errors.name = 'Name is required';
  } else if (data.name.trim().length < 2) {
    errors.name = 'Name must be at least 2 characters';
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

  return errors;
};

export const validateFiles = (files: File[], categorizedFiles?: any[]): string | null => {
  // Check if required documents are uploaded
  if (categorizedFiles) {
    const requiredDocTypes = [
      'application_letter',
      'pds_with_photo',
      'eligibility_proof',
      'training_certificate',
      'transcript_of_records',
      'drug_test'
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
        drug_test: 'Drug Test Result'
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
