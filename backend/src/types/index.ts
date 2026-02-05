export type UserRoleType = 'ADMIN' | 'PM' | 'RSP' | 'LND' | 'RATER' | 'INTERVIEWER' | 'APPLICANT';

export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRoleType;
}

export interface AuthenticatedRequest {
  user?: TokenPayload;
}

export interface Applicant {
  id: string;
  name: string;
  address: string;
  contact_number: string;
  email: string;
  position: string;
  item_number: string;
  office: string;
  is_pwd: boolean;
  status: 'Pending' | 'Reviewed' | 'Accepted' | 'Rejected';
  created_at: string;
  updated_at: string;
}

export interface Evaluation {
  id: string;
  applicant_id: string;
  evaluator_id: string;
  score: number;
  comments?: string;
  created_at: string;
  updated_at: string;
}

export interface UserRoleRecord {
  id: string;
  user_id: string;
  email: string;
  role: UserRoleType;
  name?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
