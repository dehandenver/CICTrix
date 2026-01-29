import type { ApplicantAttachmentInsert, ApplicantInsert } from '../types/database.types';

// Mock database using localStorage
const APPLICANTS_KEY = 'cictrix_applicants';
const ATTACHMENTS_KEY = 'cictrix_attachments';

interface MockApplicant extends ApplicantInsert {
  id: string;
  created_at: string;
  updated_at: string;
}

interface MockAttachment extends ApplicantAttachmentInsert {
  id: string;
  created_at: string;
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

const saveApplicants = (applicants: MockApplicant[]) => {
  localStorage.setItem(APPLICANTS_KEY, JSON.stringify(applicants));
};

const saveAttachments = (attachments: MockAttachment[]) => {
  localStorage.setItem(ATTACHMENTS_KEY, JSON.stringify(attachments));
};

export const mockDatabase = {
  // Applicants
  async insertApplicant(data: ApplicantInsert) {
    const applicants = getApplicants();
    const newApplicant: MockApplicant = {
      ...data,
      id: generateId(),
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
    const applicants = getApplicants();
    return { data: applicants, error: null };
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
};
