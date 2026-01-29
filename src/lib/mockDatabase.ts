import type { ApplicantAttachmentInsert, ApplicantInsert } from '../types/database.types';

// Mock database using localStorage
const APPLICANTS_KEY = 'cictrix_applicants';
const ATTACHMENTS_KEY = 'cictrix_attachments';
const EVALUATIONS_KEY = 'cictrix_evaluations';

interface MockApplicant extends ApplicantInsert {
  id: string;
  created_at: string;
  updated_at: string;
  status?: 'Pending' | 'Reviewed' | 'Accepted' | 'Rejected';
}

interface MockAttachment extends ApplicantAttachmentInsert {
  id: string;
  created_at: string;
}

interface MockEvaluation {
  id: string;
  applicant_id: string;
  interviewer_name: string;
  technical_score: number;
  communication_score: number;
  overall_score: number;
  comments: string;
  recommendation: string;
  created_at: string;
  updated_at: string;
}

const generateId = () => crypto.randomUUID();

const getApplicants = (): MockApplicant[] => {
  const data = localStorage.getItem(APPLICANTS_KEY);
  return data ? JSON.parse(data) : [];
};

const getAttachments = (): MockAttachment[] => {
  const data = localStorage.getItem(ATTACHMENTS_KEY);

  const getEvaluations = (): MockEvaluation[] => {
    const data = localStorage.getItem(EVALUATIONS_KEY);
    return data ? JSON.parse(data) : [];
  };
  return data ? JSON.parse(data) : [];
};

const saveApplicants = (applicants: MockApplicant[]) => {
  localStorage.setItem(APPLICANTS_KEY, JSON.stringify(applicants));
};

const saveAttachments = (attachments: MockAttachment[]) => {
  localStorage.setItem(ATTACHMENTS_KEY, JSON.stringify(attachments));

const saveEvaluations = (evaluations: MockEvaluation[]) => {
  localStorage.setItem(EVALUATIONS_KEY, JSON.stringify(evaluations));
};
};

export const mockDatabase = {
  // Applicants
  async insertApplicant(data: ApplicantInsert) {
    const applicants = getApplicants();
    const newApplicant: MockApplicant = {
      ...data,
      id: generateId(),
        status: data.status || 'Pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    applicants.push(newApplicant);
    saveApplicants(applicants);
    return { data: newApplicant, error: null };
  },

  async getApplicant(id: string) {
    const applicants = getApplicants();
    const applicant = applicants.find((a) => a.id === id);
    return { data: applicant || null, error: applicant ? null : new Error('Not found') };
  },

  async getApplicants() {
    return { data: getApplicants(), error: null };
  },

  async updateApplicant(id: string, updates: Partial<MockApplicant>) {
    const applicants = getApplicants();
    const index = applicants.findIndex((a) => a.id === id);
    if (index === -1) {
      return { data: null, error: new Error('Applicant not found') };
    }
    applicants[index] = {
      ...applicants[index],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    saveApplicants(applicants);
    return { data: applicants[index], error: null };
  },

  // Attachments
  async insertAttachment(data: ApplicantAttachmentInsert) {
    const attachments = getAttachments();
    const newAttachment: MockAttachment = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
    };
    attachments.push(newAttachment);
    saveAttachments(attachments);
    return { data: newAttachment, error: null };
  },

  async getAttachmentsByApplicant(applicantId: string) {
    const attachments = getAttachments();
    const filtered = attachments.filter((a) => a.applicant_id === applicantId);
    return { data: filtered, error: null };
  },

  // Evaluations
  async insertEvaluation(data: Omit<MockEvaluation, 'id' | 'created_at' | 'updated_at'>) {
    const evaluations = getEvaluations();
    const newEvaluation: MockEvaluation = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    evaluations.push(newEvaluation);
    saveEvaluations(evaluations);
    return { data: newEvaluation, error: null };
  },

  async getEvaluationsByApplicant(applicantId: string) {
    const evaluations = getEvaluations();
    const filtered = evaluations.filter((e) => e.applicant_id === applicantId);
    return { data: filtered, error: null };
  },

  // Storage
  async uploadFile(bucketName: string, filePath: string, file: File) {
    // Mock file storage using IndexedDB or just keep reference
    const fileData = {
      bucket: bucketName,
      path: filePath,
      name: file.name,
      size: file.size,
      type: file.type,
      uploadedAt: new Date().toISOString(),
    };
    return { data: fileData, error: null };
  },

  // Mock Supabase query builder API
  from(table: string) {
    return {
      select: (columns: string = '*') => {
        return {
          eq: (column: string, value: any) => {
            return {
              single: async () => {
                if (table === 'applicants') {
                  const applicants = getApplicants();
                  const found = applicants.find(a => (a as any)[column] === value);
                  return found 
                    ? { data: found, error: null }
                    : { data: null, error: new Error('Not found') };
                }
                return { data: null, error: new Error('Table not found') };
              },
              then: async (resolve: any) => {
                if (table === 'applicants') {
                  const applicants = getApplicants();
                  const filtered = applicants.filter(a => (a as any)[column] === value);
                  resolve({ data: filtered, error: null });
                } else if (table === 'applicant_attachments') {
                  const attachments = getAttachments();
                  const filtered = attachments.filter(a => (a as any)[column] === value);
                  resolve({ data: filtered, error: null });
                } else {
                  resolve({ data: [], error: null });
                }
              }
            };
          },
          order: (column: string, options?: { ascending?: boolean }) => {
            return {
              then: async (resolve: any) => {
                if (table === 'applicants') {
                  let applicants = getApplicants();
                  applicants.sort((a, b) => {
                    const aVal = (a as any)[column];
                    const bVal = (b as any)[column];
                    return options?.ascending === false ? (bVal > aVal ? 1 : -1) : (aVal > bVal ? 1 : -1);
                  });
                  resolve({ data: applicants, error: null });
                } else {
                  resolve({ data: [], error: null });
                }
              },
              eq: (filterColumn: string, value: any) => {
                return {
                  then: async (resolve: any) => {
                    if (table === 'applicants') {
                      let applicants = getApplicants();
                      const filtered = applicants.filter(a => (a as any)[filterColumn] === value);
                      filtered.sort((a, b) => {
                        const aVal = (a as any)[column];
                        const bVal = (b as any)[column];
                        return options?.ascending === false ? (bVal > aVal ? 1 : -1) : (aVal > bVal ? 1 : -1);
                      });
                      resolve({ data: filtered, error: null });
                    } else {
                      resolve({ data: [], error: null });
                    }
                  }
                };
              }
            };
          },
          then: async (resolve: any) => {
            if (table === 'applicants') {
              resolve({ data: getApplicants(), error: null });
            } else if (table === 'applicant_attachments') {
              resolve({ data: getAttachments(), error: null });
            } else {
              resolve({ data: [], error: null });
            }
          }
        };
      },
      insert: (data: any) => {
        return {
          then: async (resolve: any) => {
            if (table === 'evaluations') {
              const result = await mockDatabase.insertEvaluation(data);
              resolve(result);
            } else {
              resolve({ data: null, error: new Error('Insert not supported for this table') });
            }
          }
        };
      },
      update: (updates: any) => {
        return {
          eq: (column: string, value: any) => {
            return {
              then: async (resolve: any) => {
                if (table === 'applicants') {
                  const applicants = getApplicants();
                  const index = applicants.findIndex(a => (a as any)[column] === value);
                  if (index !== -1) {
                    applicants[index] = {
                      ...applicants[index],
                      ...updates,
                      updated_at: new Date().toISOString()
                    };
                    saveApplicants(applicants);
                    resolve({ data: applicants[index], error: null });
                  } else {
                    resolve({ data: null, error: new Error('Not found') });
                  }
                } else {
                  resolve({ data: null, error: new Error('Update not supported') });
                }
              }
            };
          }
        };
      }
    };
  },

  storage: {
    from: (bucket: string) => {
      return {
        createSignedUrl: async (path: string, expiresIn: number) => {
          // In mock mode, return the path as-is (data URL)
          return { data: { signedUrl: path }, error: null };
        }
      };
    }
  }
};
