import type { ApplicantAttachmentInsert, ApplicantInsert } from '../types/database.types';

// Mock database using localStorage
const APPLICANTS_KEY = 'cictrix_applicants';
const ATTACHMENTS_KEY = 'cictrix_attachments';
const EVALUATIONS_KEY = 'cictrix_evaluations';
const JOBS_KEY = 'cictrix_jobs';
const RATERS_KEY = 'cictrix_raters';

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

interface MockJob {
  id: number;
  title: string;
  item_number: string;
  salary_grade: string;
  department: string;
  description: string;
  status: 'Open' | 'Closed' | 'On Hold';
  created_at: string;
  updated_at: string;
}

interface MockRater {
  id: number;
  name: string;
  email: string;
  department: string;
  is_active: boolean;
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

const getJobs = (): MockJob[] => {
  const data = localStorage.getItem(JOBS_KEY);
  return data ? JSON.parse(data) : [];
};

const getRaters = (): MockRater[] => {
  const data = localStorage.getItem(RATERS_KEY);
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

const saveJobs = (jobs: MockJob[]) => {
  localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
};

const saveRaters = (raters: MockRater[]) => {
  localStorage.setItem(RATERS_KEY, JSON.stringify(raters));
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
      select: (columns: string = '*', options?: { count?: string; head?: boolean }) => {
        // Handle count-only queries
        if (options?.count === 'exact' && options?.head) {
          return {
            eq: (column: string, value: any) => {
              return {
                then: async (resolve: any) => {
                  let count = 0;
                  if (table === 'applicants') {
                    const applicants = getApplicants();
                    count = applicants.filter(a => (a as any)[column] === value).length;
                  } else if (table === 'jobs') {
                    const jobs = getJobs();
                    count = jobs.filter(j => (j as any)[column] === value).length;
                  } else if (table === 'raters') {
                    const raters = getRaters();
                    count = raters.filter(r => (r as any)[column] === value).length;
                  }
                  resolve({ data: null, error: null, count });
                }
              };
            },
            then: async (resolve: any) => {
              let count = 0;
              if (table === 'applicants') count = getApplicants().length;
              else if (table === 'jobs') count = getJobs().length;
              else if (table === 'raters') count = getRaters().length;
              resolve({ data: null, error: null, count });
            }
          };
        }

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
                } else if (table === 'jobs') {
                  const jobs = getJobs();
                  const found = jobs.find(j => (j as any)[column] === value);
                  return found 
                    ? { data: found, error: null }
                    : { data: null, error: new Error('Not found') };
                } else if (table === 'raters') {
                  const raters = getRaters();
                  const found = raters.find(r => (r as any)[column] === value);
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
                } else if (table === 'jobs') {
                  const jobs = getJobs();
                  const filtered = jobs.filter(j => (j as any)[column] === value);
                  resolve({ data: filtered, error: null });
                } else if (table === 'raters') {
                  const raters = getRaters();
                  const filtered = raters.filter(r => (r as any)[column] === value);
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
                let data: any[] = [];
                if (table === 'applicants') data = getApplicants();
                else if (table === 'jobs') data = getJobs();
                else if (table === 'raters') data = getRaters();
                
                data.sort((a, b) => {
                  const aVal = (a as any)[column];
                  const bVal = (b as any)[column];
                  return options?.ascending === false ? (bVal > aVal ? 1 : -1) : (aVal > bVal ? 1 : -1);
                });
                resolve({ data, error: null });
              },
              eq: (filterColumn: string, value: any) => {
                return {
                  then: async (resolve: any) => {
                    let data: any[] = [];
                    if (table === 'applicants') data = getApplicants();
                    else if (table === 'jobs') data = getJobs();
                    else if (table === 'raters') data = getRaters();
                    
                    const filtered = data.filter(item => (item as any)[filterColumn] === value);
                    filtered.sort((a, b) => {
                      const aVal = (a as any)[column];
                      const bVal = (b as any)[column];
                      return options?.ascending === false ? (bVal > aVal ? 1 : -1) : (aVal > bVal ? 1 : -1);
                    });
                    resolve({ data: filtered, error: null });
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
            } else if (table === 'jobs') {
              resolve({ data: getJobs(), error: null });
            } else if (table === 'raters') {
              resolve({ data: getRaters(), error: null });
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
            } else if (table === 'jobs') {
              const jobs = getJobs();
              const newJob: MockJob = {
                ...data,
                id: jobs.length > 0 ? Math.max(...jobs.map(j => j.id)) + 1 : 1,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              };
              jobs.push(newJob);
              saveJobs(jobs);
              resolve({ data: newJob, error: null });
            } else if (table === 'raters') {
              const raters = getRaters();
              // Check for duplicate email
              if (raters.some(r => r.email === data.email)) {
                resolve({ data: null, error: { code: '23505', message: 'Duplicate email' } });
                return;
              }
              const newRater: MockRater = {
                ...data,
                id: raters.length > 0 ? Math.max(...raters.map(r => r.id)) + 1 : 1,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              };
              raters.push(newRater);
              saveRaters(raters);
              resolve({ data: newRater, error: null });
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
                } else if (table === 'jobs') {
                  const jobs = getJobs();
                  const index = jobs.findIndex(j => (j as any)[column] === value);
                  if (index !== -1) {
                    jobs[index] = {
                      ...jobs[index],
                      ...updates,
                      updated_at: new Date().toISOString()
                    };
                    saveJobs(jobs);
                    resolve({ data: jobs[index], error: null });
                  } else {
                    resolve({ data: null, error: new Error('Not found') });
                  }
                } else if (table === 'raters') {
                  const raters = getRaters();
                  const index = raters.findIndex(r => (r as any)[column] === value);
                  if (index !== -1) {
                    raters[index] = {
                      ...raters[index],
                      ...updates,
                      updated_at: new Date().toISOString()
                    };
                    saveRaters(raters);
                    resolve({ data: raters[index], error: null });
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
      },
      delete: () => {
        return {
          eq: (column: string, value: any) => {
            return {
              then: async (resolve: any) => {
                if (table === 'jobs') {
                  const jobs = getJobs();
                  const filtered = jobs.filter(j => (j as any)[column] !== value);
                  saveJobs(filtered);
                  resolve({ data: null, error: null });
                } else if (table === 'raters') {
                  const raters = getRaters();
                  const filtered = raters.filter(r => (r as any)[column] !== value);
                  saveRaters(filtered);
                  resolve({ data: null, error: null });
                } else {
                  resolve({ data: null, error: new Error('Delete not supported') });
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
