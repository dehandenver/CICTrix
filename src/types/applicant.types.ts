export interface ApplicantFormData {
  first_name: string;
  middle_name: string;
  last_name: string;
  gender: string;
  address: string;
  contact_number: string;
  email: string;
  position: string;
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
  work_experience_years: string;
  work_experience_months: string;
  relevant_experience_position: string;
  relevant_experience_company: string;
  relevant_experience_duties: string;
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
  relevant_experience_position?: string;
  relevant_experience_company?: string;
  relevant_experience_duties?: string;
  gov_id_type?: string;
  gov_id_expiration?: string;
}

export interface UploadedFile {
  file: File;
  id: string;
}
