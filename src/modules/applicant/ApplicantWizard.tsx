import {
    BadgeCheck,
    CheckCircle2,
    CircleCheck,
    FileText,
    ShieldCheck,
    UserPlus,
    Users,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import hrisLogo from '../../assets/hris-logo.svg';
import { Button, Dialog } from '../../components';
import { POSITION_TO_DEPARTMENT_MAP } from '../../constants/positions';
import { mockDatabase } from '../../lib/mockDatabase';
import { syncApplicantSubmissionToRecruitment } from '../../lib/recruitmentData';
import { ATTACHMENTS_BUCKET, isMockModeEnabled, supabase } from '../../lib/supabase';
import '../../styles/wizard.css';
import type { ApplicantFormData, UploadedFile, ValidationErrors } from '../../types/applicant.types';
import { validateApplicantForm, validateFiles } from '../../utils/validation';
import { ApplicantAssessmentForm } from './ApplicantAssessmentForm';
import { AttachmentsUploadForm, REQUIRED_DOCUMENTS } from './AttachmentsUploadForm';

const ATTACHMENT_PREVIEW_CACHE_KEY = 'cictrix_attachment_previews';
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
  const [employeeAuthError, setEmployeeAuthError] = useState('');

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
    const fileValidationError = validateFiles(files.map((f) => f.file), files);
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

      let filePath = generatedPath;

      if (hasUpload) {
        const uploadResult = await storageBucket.upload(generatedPath, uploadedFile.file);
        const uploadError = (uploadResult as any).error;
        if (uploadError) {
          throw new Error(`Failed to upload ${uploadedFile.file.name}`);
        }
      } else {
        const isPreviewFriendlyType =
          uploadedFile.file.type.startsWith('image/') ||
          uploadedFile.file.type === 'application/pdf' ||
          uploadedFile.file.type.startsWith('text/');

        if (isPreviewFriendlyType && uploadedFile.file.size <= MAX_PREVIEWABLE_FILE_BYTES) {
          filePath = await toDataUrl(uploadedFile.file);
        } else {
          filePath = `mock://attachment/${applicantId}/${Date.now()}-${encodeURIComponent(uploadedFile.file.name)}`;
        }
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
    const countResult = await client
      .from('applicants')
      .select('id', { count: 'exact', head: true });

    const count = (countResult as any).count || 0;
    const newItemNumber = String(count + 1).padStart(2, '0');

    const applicantPayload = {
      first_name: formData.first_name,
      middle_name: formData.middle_name,
      last_name: formData.last_name,
      gender: formData.gender,
      address: formData.address,
      contact_number: formData.contact_number,
      email: formData.email,
      position: formData.position,
      item_number: newItemNumber,
      office: POSITION_TO_DEPARTMENT_MAP[formData.position] || formData.office,
      is_pwd: formData.is_pwd,
    };

    const applicantResult = typeof client?.insertApplicant === 'function'
      ? await client.insertApplicant(applicantPayload)
      : await client
          .from('applicants')
          .insert(applicantPayload)
          .select()
          .single();

    const applicantError = (applicantResult as any).error;
    const applicantData = (applicantResult as any).data;

    if (applicantError || !applicantData) {
      throw new Error(applicantError?.message || 'Failed to create applicant record');
    }

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
    setEmployeeNumber('');
    setEmployeePassword('');
    setEmployeeAuthError('');
  };

  const isNetworkFetchError = (error: unknown): boolean => {
    if (!(error instanceof Error)) {
      return false;
    }

    return error instanceof TypeError || /failed to fetch|networkerror/i.test(error.message);
  };

  const persistDataSourceMode = (mode: 'local' | 'supabase') => {
    try {
      localStorage.setItem('cictrix_data_source_mode', mode);
    } catch {
      // Ignore localStorage write issues
    }
  };

  const handleSubmit = async () => {
    const fileValidationError = validateFiles(files.map((f) => f.file), files);
    if (fileValidationError) {
      setFileError(fileValidationError);
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      await submitWithClient(supabase);
      persistDataSourceMode('supabase');
      completeSuccess();
    } catch (error) {
      console.error('Submission error:', error);

      if (!isMockModeEnabled && isNetworkFetchError(error)) {
        try {
          await submitWithClient(mockDatabase as any);
          persistDataSourceMode('local');
          completeSuccess();
          return;
        } catch (fallbackError) {
          console.error('Fallback submission error:', fallbackError);
          setSubmitError(
            fallbackError instanceof Error
              ? fallbackError.message
              : 'An error occurred while submitting your application. Please try again.'
          );
          return;
        }
      }

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
    setEmployeeAuthError('');
  };

  const handleEmployeeAuthSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!employeeNumber.trim() || !employeePassword.trim()) {
      setEmployeeAuthError('Please enter your employee number and password.');
      return;
    }

    if (employeeNumber.trim() !== 'EMP-2024-001' || employeePassword !== 'password123') {
      setEmployeeAuthError('Invalid employee credentials. Please verify and try again.');
      return;
    }

    setApplicationType('promotion');
    setEntryMode('wizard');
    setCurrentStep(1);
    setSubmitError('');
    setShowEmployeeAuth(false);
    setEmployeeAuthError('');
  };

  const reviewedFiles = useMemo(() => {
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
  }, [files]);

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

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

          {isMockModeEnabled && (
            <div className="mock-mode-banner">
              <p>Running in demo mode (localStorage). Add Supabase credentials to `.env` to use a live backend.</p>
            </div>
          )}
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
                  <ApplicantAssessmentForm formData={formData} errors={errors} onChange={handleFormChange} />
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
                  <AttachmentsUploadForm files={files} onFilesChange={handleFilesChange} error={fileError} />
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
            <input
              id="employee-password"
              type="password"
              value={employeePassword}
              onChange={(event) => setEmployeePassword(event.target.value)}
              placeholder="Enter your employee password"
            />

            <div className="employee-auth-hint">
              <p>
                <strong>For testing purposes, use:</strong>
              </p>
              <p>Employee Number: EMP-2024-001</p>
              <p>Password: password123</p>
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
