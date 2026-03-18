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
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import hrisLogo from '../../assets/hris-logo.svg';
import { Button, Dialog } from '../../components';
import { POSITION_TO_DEPARTMENT_MAP } from '../../constants/positions';
import {
    type EmployeePortalAccount,
    findEmployeePortalAccount,
    getEmployeePortalAccounts,
} from '../../lib/employeePortalData';
import { getEmployeeRecords, syncApplicantSubmissionToRecruitment } from '../../lib/recruitmentData';
import { ATTACHMENTS_BUCKET, supabase } from '../../lib/supabase';
import '../../styles/wizard.css';
import type { ApplicantFormData, UploadedFile, ValidationErrors } from '../../types/applicant.types';
import { validateApplicantForm, validateFiles } from '../../utils/validation';
import { ApplicantAssessmentForm } from './ApplicantAssessmentForm';
import { AttachmentsUploadForm, REQUIRED_DOCUMENTS } from './AttachmentsUploadForm';

const ATTACHMENT_PREVIEW_CACHE_KEY = 'cictrix_attachment_previews';
const APPOINTMENT_TYPE_STORAGE_KEY = 'cictrix_rsp_score_setup';
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
};

const buildApplicantItemNumber = (sequence: number): string => {
  const year = new Date().getFullYear();
  return `ITEM-${year}-${String(sequence).padStart(4, '0')}`;
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
  const [entryMode, setEntryMode] = useState<'landing' | 'wizard'>('landing');
  const [applicationType, setApplicationType] = useState<'job' | 'promotion'>('job');
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [formData, setFormData] = useState<ApplicantFormData>(INITIAL_FORM_DATA);
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
  const [authenticatedEmployeeAccount, setAuthenticatedEmployeeAccount] = useState<EmployeePortalAccount | null>(null);
  const isGeneratingItemNumberRef = useRef(false);

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
    const validationErrors = validateApplicantForm(formData);

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
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
        throw new Error('Supabase storage is not available. Please check your configuration.');
      }

      let filePath = generatedPath;
      try {
        const uploadResult = await storageBucket.upload(generatedPath, uploadedFile.file);
        const uploadError = (uploadResult as any).error;
        if (uploadError) {
          throw new Error(`Failed to upload ${uploadedFile.file.name}: ${uploadError}`);
        }
      } catch (error) {
        throw new Error(`Failed to upload ${uploadedFile.file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      const attachmentPayload = {
        applicant_id: applicantId,
        file_name: uploadedFile.file.name,
        file_path: filePath,
        file_type: uploadedFile.file.type,
        file_size: uploadedFile.file.size,
        document_type: (uploadedFile as any).documentType || 'other',
      };

      const insertResult = typeof client?.insertAttachment === 'function'
        ? await client.insertAttachment(attachmentPayload)
        : await client.from('applicant_attachments').insert(attachmentPayload);

      const insertError = (insertResult as any).error;
      if (insertError) {
        throw new Error(`Failed to save ${uploadedFile.file.name} record`);
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

  const submitWithClient = async (client: any): Promise<void> => {
    const itemNumber = formData.item_number || buildApplicantItemNumber(Date.now() % 10000);

    // Helper to ensure empty string for all optional fields
    const safe = (val: string | null | undefined) => (val == null ? '' : val);

    const applicantPayload = {
      first_name: formData.first_name,
      middle_name: safe(formData.middle_name),
      last_name: formData.last_name,
      gender: safe(formData.gender),
      address: safe(formData.address),
      contact_number: safe(formData.contact_number),
      email: formData.email,
      position: safe(formData.position),
      item_number: itemNumber,
      office: safe(POSITION_TO_DEPARTMENT_MAP[formData.position] || formData.office),
      is_pwd: formData.is_pwd,
      application_type: applicationType,
      employee_id: safe(formData.employee_id),
      current_position: safe(formData.current_position),
      current_department: safe(formData.current_department),
      current_division: safe(formData.current_division),
      employee_username: safe(formData.employee_username),
    };


    // Use backend API instead of direct Supabase insert
    let applicantData;
    let applicantError: Error | null = null;
    try {
      const response = await fetch('/api/applicants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(applicantPayload),
      });
      
      if (!response.ok) {
        let errorDetail = `HTTP ${response.status}: Failed to create applicant record`;
        try {
          const errorData = await response.json();
          if (errorData.detail) {
            errorDetail = errorData.detail;
          }
        } catch (jsonErr) {
          // Could not parse error response, use default
        }
        throw new Error(errorDetail);
      }
      
      applicantData = await response.json();
      
      if (!applicantData || !applicantData.id) {
        throw new Error('Server returned invalid applicant data - missing ID');
      }
    } catch (err) {
      applicantError = err instanceof Error ? err : new Error('Failed to create applicant record');
      applicantData = null;
    }

    if (applicantError || !applicantData) {
      throw new Error(applicantError ? applicantError.message : 'Failed to create applicant record');
    }

    saveApplicantAppointmentType(applicantData.id, applicationType);

    const syncedAttachments = await uploadFiles(client, applicantData.id);
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
    });
  };

  const completeSuccess = () => {
    const generatedReference = `#YEOGW${Math.random().toString(36).slice(2, 7).toUpperCase()}XX`;
    setSubmissionReference(generatedReference);
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
      // All data is stored exclusively in Supabase
      await submitWithClient(supabase);
      completeSuccess();
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
  };

  const handleStartJobApplication = () => {
    setApplicationType('job');
    setAuthenticatedEmployeeAccount(null);
    setFormData({ ...INITIAL_FORM_DATA, application_type: 'job' });
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

  const handleEmployeeAuthSubmit = (event: React.FormEvent) => {
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

    const employeeRecord = getEmployeeRecords().find(
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

    if (isGeneratingItemNumberRef.current) {
      return;
    }

    let cancelled = false;

    const generateItemNumber = async () => {
      isGeneratingItemNumberRef.current = true;
      try {
        const supabaseCountResult = await supabase
          .from('applicants')
          .select('id', { count: 'exact', head: true });
        const supabaseCount = Number((supabaseCountResult as any).count ?? 0);

        if (!cancelled) {
          setFormData((prev) => {
            if (prev.item_number) return prev;
            return { ...prev, item_number: buildApplicantItemNumber(supabaseCount + 1) };
          });
        }
      } catch (error) {
        console.error('Failed to generate item number from Supabase:', error);
        if (!cancelled) {
          // Generate a unique sequence based on timestamp as last resort
          const fallbackSequence = Date.now() % 10000;
          setFormData((prev) => {
            if (prev.item_number) return prev;
            return { ...prev, item_number: buildApplicantItemNumber(fallbackSequence) };
          });
        }
      } finally {
        isGeneratingItemNumberRef.current = false;
      }
    };

    void generateItemNumber();

    return () => {
      cancelled = true;
    };
  }, [currentStep, entryMode, formData.item_number, hasStartedAssessment]);

  return (
    <div className="applicant-shell">
      <header className="applicant-topbar">
        <div className="applicant-brand">
          <img src={hrisLogo} alt="HRIS logo" className="applicant-brand-logo" />
          <div>
            <h1>HRIS Applicant Portal</h1>
            <p>Human Resource Information System</p>
          </div>
        </div>
      </header>

      {entryMode === 'wizard' && (
        <div className="application-type-banner">
          <strong>Application Type:</strong>{' '}
          {applicationType === 'promotion' ? 'Promotional Application' : 'Job Application'}
        </div>
      )}

      {entryMode === 'landing' ? (
        <main className="portal-landing">
          <div className="portal-landing-header">
            <h2>Welcome to HRIS Applicant Portal</h2>
            <p>Please begin your application below</p>
          </div>

          <div className="application-entry-card">
            <div className="entry-icon-wrap" aria-hidden="true">
              <UserPlus size={46} />
            </div>
            <h3>Job Application</h3>
            <p>Apply for available positions</p>
            <Button className="entry-primary-button" onClick={handleStartJobApplication}>
              Start Application
            </Button>
          </div>

          <button className="employee-promotion-button" onClick={handleOpenEmployeeAuth}>
            <Users size={18} />
            <span>I'm a current employee applying for promotion</span>
          </button>

          <div className="employee-note-card">
            <p>
              <strong>Note:</strong> Current employees must authenticate using their employee credentials to apply
              for promotional positions.
            </p>
          </div>


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
                      <label>Item Number</label>
                      <p>{formData.item_number || '-'}</p>
                    </div>
                    <div>
                      <label>Contact Number</label>
                      <p>{formData.contact_number || '-'}</p>
                    </div>
                    <div>
                      <label>PWD Status</label>
                      <p>{formData.is_pwd ? 'Yes' : 'No'}</p>
                    </div>
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
            Your application has been received. You will be notified via email regarding the status of your
            application.
          </p>
          <p className="submission-reference">Application Reference: {submissionReference}</p>
        </div>
      </Dialog>
    </div>
  );
};
