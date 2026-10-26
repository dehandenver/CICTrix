import type { WorkExperienceEntry, WorkExperienceErrors } from '../lib/workExperience';

export interface ApplicantFormData {
  first_name: string;
  middle_name: string;
  last_name: string;
  gender: string;
  address: string;
  contact_number: string;
  email: string;
  position: string;
  /**
   * The official Plantilla Item No. of the position applied for
   * (e.g. ABYAN-2026-985). Tied to the job post's slot, NOT to the applicant —
   * the applicant's own tracking code is `reference_no`, which the database
   * issues on submission. Empty for a general/walk-in application.
   */
  item_number: string;
  office: string;
  is_pwd: boolean;
  application_type: 'job' | 'promotion';
  employee_id: string;
  current_position: string;
  current_department: string;
  current_division: string;
  employee_username: string;
  education_attainment: string;
  education_degree: string;
  education_school: string;
  /** Relevant work experience, at least one entry (one blank entry = none). See lib/workExperience. */
  work_experiences: WorkExperienceEntry[];
  gov_id_type: string;
  gov_id_expiration: string;
}

export interface ValidationErrors {
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  gender?: string;
  address?: string;
  contact_number?: string;
  email?: string;
  position?: string;
  item_number?: string;
  office?: string;
  employee_id?: string;
  current_position?: string;
  current_department?: string;
  /** Per-entry field errors, aligned with work_experiences; absent when all are valid. */
  work_experiences?: WorkExperienceErrors[];
  gov_id_type?: string;
  gov_id_expiration?: string;
}

export interface UploadedFile {
  file: File;
  id: string;
}
