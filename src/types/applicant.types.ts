export interface ApplicantFormData {
  name: string;
  address: string;
  contact_number: string;
  email: string;
  position: string;
  item_number: string;
  office: string;
  is_pwd: boolean;
}

export interface ValidationErrors {
  name?: string;
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
