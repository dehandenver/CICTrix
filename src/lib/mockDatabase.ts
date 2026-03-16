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
  // RSP-entered fields
  technical_score?: number;
  communication_score?: number;
  overall_score?: number;
  comments?: string;
  // Interviewer-entered oral interview fields
  communication_skills_score?: number;
  confidence_score?: number;
  comprehension_score?: number;
  personality_score?: number;
  job_knowledge_score?: number;
  overall_impression_score?: number;
  communication_skills_remarks?: string;
  confidence_remarks?: string;
  comprehension_remarks?: string;
  personality_remarks?: string;
  job_knowledge_remarks?: string;
  overall_impression_remarks?: string;
  interview_notes?: string;
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
  return data ? JSON.parse(data) : [];
};

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

const compactAttachmentPaths = (attachments: MockAttachment[]): MockAttachment[] => {
  return attachments.map((attachment, index) => {
    const filePath = typeof attachment.file_path === 'string' ? attachment.file_path : '';
    if (filePath.startsWith('data:')) {
      return {
        ...attachment,
        file_path: `mock://attachment/${attachment.id || index}`,
      };
    }
    return attachment;
  });
};

const saveApplicants = (applicants: MockApplicant[]) => {
  localStorage.setItem(APPLICANTS_KEY, JSON.stringify(applicants));
};

const saveAttachments = (attachments: MockAttachment[]) => {
  const compacted = compactAttachmentPaths(attachments);

  try {
    localStorage.setItem(ATTACHMENTS_KEY, JSON.stringify(compacted));
    return;
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'QuotaExceededError') {
      throw error;
    }
  }

  const trimmed = [...compacted];
  while (trimmed.length > 0) {
    trimmed.shift();
    try {
      localStorage.setItem(ATTACHMENTS_KEY, JSON.stringify(trimmed));
      return;
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== 'QuotaExceededError') {
        throw error;
      }
    }
  }

  localStorage.setItem(ATTACHMENTS_KEY, JSON.stringify([]));
};

const saveEvaluations = (evaluations: MockEvaluation[]) => {
  localStorage.setItem(EVALUATIONS_KEY, JSON.stringify(evaluations));
};

const saveJobs = (jobs: MockJob[]) => {
  localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
};

const saveRaters = (raters: MockRater[]) => {
  localStorage.setItem(RATERS_KEY, JSON.stringify(raters));
};

export const mockDatabase = {
  // Applicants
  async insertApplicant(data: ApplicantInsert) {
    const applicants = getApplicants();
    const newApplicant: MockApplicant = {
      ...data,
      id: generateId(),
      status: 'Pending',
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
  async insertEvaluation(data: Record<string, any>) {
    const evaluations = getEvaluations();
    const newEvaluation = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    evaluations.push(newEvaluation);
    saveEvaluations(evaluations as MockEvaluation[]);
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
      select: (_columns: string = '*', options?: { count?: string; head?: boolean }) => {
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
                } else if (table === 'evaluations') {
                  const evaluations = getEvaluations();
                  const filtered = evaluations.filter(e => (e as any)[column] === value);
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
                },
                order: (orderColumn: string, orderOptions?: { ascending?: boolean }) => {
                  const getFiltered = () => {
                    if (table === 'evaluations') {
                      return getEvaluations().filter(e => (e as any)[column] === value);
                    }
                    if (table === 'applicants') return getApplicants().filter(a => (a as any)[column] === value);
                    if (table === 'applicant_attachments') return getAttachments().filter(a => (a as any)[column] === value);
                    return [];
                  };
                  const getSorted = () => {
                    const arr = getFiltered();
                    return arr.sort((a, b) => {
                      const av = (a as any)[orderColumn];
                      const bv = (b as any)[orderColumn];
                      return orderOptions?.ascending === false ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
                    });
                  };
                  return {
                    limit: (n: number) => ({
                      maybeSingle: async () => {
                        const sorted = getSorted();
                        return { data: sorted[0] ?? null, error: null };
                      },
                      single: async () => {
                        const sorted = getSorted();
                        return sorted[0]
                          ? { data: sorted[0], error: null }
                          : { data: null, error: new Error('Not found') };
                      },
                      then: async (resolve: any) => resolve({ data: getSorted().slice(0, n), error: null }),
                    }),
                    maybeSingle: async () => {
                      const sorted = getSorted();
                      return { data: sorted[0] ?? null, error: null };
                    },
                    then: async (resolve: any) => resolve({ data: getSorted(), error: null }),
                  };
                },
            };
          },
          in: (column: string, values: any[]) => {
            const valuesSet = new Set(Array.isArray(values) ? values : []);
            const getFiltered = () => {
              let data: any[] = [];
              if (table === 'applicants') data = getApplicants();
              else if (table === 'evaluations') data = getEvaluations();
              else if (table === 'applicant_attachments') data = getAttachments();
              else if (table === 'jobs') data = getJobs();
              else if (table === 'raters') data = getRaters();
              return data.filter((item) => valuesSet.has((item as any)[column]));
            };

            return {
              order: (orderColumn: string, orderOptions?: { ascending?: boolean }) => {
                const getSorted = () => {
                  const arr = getFiltered();
                  return arr.sort((a, b) => {
                    const av = (a as any)[orderColumn];
                    const bv = (b as any)[orderColumn];
                    return orderOptions?.ascending === false ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
                  });
                };

                return {
                  limit: (n: number) => ({
                    then: async (resolve: any) => resolve({ data: getSorted().slice(0, n), error: null }),
                  }),
                  then: async (resolve: any) => resolve({ data: getSorted(), error: null }),
                };
              },
              then: async (resolve: any) => resolve({ data: getFiltered(), error: null }),
            };
          },
          order: (column: string, options?: { ascending?: boolean }) => {
            return {
              then: async (resolve: any) => {
                let data: any[] = [];
                if (table === 'applicants') data = getApplicants();
                else if (table === 'evaluations') data = getEvaluations();
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
                    else if (table === 'evaluations') data = getEvaluations();
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
            } else if (table === 'evaluations') {
              resolve({ data: getEvaluations(), error: null });
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
    from: (_bucket: string) => {
      return {
        createSignedUrl: async (path: string, _expiresIn: number) => {
          // In mock mode, return the path as-is (data URL)
          return { data: { signedUrl: path }, error: null };
        }
      };
    }
  }
};
