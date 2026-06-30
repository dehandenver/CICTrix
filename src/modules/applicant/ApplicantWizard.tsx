import {
    BadgeCheck,
    CheckCircle2,
    CircleCheck,
    Eye,
    EyeOff,
    FileText,
    ShieldCheck,
    UserPlus,
    Users,
    Briefcase,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import abyanLogo from '../../assets/abyan-logo.png';
import { Button, Dialog } from '../../components';
import { POSITION_TO_DEPARTMENT_MAP } from '../../constants/positions';
import {
    type EmployeePortalAccount,
    findEmployeePortalAccount,
    getEmployeePortalAccounts,
} from '../../lib/employeePortalData';
import { getEmployeeRecordsFromSupabase, syncApplicantSubmissionToRecruitment, getAuthoritativeJobPostings, loadJobPostings } from '../../lib/recruitmentData';
import { ATTACHMENTS_BUCKET, supabase } from '../../lib/supabase';
import '../../styles/wizard.css';
import type { ApplicantFormData, UploadedFile, ValidationErrors } from '../../types/applicant.types';
import type { JobPosting } from '../../types/recruitment.types';
import { validateApplicantForm, validateFiles } from '../../utils/validation';
import { logErrorForAdmin } from '../../utils/errorLogger';
import { ApplicantAssessmentForm } from './ApplicantAssessmentForm';
import { AttachmentsUploadForm, REQUIRED_DOCUMENTS } from './AttachmentsUploadForm';

const ATTACHMENT_PREVIEW_CACHE_KEY = 'cictrix_attachment_previews';
const APPOINTMENT_TYPE_STORAGE_KEY = 'cictrix_rsp_score_setup';

// Per-tab wizard state. Survives a page refresh but clears when the tab is
// closed — UI state only, not a data layer. `files` are not persisted (File
// objects aren't serializable); after refresh the user re-uploads on step 2.
const WIZARD_STATE_KEY = 'cictrix_wizard_state';

interface PersistedWizardState {
  entryMode?: 'landing' | 'wizard';
  applicationType?: 'job' | 'promotion';
  currentStep?: 1 | 2 | 3;
  formData?: ApplicantFormData;
  authenticatedEmployeeAccount?: EmployeePortalAccount | null;
}

const loadWizardState = (): PersistedWizardState => {
  try {
    const raw = sessionStorage.getItem(WIZARD_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as PersistedWizardState) : {};
  } catch {
    return {};
  }
};

const saveWizardState = (state: PersistedWizardState): void => {
  try {
    sessionStorage.setItem(WIZARD_STATE_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage may be unavailable (private mode); not fatal.
  }
};

const clearWizardState = (): void => {
  try {
    sessionStorage.removeItem(WIZARD_STATE_KEY);
  } catch {
    // ignore
  }
};
const MAX_PREVIEWABLE_FILE_BYTES = 10 * 1024 * 1024;

type CachedPreviewFile = {
  applicantId: string;
  documentType: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  createdAt: string;
};

type SyncedAttachment = {
  name: string;
  type: string;
  size: number;
  documentType?: string;
  filePath: string;
};

const INITIAL_FORM_DATA: ApplicantFormData = {
  first_name: '',
  middle_name: '',
  last_name: '',
  gender: '',
  address: '',
  contact_number: '',
  email: '',
  position: '',
  item_number: '',
  office: '',
  is_pwd: false,
  application_type: 'job',
  employee_id: '',
  current_position: '',
  current_department: '',
  current_division: '',
  employee_username: '',
  education_attainment: '',
  education_degree: '',
  education_school: '',
  work_experience_years: '',
  work_experience_months: '',
  relevant_experience_position: '',
  relevant_experience_company: '',
  relevant_experience_duties: '',
  gov_id_type: '',
  gov_id_expiration: '',
};

const buildApplicantItemNumber = (): string => {
  const year = new Date().getFullYear();
  // Random 7-char alphanumeric suffix — avoids collision with plantilla item numbers
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 7; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `APP-${year}-${suffix}`;
};

const normalizeAuthValue = (value: string) => String(value ?? '').trim().toLowerCase();

const saveApplicantAppointmentType = (applicantId: string, applicationType: 'job' | 'promotion') => {
  try {
    const raw = localStorage.getItem(APPOINTMENT_TYPE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, 'original' | 'promotional'>) : {};
    parsed[applicantId] = applicationType === 'promotion' ? 'promotional' : 'original';
    localStorage.setItem(APPOINTMENT_TYPE_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Best effort cache only.
  }
};

export const ApplicantWizard: React.FC = () => {
  // Hydrate from sessionStorage so a refresh keeps the user on the same step
  // with the same form values, instead of bouncing back to the landing page.
  const persisted = (() => {
    try { return loadWizardState(); } catch { return {} as PersistedWizardState; }
  })();

  const [entryMode, setEntryMode] = useState<'landing' | 'wizard'>(persisted.entryMode ?? 'landing');
  const [applicationType, setApplicationType] = useState<'job' | 'promotion'>(persisted.applicationType ?? 'job');
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(persisted.currentStep ?? 1);
  const [formData, setFormData] = useState<ApplicantFormData>(persisted.formData ?? INITIAL_FORM_DATA);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [fileError, setFileError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [submissionReference, setSubmissionReference] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [showEmployeeAuth, setShowEmployeeAuth] = useState(false);
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [employeePassword, setEmployeePassword] = useState('');
  const [showEmployeePassword, setShowEmployeePassword] = useState(false);
  const [employeeAuthError, setEmployeeAuthError] = useState('');
  const [authenticatedEmployeeAccount, setAuthenticatedEmployeeAccount] = useState<EmployeePortalAccount | null>(
    persisted.authenticatedEmployeeAccount ?? null,
  );
  const [activeJobs, setActiveJobs] = useState<JobPosting[]>([]);
  const [isLockedPosition, setIsLockedPosition] = useState(false);
  const isGeneratingItemNumberRef = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();
  const landingJobAppliedRef = useRef(false);
  const [prefilledFromLanding, setPrefilledFromLanding] = useState(false);

  // Persist the wizard state whenever the user advances or edits.
  useEffect(() => {
    saveWizardState({
      entryMode,
      applicationType,
      currentStep,
      formData,
      authenticatedEmployeeAccount,
    });
  }, [entryMode, applicationType, currentStep, formData, authenticatedEmployeeAccount]);

  useEffect(() => {
    const state = location.state as { landingJob?: { title: string; itemNumber: string; department: string } } | null;
    const landingJob = state?.landingJob;
    const searchParams = new URLSearchParams(location.search);
    const positionFromQuery = searchParams.get('position') || undefined;
    const itemNumberFromQuery = searchParams.get('itemNumber') || undefined;
    const officeFromQuery = searchParams.get('office') || undefined;

    // If the applicant has already started filling the wizard in this tab
    // (sessionStorage has formData with any user input), we must NOT reset
    // their work just because location.state.landingJob or the URL params
    // are still present after a page refresh. Lock the position fields and
    // keep their existing input.
    const hasInProgressFormData = Boolean(
      formData.first_name ||
      formData.last_name ||
      formData.middle_name ||
      formData.email ||
      formData.contact_number ||
      formData.address ||
      formData.work_experience_years ||
      formData.relevant_experience_position ||
      formData.relevant_experience_company ||
      formData.relevant_experience_duties ||
      formData.education_attainment
    );

    if (landingJob && !landingJobAppliedRef.current) {
      landingJobAppliedRef.current = true;
      setPrefilledFromLanding(true);
      setEntryMode('wizard');
      setIsLockedPosition(true);
      setSubmitError('');

      if (hasInProgressFormData) {
        // Preserve everything the applicant has already filled in; only make
        // sure the position/office/item match the landing job they clicked.
        setFormData((prev) => ({
          ...prev,
          application_type: 'job',
          position: landingJob.title,
          office: landingJob.department,
        }));
        return;
      }

      setApplicationType('job');
      setCurrentStep(1);
      setAuthenticatedEmployeeAccount(null);
      setFormData({
        ...INITIAL_FORM_DATA,
        application_type: 'job',
        position: landingJob.title,
        office: landingJob.department,
      });
      setFiles([]);
      return;
    }

    if ((positionFromQuery || itemNumberFromQuery) && !landingJobAppliedRef.current) {
      landingJobAppliedRef.current = true;
      setPrefilledFromLanding(true);
      setEntryMode('wizard');
      setIsLockedPosition(true);
      setSubmitError('');

      if (hasInProgressFormData) {
        setFormData((prev) => ({
          ...prev,
          application_type: 'job',
          position: positionFromQuery || prev.position,
          office: officeFromQuery || POSITION_TO_DEPARTMENT_MAP[positionFromQuery || ''] || prev.office,
        }));
        return;
      }

      setApplicationType('job');
      setCurrentStep(1);
      setAuthenticatedEmployeeAccount(null);
      setFormData({
        ...INITIAL_FORM_DATA,
        application_type: 'job',
        position: positionFromQuery || '',
        office: officeFromQuery || POSITION_TO_DEPARTMENT_MAP[positionFromQuery || ''] || '',
      });
      setFiles([]);
    }
  }, [location.state, location.search]);

  const handleFormChange = (field: keyof ApplicantFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof ValidationErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleFilesChange = (newFiles: UploadedFile[]) => {
    setFiles(newFiles);
    setFileError('');
  };

  const handleNext = () => {
    const validationErrors = validateApplicantForm(formData, 1);

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setSubmitError('Please complete all required fields before proceeding.');
      logErrorForAdmin('Validation error on step 1 of Applicant Wizard', validationErrors, 'Form Validation');
      return;
    }

    setErrors({});
    setSubmitError('');
    setCurrentStep(2);
  };

const handleNextToReview = () => {
    const fileValidationError = validateFiles(files.map((f) => f.file), files, applicationType);
    if (fileValidationError) {
      setFileError(fileValidationError);
      return;
    }
    setFileError('');
    setCurrentStep(3);
  };

  const handleBack = () => {
    if (currentStep === 3) {
      setCurrentStep(2);
      return;
    }

    setCurrentStep(1);
  };

  const uploadFiles = async (client: any, applicantId: string): Promise<SyncedAttachment[]> => {
    const persisted: SyncedAttachment[] = [];

    for (const uploadedFile of files) {
      const generatedPath = `${applicantId}/${Date.now()}-${uploadedFile.file.name}`;
      const storageBucket = client?.storage?.from?.(ATTACHMENTS_BUCKET);
      const hasUpload = typeof storageBucket?.upload === 'function';

      // Supabase is required for file storage
      if (!hasUpload) {
        logErrorForAdmin('Supabase storage client upload function not found', null, 'File Upload');
        throw new Error('File upload failed. Please check your internet connection and try again.');
      }

      let filePath = generatedPath;
      try {
        const uploadResult = await storageBucket.upload(generatedPath, uploadedFile.file);
        const uploadError = (uploadResult as any).error;
        if (uploadError) {
          throw new Error(String(uploadError));
        }
      } catch (error) {
        logErrorForAdmin(`Failed to upload ${uploadedFile.file.name} to storage bucket`, error, 'File Upload');
        throw new Error('File upload failed. Please check your internet connection and try again.');
      }

      const attachmentPayload = {
        applicant_id: applicantId,
        file_name: uploadedFile.file.name,
        file_path: filePath,
        file_type: uploadedFile.file.type,
        file_size: uploadedFile.file.size,
        document_type: (uploadedFile as any).documentType || 'other',
      };

      try {
        const insertResult = typeof client?.insertAttachment === 'function'
          ? await client.insertAttachment(attachmentPayload)
          : await client.from('applicant_attachments').insert(attachmentPayload);

        const insertError = (insertResult as any).error;
        if (insertError) {
          throw new Error(String(insertError));
        }
      } catch (error) {
        logErrorForAdmin(`Failed to insert attachment metadata for ${uploadedFile.file.name} to DB`, error, 'File Upload');
        throw new Error('File upload failed. Please check your internet connection and try again.');
      }

      persisted.push({
        name: uploadedFile.file.name,
        type: uploadedFile.file.type,
        size: uploadedFile.file.size,
        documentType: (uploadedFile as any).documentType,
        filePath,
      });
    }

    return persisted;
  };

  const toDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Failed to read file for preview cache'));
      reader.readAsDataURL(file);
    });

  const cachePreviewableFiles = async (applicantId: string) => {
    const previewable = files.filter((entry) => entry.file.size <= MAX_PREVIEWABLE_FILE_BYTES);
    if (previewable.length === 0) return;

    const cacheRows: CachedPreviewFile[] = await Promise.all(
      previewable.map(async (entry) => ({
        applicantId,
        documentType: String((entry as any).documentType ?? 'other'),
        fileName: entry.file.name,
        mimeType: entry.file.type,
        dataUrl: await toDataUrl(entry.file),
        createdAt: new Date().toISOString(),
      }))
    );

    try {
      const existing = (() => {
        try {
          return JSON.parse(localStorage.getItem(ATTACHMENT_PREVIEW_CACHE_KEY) ?? '[]') as CachedPreviewFile[];
        } catch {
          return [];
        }
      })();

      const incomingKeys = new Set(cacheRows.map((row) => `${row.applicantId}:${row.documentType}`));
      const next = [
        ...existing.filter((row) => !incomingKeys.has(`${row.applicantId}:${row.documentType}`)),
        ...cacheRows,
      ];
      localStorage.setItem(ATTACHMENT_PREVIEW_CACHE_KEY, JSON.stringify(next));
    } catch {
      // Best effort cache only.
    }
  };

  const submitWithClient = async (): Promise<string> => {
    // Generate a unique random application tracking code.
    // Use the one already shown in the form if set, otherwise generate fresh.
    const itemNumber = formData.item_number || buildApplicantItemNumber();
    const safe = (val: string | null | undefined) => (val == null ? '' : String(val));

    const experienceYears = parseInt(formData.work_experience_years || '0', 10) || 0;
    const experienceMonths = parseInt(formData.work_experience_months || '0', 10) || 0;
    const totalExperienceYears = +(experienceYears + experienceMonths / 12).toFixed(2);

    const applicantPayload: Record<string, any> = {
      first_name: formData.first_name.trim(),
      middle_name: safe(formData.middle_name).trim() || null,
      last_name: formData.last_name.trim(),
      gender: safe(formData.gender) || null,
      address: safe(formData.address).trim(),
      contact_number: safe(formData.contact_number).trim(),
      email: formData.email.trim().toLowerCase(),
      position: safe(formData.position).trim(),
      item_number: itemNumber,
      office: safe(POSITION_TO_DEPARTMENT_MAP[formData.position] || formData.office).trim(),
      is_pwd: formData.is_pwd,
      application_type: applicationType,
      status: 'New Application',
      years_of_experience: totalExperienceYears > 0 ? totalExperienceYears : null,
    };

    if (applicationType === 'promotion') {
      if (formData.employee_id) applicantPayload.employee_id = formData.employee_id;
      if (formData.current_position) applicantPayload.current_position = formData.current_position;
      if (formData.current_department) applicantPayload.current_department = formData.current_department;
      if (formData.current_division) applicantPayload.current_division = formData.current_division;
      if (formData.employee_username) applicantPayload.employee_username = formData.employee_username;
    }

    let applicantData;
    try {
      const { data, error } = await (supabase as any)
        .from('applicants')
        .insert(applicantPayload)
        .select('id, item_number')
        .single();

      if (error || !data?.id) {
        throw error || new Error('Empty ID returned from database');
      }
      applicantData = data;
    } catch (dbErr: any) {
      logErrorForAdmin('Database insertion error during applicant record creation', dbErr, 'Database Submission');

      // Classify the failure so the applicant sees a useful message rather
      // than the generic "server unavailable" string — and so HR can tell at
      // a glance what to fix.
      const rawMessage = String(dbErr?.message ?? dbErr ?? '');
      const code = String(dbErr?.code ?? '');
      const lower = rawMessage.toLowerCase();

      let userMessage: string;
      if (code === '23505' || lower.includes('duplicate')) {
        userMessage = 'An application with this email or item number already exists. Please check your previous submission.';
      } else if (code === '23502' || lower.includes('null value') || lower.includes('not-null')) {
        userMessage = 'A required field is missing. Please go back and review the form.';
      } else if (
        code === '42703' ||
        code === 'PGRST204' ||
        lower.includes("could not find the") ||
        lower.includes('column') && lower.includes('does not exist')
      ) {
        userMessage = `Your application form is newer than the database schema. Please contact HR. (Schema: ${rawMessage.slice(0, 140)})`;
      } else if (code === '42501' || lower.includes('row-level security') || lower.includes('permission denied')) {
        userMessage = 'Permission denied by database security policies. Please contact HR. (RLS)';
      } else if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
        userMessage = 'Network connection lost. Please check your internet and try again.';
      } else {
        userMessage = `Submission failed: ${rawMessage.slice(0, 200)} — please try again, or contact HR if this keeps happening.`;
      }

      throw new Error(userMessage);
    }

    saveApplicantAppointmentType(applicantData.id, applicationType);

    const syncedAttachments = await uploadFiles(supabase, applicantData.id);
    await cachePreviewableFiles(applicantData.id);

    syncApplicantSubmissionToRecruitment({
      applicantId: applicantData.id,
      firstName: formData.first_name,
      middleName: formData.middle_name,
      lastName: formData.last_name,
      email: formData.email,
      phone: formData.contact_number,
      address: formData.address,
      position: formData.position,
      department: POSITION_TO_DEPARTMENT_MAP[formData.position] || formData.office,
      isPwd: formData.is_pwd,
      applicationType,
      internalApplication: applicationType === 'promotion' && formData.employee_id
        ? {
            employeeId: formData.employee_id,
            currentPosition: formData.current_position,
            currentDepartment: formData.current_department,
            currentDivision: formData.current_division,
            employeeUsername: formData.employee_username,
          }
        : undefined,
      submittedAt: new Date().toISOString(),
      attachments: syncedAttachments,
      educationAttainment: formData.education_attainment || undefined,
      educationDegree: formData.education_degree || undefined,
      educationSchool: formData.education_school || undefined,
      workExperienceYears: (() => {
        const years = parseInt(formData.work_experience_years || '0', 10) || 0;
        const months = parseInt(formData.work_experience_months || '0', 10) || 0;
        const total = years + months / 12;
        return total > 0 ? Math.round(total * 100) / 100 : undefined;
      })(),
    });

    return applicantData.item_number || itemNumber;
  };

  const completeSuccess = (itemNumber: string) => {
    setSubmissionReference(itemNumber);
    setShowSuccessDialog(true);
    setFormData(INITIAL_FORM_DATA);
    setFiles([]);
    setCurrentStep(1);
    setEntryMode('landing');
    setApplicationType('job');
    setAuthenticatedEmployeeAccount(null);
    setEmployeeNumber('');
    setEmployeePassword('');
    setShowEmployeePassword(false);
    setEmployeeAuthError('');
    // Wipe the per-tab wizard cache so a brand-new application starts fresh
    // (refresh after submit should not resume the just-submitted form).
    clearWizardState();
  };

  const handleSubmit = async () => {
    const fileValidationError = validateFiles(files.map((f) => f.file), files, applicationType);
    if (fileValidationError) {
      setFileError(fileValidationError);
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const itemNumber = await submitWithClient();
      completeSuccess(itemNumber);
    } catch (error) {
      console.error('Submission error:', error);

      setSubmitError(
        error instanceof Error
          ? error.message
          : 'An error occurred while submitting your application. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseSuccessDialog = () => {
    setShowSuccessDialog(false);
    navigate('/');
  };

  const handleStartJobApplication = (job?: JobPosting) => {
    setApplicationType('job');
    setAuthenticatedEmployeeAccount(null);
    if (job) {
      setFormData({
        ...INITIAL_FORM_DATA,
        application_type: 'job',
        position: job.title,
        office: job.department || job.division || '',
        item_number: job.jobCode || '',
      });
      setIsLockedPosition(true);
    } else {
      setFormData({ ...INITIAL_FORM_DATA, application_type: 'job' });
      setIsLockedPosition(false);
    }
    setFiles([]);
    setEntryMode('wizard');
    setCurrentStep(1);
    setSubmitError('');
  };

  const handleOpenEmployeeAuth = () => {
    setEmployeeAuthError('');
    setShowEmployeeAuth(true);
  };

  const handleCloseEmployeeAuth = () => {
    setShowEmployeeAuth(false);
    setEmployeeNumber('');
    setEmployeePassword('');
    setShowEmployeePassword(false);
    setEmployeeAuthError('');
  };

  const handleEmployeeAuthSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const enteredIdentifier = employeeNumber.trim();
    const enteredPassword = employeePassword;

    if (!enteredIdentifier || !enteredPassword.trim()) {
      setEmployeeAuthError('Please enter your employee number and password.');
      return;
    }

    const matchedByUsername = findEmployeePortalAccount(enteredIdentifier, enteredPassword);
    const matchedByEmployeeId = getEmployeePortalAccounts().find((account) => {
      const accountEmployeeId = normalizeAuthValue(String(account?.employee?.employeeId ?? ''));
      return accountEmployeeId === normalizeAuthValue(enteredIdentifier) && account.password === enteredPassword;
    });

    if (!matchedByUsername && !matchedByEmployeeId) {
      setEmployeeAuthError('Invalid employee credentials. Use your Employee Portal account credentials.');
      return;
    }

    const matchedAccount = matchedByUsername || matchedByEmployeeId;
    if (!matchedAccount) {
      setEmployeeAuthError('Unable to resolve the employee account for this promotional application.');
      return;
    }

    // Look up the employee in Supabase (source of truth) to get the most
    // up-to-date position/department, falling back to the portal account's
    // cached fields if no row exists yet.
    const employeeRecord = (await getEmployeeRecordsFromSupabase()).find(
      (record) => String(record.employeeId ?? '').trim() === String(matchedAccount?.employee?.employeeId ?? '').trim()
    );
    const [firstName, ...remainingParts] = String(matchedAccount?.employee?.fullName ?? '').trim().split(/\s+/);
    const lastName = remainingParts.length > 0 ? remainingParts[remainingParts.length - 1] : '';
    const middleName = remainingParts.length > 1 ? remainingParts.slice(0, -1).join(' ') : '';
    const currentDepartment = employeeRecord?.department || matchedAccount?.employee?.currentDepartment || '';
    const currentDivision = employeeRecord?.division || matchedAccount?.employee?.currentDivision || '';
    const currentPosition = employeeRecord?.position || matchedAccount?.employee?.currentPosition || '';

    setAuthenticatedEmployeeAccount(matchedAccount);
    setApplicationType('promotion');
    setEntryMode('wizard');
    setCurrentStep(1);
    setFiles([]);
    setFormData({
      ...INITIAL_FORM_DATA,
      application_type: 'promotion',
      first_name: firstName || '',
      middle_name: middleName,
      last_name: lastName,
      gender: matchedAccount?.employee?.gender === 'Prefer not to say' ? '' : String(matchedAccount?.employee?.gender ?? ''),
      address: matchedAccount?.employee?.homeAddress || '',
      contact_number: matchedAccount?.employee?.mobileNumber || '',
      email: matchedAccount?.employee?.email || '',
      employee_id: matchedAccount?.employee?.employeeId || '',
      current_position: currentPosition,
      current_department: currentDepartment,
      current_division: currentDivision,
      employee_username: matchedAccount?.username || '',
      office: currentDepartment,
    });
    setSubmitError('');
    setShowEmployeeAuth(false);
    setEmployeeAuthError('');
  };

  const reviewedFiles = useMemo(() => {
    if (applicationType === 'promotion') {
      return files.map((entry) => ({
        key: entry.id,
        fileName: entry.file.name,
        fileSize: entry.file.size,
      }));
    }

    return REQUIRED_DOCUMENTS.map((doc) => {
      const uploaded = (files as Array<UploadedFile & { documentType?: string }>).find(
        (entry) => entry.documentType === doc.type
      );

      return {
        key: doc.type,
        fileName: uploaded?.file.name,
        fileSize: uploaded?.file.size,
      };
    }).filter((entry) => Boolean(entry.fileName));
  }, [applicationType, files]);

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const hasStartedAssessment = useMemo(() => {
    const fields = [
      formData.first_name,
      formData.middle_name,
      formData.last_name,
      formData.gender,
      formData.address,
      formData.contact_number,
      formData.email,
      formData.position,
      formData.office,
    ];

    return fields.some((value) => value.trim().length > 0) || Boolean(formData.is_pwd);
  }, [formData]);

  useEffect(() => {
    if (entryMode !== 'wizard' || currentStep !== 1 || !hasStartedAssessment || formData.item_number) {
      return;
    }
    if (isGeneratingItemNumberRef.current) return;
    isGeneratingItemNumberRef.current = true;
    setFormData((prev) => {
      if (prev.item_number) return prev;
      return { ...prev, item_number: buildApplicantItemNumber() };
    });
    isGeneratingItemNumberRef.current = false;
  }, [currentStep, entryMode, formData.item_number, hasStartedAssessment]);

  useEffect(() => {
    if (entryMode === 'landing') {
      loadJobPostings().then(() => {
        const jobs = getAuthoritativeJobPostings().filter(job => job.status === 'Active');
        setActiveJobs(jobs);
      });
    }
  }, [entryMode]);

  return (
    <div className="applicant-shell">
      <header className="applicant-topbar">
          <div className="applicant-brand">
            <img src={abyanLogo} alt="ABYAN logo" className="applicant-brand-logo" />
          <div>
            <h1>Abyan HRIS Applicant Portal</h1>
            <p>Human Resource Information System</p>
          </div>
        </div>
      </header>

      {entryMode === 'landing' ? (
        <main className="portal-landing">
          <div className="portal-landing-header">
            <h2>Welcome to Abyan HRIS Applicant Portal</h2>
            <p>Please begin your application below</p>
          </div>

          <div className="application-entry-card">
            <div className="entry-icon-wrap" aria-hidden="true">
              <UserPlus size={46} />
            </div>
            <h3>Job Application</h3>
            <p>Apply for a general position or select from the vacancies below</p>
            <Button className="entry-primary-button" onClick={() => handleStartJobApplication()}>
              Start General Application
            </Button>
          </div>

          {activeJobs.length > 0 && (
            <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm border border-slate-200 w-full max-w-2xl mx-auto">
              <h3 className="text-xl font-bold mb-4 text-slate-800 text-center">Currently Vacant Jobs</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {activeJobs.map(job => (
                  <div key={job.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 hover:border-blue-300 hover:shadow-md transition-all flex flex-col h-full text-left">
                    <h4 className="font-bold text-slate-900 leading-tight mb-1">{job.title}</h4>
                    <p className="text-sm text-slate-600 flex-1">{job.division || job.department}</p>
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <p className="text-xs font-mono text-slate-500 mb-3">Item No: {job.jobCode}</p>
                      <button 
                        onClick={() => handleStartJobApplication(job)} 
                        className="w-full flex items-center justify-center gap-2 rounded-full bg-white py-2.5 px-4 font-bold text-blue-600 border-[1.5px] border-blue-600 hover:bg-blue-50 transition-colors shadow-sm"
                      >
                        <Briefcase size={18} />
                        Apply for a Job
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button className="employee-promotion-button mt-8" onClick={handleOpenEmployeeAuth}>
            <Users size={18} />
            <span>I'm a current employee applying for promotion</span>
          </button>

          <div className="employee-note-card">
            <p>
              <strong>Note:</strong> Current employees must authenticate using their employee credentials to apply
              for promotional positions.
            </p>
          </div>

          <a href="/track" className="track-application-link">
            <FileText size={16} />
            <span>Track your existing application</span>
          </a>


        </main>
      ) : (
        <main className="wizard-layout">
          <aside className="wizard-sidebar">
            <h3>Application Progress</h3>

            <div className="progress-item">
              <div className={`progress-badge ${currentStep > 1 ? 'completed' : 'active'}`}>
                {currentStep > 1 ? <CheckCircle2 size={18} /> : '1'}
              </div>
              <div>
                <p className="progress-title">Personal &amp; Application Info</p>
                <p className="progress-status">{currentStep > 1 ? 'Completed' : 'In Progress'}</p>
              </div>
            </div>

            <div className="progress-item">
              <div className={`progress-badge ${currentStep > 2 ? 'completed' : currentStep === 2 ? 'active' : ''}`}>
                {currentStep > 2 ? <CheckCircle2 size={18} /> : '2'}
              </div>
              <div>
                <p className="progress-title">Upload Requirements</p>
                <p className="progress-status">
                  {currentStep > 2 ? 'Completed' : currentStep === 2 ? 'In Progress' : 'Pending'}
                </p>
              </div>
            </div>

            <div className="progress-item">
              <div className={`progress-badge ${currentStep === 3 ? 'active' : ''}`}>3</div>
              <div>
                <p className="progress-title">Review &amp; Submit</p>
                <p className="progress-status">{currentStep === 3 ? 'In Progress' : 'Pending'}</p>
              </div>
            </div>

            <div className="progress-reminder">
              <p>
                <strong>Important:</strong> Please complete all steps to submit your application. Ensure all
                information is accurate and all required documents are uploaded.
              </p>
            </div>
          </aside>

          <section className="wizard-main">
            {currentStep === 1 && (
              <>
                <div className="wizard-heading">
                  <h2>Personal &amp; Application Information</h2>
                  <p>Please provide your complete details for evaluation.</p>
                </div>
                <div className="wizard-content">
                  <ApplicantAssessmentForm
                      formData={formData}
                      errors={errors}
                      onChange={handleFormChange}
                      applicationType={applicationType}
                      isEmployee={Boolean(authenticatedEmployeeAccount?.employee?.employeeId)}
                      onApplicationTypeChange={(next) => {
                        // Guard: an authenticated employee may never switch to Original.
                        // (UI also hides the radio group in that case, but defense-in-depth.)
                        if (authenticatedEmployeeAccount?.employee?.employeeId && next === 'job') return;
                        setApplicationType(next);
                        handleFormChange('application_type', next);
                      }}
                      lockedPosition={isLockedPosition}
                    />
                </div>
              </>
            )}

            {currentStep === 2 && (
              <>
                <div className="wizard-heading">
                  <h2>Upload Requirements</h2>
                  <p>Upload all required documents before proceeding to review.</p>
                </div>
                <div className="wizard-content">
                  <AttachmentsUploadForm
                    files={files}
                    onFilesChange={handleFilesChange}
                    error={fileError}
                    itemNumber={formData.item_number}
                    applicationType={applicationType}
                    formData={formData}
                    onChange={handleFormChange}
                    errors={errors}
                  />
                </div>
              </>
            )}

            {currentStep === 3 && (
              <>
                <div className="wizard-heading">
                  <h2>Review &amp; Submit Application</h2>
                  <p>Please review your information carefully before submitting your application.</p>
                </div>

                <div className="review-panel">
                  <h4>
                    <BadgeCheck size={20} /> Personal &amp; Application Information
                  </h4>
                  <div className="review-grid">
                    {applicationType === 'promotion' && (
                      <>
                        <div>
                          <label>Employee ID</label>
                          <p>{formData.employee_id || '-'}</p>
                        </div>
                        <div>
                          <label>Current Position</label>
                          <p>{formData.current_position || '-'}</p>
                        </div>
                        <div>
                          <label>Current Department</label>
                          <p>{formData.current_department || '-'}</p>
                        </div>
                        <div>
                          <label>Current Division</label>
                          <p>{formData.current_division || '-'}</p>
                        </div>
                      </>
                    )}
                    <div>
                      <label>First Name</label>
                      <p>{formData.first_name || '-'}</p>
                    </div>
                    <div>
                      <label>Middle Name</label>
                      <p>{formData.middle_name || '-'}</p>
                    </div>
                    <div>
                      <label>Last Name</label>
                      <p>{formData.last_name || '-'}</p>
                    </div>
                    <div>
                      <label>Email Address</label>
                      <p>{formData.email || '-'}</p>
                    </div>
                    <div>
                      <label>Gender</label>
                      <p>{formData.gender || '-'}</p>
                    </div>
                    <div>
                      <label>Position Applying For</label>
                      <p>{formData.position || '-'}</p>
                    </div>
                    <div>
                      <label>Address</label>
                      <p>{formData.address || '-'}</p>
                    </div>
                    <div>
                      <label>Office</label>
                      <p>{formData.office || '-'}</p>
                    </div>
                    <div>
                      <label>Item Number (Application ID)</label>
                      <p className="font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded inline-block cursor-not-allowed select-none">{formData.item_number || '-'}</p>
                    </div>
                    <div>
                      <label>Contact Number</label>
                      <p>{formData.contact_number || '-'}</p>
                    </div>
                    <div>
                      <label>PWD Status</label>
                      <p>{formData.is_pwd ? 'Yes' : 'No'}</p>
                    </div>
                    {formData.gov_id_type && (
                      <div>
                        <label>Government ID Type</label>
                        <p>{formData.gov_id_type} {formData.gov_id_expiration ? `(Expires: ${formData.gov_id_expiration})` : '(No Expiration)'}</p>
                      </div>
                    )}
                    {(formData.education_degree || formData.education_school) && (
                      <div>
                        <label>Educational Background</label>
                        <p>{[formData.education_degree, formData.education_school].filter(Boolean).join(', ') || '-'}</p>
                      </div>
                    )}
                    {(formData.work_experience_years || formData.work_experience_months || formData.relevant_experience_position) && (
                      <div className="sm:col-span-2 border-t border-slate-100 pt-3 mt-1">
                        <label className="font-semibold text-slate-700">Relevant Work Experience</label>
                        <div className="bg-slate-50 p-3 rounded-lg mt-1 space-y-1">
                          <p><strong>Duration:</strong> {formData.work_experience_years ? `${formData.work_experience_years} years` : '0 years'} {formData.work_experience_months ? `${formData.work_experience_months} months` : ''}</p>
                          {formData.relevant_experience_position && <p><strong>Position:</strong> {formData.relevant_experience_position}</p>}
                          {formData.relevant_experience_company && <p><strong>Company:</strong> {formData.relevant_experience_company}</p>}
                          {formData.relevant_experience_duties && <p className="text-xs text-slate-600 mt-2"><strong>Duties:</strong> {formData.relevant_experience_duties}</p>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="review-panel">
                  <h4>
                    <FileText size={20} /> Uploaded Documents ({reviewedFiles.length})
                  </h4>
                  <div className="review-documents-list">
                    {reviewedFiles.length > 0 ? (
                      reviewedFiles.map((doc) => (
                        <div key={doc.key} className="review-document-item">
                          <div>
                            <p className="doc-name">{doc.fileName}</p>
                            <p className="doc-meta">{formatFileSize(doc.fileSize)}</p>
                          </div>
                          <CircleCheck size={20} className="doc-valid-icon" />
                        </div>
                      ))
                    ) : (
                      <p className="review-empty">No documents uploaded yet.</p>
                    )}
                  </div>
                </div>

                <div className="declaration-box">
                  <h4>Declaration</h4>
                  <p>
                    I hereby certify that all information provided in this application is true and correct to the best
                    of my knowledge. I understand that any false statement may result in the rejection of my
                    application or termination of employment if discovered after hiring.
                  </p>
                </div>

                {applicationType === 'promotion' && authenticatedEmployeeAccount && (
                  <div className="review-panel">
                    <h4>
                      <ShieldCheck size={20} /> Internal Employee Link
                    </h4>
                    <div className="review-grid">
                      <div>
                        <label>Employee Portal Username</label>
                        <p>{authenticatedEmployeeAccount.username}</p>
                      </div>
                      <div>
                        <label>Linked Account</label>
                        <p>{authenticatedEmployeeAccount.employee.fullName}</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {submitError && (
              <div className="submit-error">
                <p>{submitError}</p>
              </div>
            )}

            <div className="wizard-actions">
              {currentStep > 1 && (
                <Button variant="outline" onClick={handleBack} disabled={isSubmitting}>
                  ← Back
                </Button>
              )}

              {currentStep === 1 && (
                <Button onClick={handleNext}>
                  Next: Upload Documents →
                </Button>
              )}

              {currentStep === 2 && (
                <Button onClick={handleNextToReview}>
                  Next: Review &amp; Submit →
                </Button>
              )}

              {currentStep === 3 && (
                <Button onClick={handleSubmit} loading={isSubmitting} disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting...' : 'Submit Application'}
                </Button>
              )}
            </div>
          </section>
        </main>
      )}

      <Dialog open={showEmployeeAuth} onClose={handleCloseEmployeeAuth}>
        <div className="employee-auth-dialog">
          <div className="employee-auth-icon" aria-hidden="true">
            <ShieldCheck size={34} />
          </div>
          <h3>Employee Authentication</h3>
          <p>Please login with your employee credentials to proceed with your promotional application.</p>

          <form onSubmit={handleEmployeeAuthSubmit} className="employee-auth-form">
            <label htmlFor="employee-number">Employee Number</label>
            <input
              id="employee-number"
              value={employeeNumber}
              onChange={(event) => setEmployeeNumber(event.target.value)}
              placeholder="e.g., EMP-2024-001"
            />

            <label htmlFor="employee-password">Password</label>
            <div className="relative">
              <input
                id="employee-password"
                type={showEmployeePassword ? 'text' : 'password'}
                value={employeePassword}
                onChange={(event) => setEmployeePassword(event.target.value)}
                placeholder="Enter your employee password"
                style={{ paddingRight: '2.5rem' }}
              />
              <button
                type="button"
                onClick={() => setShowEmployeePassword((prev) => !prev)}
                aria-label={showEmployeePassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showEmployeePassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <div className="employee-auth-hint">
              <p>
                <strong>Use your Employee Portal credentials:</strong>
              </p>
              <p>Enter your Employee Number (or username) and your Employee Portal password.</p>
            </div>

            {employeeAuthError && <p className="employee-auth-error">{employeeAuthError}</p>}

            <div className="employee-auth-actions">
              <Button type="button" variant="outline" onClick={handleCloseEmployeeAuth}>
                Cancel
              </Button>
              <Button type="submit">Login</Button>
            </div>
          </form>
        </div>
      </Dialog>

      <Dialog open={showSuccessDialog} onClose={handleCloseSuccessDialog}>
        <div className="submission-success-card">
          <div className="success-icon-wrap" aria-hidden="true">
            <CheckCircle2 size={42} />
          </div>
          <h3>Application Submitted Successfully</h3>
          <p>
            Your application has been received and is now under review.
          </p>
          <div className="submission-reference-box">
            <p className="submission-reference-label">Your Application Item Number</p>
            <p className="submission-reference">{submissionReference}</p>
            <p className="submission-reference-hint">
              You can track your application status anytime using this code or your email address.
            </p>
          </div>
          <div className="flex gap-3 mt-6">
            <Button
              variant="outline"
              onClick={handleCloseSuccessDialog}
              style={{ flex: 1 }}
            >
              Back to Home
            </Button>
            <Button
              onClick={() => {
                navigate('/track');
                setShowSuccessDialog(false);
              }}
              style={{ flex: 1 }}
            >
              Track Application
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={isSubmitting} onClose={() => {}}>
        <div className="flex flex-col items-center justify-center p-6 text-center" style={{ minWidth: '320px' }}>
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-t-[#363EE8] border-slate-200 mb-4" />
          <h3 className="text-lg font-bold text-[#050D65] mb-1">Submitting Application</h3>
          <p className="text-xs text-slate-500 mb-6">Uploading files and finalizing records...</p>
          
          <div className="w-full space-y-2 text-left">
            {files.map((f) => (
              <div key={f.id} className="flex items-center justify-between text-xs border border-slate-100 bg-slate-50 p-2 rounded-lg">
                <span className="font-medium text-slate-700 truncate max-w-[220px]">
                  📄 {REQUIRED_DOCUMENTS.find(d => d.type === (f as any).documentType)?.label || f.file.name}
                </span>
                <span className="text-[#363EE8] font-bold animate-pulse">Uploading...</span>
              </div>
            ))}
          </div>
        </div>
      </Dialog>
    </div>
  );
};
