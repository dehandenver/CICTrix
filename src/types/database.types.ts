export interface Database {
  public: {
    Tables: {
      applicants: {
        Row: {
          id: string;
          first_name: string;
          middle_name: string | null;
          last_name: string;
          address: string;
          contact_number: string;
          email: string;
          position: string;
          item_number: string;
          office: string;
          is_pwd: boolean;
          status: string;
          created_at: string;
          updated_at: string;
          disqualification_reason: string | null;
          total_score: number | null;
          gender: string | null;
          application_type: string | null;
        };
        Insert: {
          id?: string;
          first_name: string;
          middle_name?: string | null;
          last_name: string;
          address: string;
          contact_number: string;
          email: string;
          position: string;
          item_number: string;
          office: string;
          is_pwd?: boolean;
          status?: string;
          created_at?: string;
          updated_at?: string;
          disqualification_reason?: string | null;
          total_score?: number | null;
          gender?: string | null;
          application_type?: string | null;
        };
        Update: {
          id?: string;
          first_name?: string;
          middle_name?: string | null;
          last_name?: string;
          address?: string;
          contact_number?: string;
          email?: string;
          position?: string;
          item_number?: string;
          office?: string;
          is_pwd?: boolean;
          status?: string;
          created_at?: string;
          updated_at?: string;
          disqualification_reason?: string | null;
          total_score?: number | null;
          gender?: string | null;
          application_type?: string | null;
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
      job_postings: {
        Row: {
          id: string;
          title: string;
          item_number: string | null;
          office: string | null;
          department: string | null;
          status: string;
          created_at: string;
          updated_at: string | null;
          description: string | null;
          requirements: string | null;
          salary_grade: string | null;
          employment_type: string | null;
          number_of_positions: number | null;
          posted_by: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          item_number?: string | null;
          office?: string | null;
          department?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string | null;
          description?: string | null;
          requirements?: string | null;
          salary_grade?: string | null;
          employment_type?: string | null;
          number_of_positions?: number | null;
          posted_by?: string | null;
        };
        Update: {
          id?: string;
          title?: string;
          item_number?: string | null;
          office?: string | null;
          department?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string | null;
          description?: string | null;
          requirements?: string | null;
          salary_grade?: string | null;
          employment_type?: string | null;
          number_of_positions?: number | null;
          posted_by?: string | null;
        };
      };
      jobs: {
        Row: {
          id: string;
          title: string;
          department: string | null;
          status: string;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          department?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          title?: string;
          department?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string | null;
        };
      };
      newly_hired: {
        Row: {
          id: string;
          applicant_id: string | null;
          first_name: string;
          last_name: string;
          email: string;
          position: string;
          department: string | null;
          status: string;
          date_hired: string;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          applicant_id?: string | null;
          first_name: string;
          last_name: string;
          email: string;
          position: string;
          department?: string | null;
          status?: string;
          date_hired: string;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          applicant_id?: string | null;
          first_name?: string;
          last_name?: string;
          email?: string;
          position?: string;
          department?: string | null;
          status?: string;
          date_hired?: string;
          created_at?: string;
          updated_at?: string | null;
        };
      };
      performance_cycles: {
        Row: {
          id: string;
          title: string;
          type: string;
          start_date: string;
          end_date: string;
          submission_deadline: string;
          status: string;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          type: string;
          start_date: string;
          end_date: string;
          submission_deadline: string;
          status?: string;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          title?: string;
          type?: string;
          start_date?: string;
          end_date?: string;
          submission_deadline?: string;
          status?: string;
          created_at?: string;
          updated_at?: string | null;
        };
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          role: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          role?: string;
          created_at?: string;
        };
      };
      raters: {
        Row: {
          id: string;
          employee_id: string;
          rater_id: string;
          rater_type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          employee_id: string;
          rater_id: string;
          rater_type: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          employee_id?: string;
          rater_id?: string;
          rater_type?: string;
          created_at?: string;
        };
      };
      trainings: {
        Row: {
          id: string;
          title: string;
          employee_id: string | null;
          status: string;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          employee_id?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          title?: string;
          employee_id?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string | null;
        };
      };
      evaluations: {
        Row: {
          id: string;
          applicant_id: string;
          interviewer_id: string | null;
          score: number | null;
          status: string;
          notes: string | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          applicant_id: string;
          interviewer_id?: string | null;
          score?: number | null;
          status?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          applicant_id?: string;
          interviewer_id?: string | null;
          score?: number | null;
          status?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
      };
    };
  };
}

export type Applicant = Database['public']['Tables']['applicants']['Row'];
export type ApplicantInsert = Database['public']['Tables']['applicants']['Insert'];
export type ApplicantAttachment = Database['public']['Tables']['applicant_attachments']['Row'];
export type ApplicantAttachmentInsert = Database['public']['Tables']['applicant_attachments']['Insert'];
