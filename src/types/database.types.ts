export interface Database {
  public: {
    Tables: {
      applicants: {
        Row: {
          id: string;
          name: string;
          address: string;
          contact_number: string;
          email: string;
          position: string;
          item_number: string;
          office: string;
          is_pwd: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          address: string;
          contact_number: string;
          email: string;
          position: string;
          item_number: string;
          office: string;
          is_pwd?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          address?: string;
          contact_number?: string;
          email?: string;
          position?: string;
          item_number?: string;
          office?: string;
          is_pwd?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      applicant_attachments: {
        Row: {
          id: string;
          applicant_id: string;
          file_name: string;
          file_path: string;
          file_type: string;
          file_size: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          applicant_id: string;
          file_name: string;
          file_path: string;
          file_type: string;
          file_size: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          applicant_id?: string;
          file_name?: string;
          file_path?: string;
          file_type?: string;
          file_size?: number;
          created_at?: string;
        };
      };
    };
  };
}

export type Applicant = Database['public']['Tables']['applicants']['Row'];
export type ApplicantInsert = Database['public']['Tables']['applicants']['Insert'];
export type ApplicantAttachment = Database['public']['Tables']['applicant_attachments']['Row'];
export type ApplicantAttachmentInsert = Database['public']['Tables']['applicant_attachments']['Insert'];
