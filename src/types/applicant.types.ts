export interface ApplicantFormData {
  first_name: string;
  middle_name: string;
  last_name: string;
  address: string;
  contact_number: string;
  email: string;
  position: string;
  item_number: string;
  office: string;
  is_pwd: boolean;
}

export interface ValidationErrors {
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  address?: string;
  contact_number?: string;
  email?: string;
  position?: string;
  item_number?: string;
  office?: string;
}

export interface UploadedFile {
  file: File;
  id: string;
}
