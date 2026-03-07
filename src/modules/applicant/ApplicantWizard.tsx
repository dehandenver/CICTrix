import React, { useState } from 'react';
import { Button, Dialog } from '../../components';
import { POSITION_TO_DEPARTMENT_MAP } from '../../constants/positions';
import { mockDatabase } from '../../lib/mockDatabase';
import { syncApplicantSubmissionToRecruitment } from '../../lib/recruitmentData';
import { ATTACHMENTS_BUCKET, isMockModeEnabled, supabase } from '../../lib/supabase';
import '../../styles/wizard.css';
import type { ApplicantFormData, UploadedFile, ValidationErrors } from '../../types/applicant.types';
import { validateApplicantForm, validateFiles } from '../../utils/validation';
import { ApplicantAssessmentForm } from './ApplicantAssessmentForm';
import { AttachmentsUploadForm } from './AttachmentsUploadForm';

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
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [formData, setFormData] = useState<ApplicantFormData>(INITIAL_FORM_DATA);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [fileError, setFileError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [submitError, setSubmitError] = useState<string>('');

  const handleFormChange = (field: keyof ApplicantFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field when user starts typing
    if (errors[field as keyof ValidationErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleFilesChange = (newFiles: UploadedFile[]) => {
    setFiles(newFiles);
    setFileError('');
  };

  const handleNext = () => {
    // Validate form data before proceeding to step 2
    const validationErrors = validateApplicantForm(formData);
    
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setCurrentStep(2);
  };

  const handleBack = () => {
    setCurrentStep(1);
  };

  const uploadFiles = async (client: any, applicantId: string): Promise<void> => {
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
        // In local/mock mode, keep images (and other common previewables) as data URLs
        // so preview/download actions work even without cloud storage.
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
        : await client
            .from('applicant_attachments')
            .insert(attachmentPayload);

      const insertError = (insertResult as any).error;
      if (insertError) {
        throw new Error(`Failed to save ${uploadedFile.file.name} record`);
      }
    }
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
      // Best effort only: if cache exceeds quota we still keep submission successful.
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

    await uploadFiles(client, applicantData.id);

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
      attachments: files.map((uploadedFile) => ({
        name: uploadedFile.file.name,
        type: uploadedFile.file.type,
        size: uploadedFile.file.size,
        documentType: (uploadedFile as any).documentType,
      })),
    });
  };

  const completeSuccess = () => {
    setShowSuccessDialog(true);
    setFormData(INITIAL_FORM_DATA);
    setFiles([]);
    setCurrentStep(1);
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
    // Validate files
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

  return (
    <div className="wizard-container">
      {isMockModeEnabled && (
        <div className="mock-mode-banner">
          <p>
            ℹ️ Running in demo mode (localStorage). To use a real database, add Supabase credentials to .env
          </p>
        </div>
      )}

      <div className="wizard-header">
        <h1>HRIS Applicant Module</h1>
        <p className="wizard-subtitle">Submit your application in 2 easy steps</p>
      </div>

      {/* Step Indicator */}
      <div className="step-indicator">
        <div className={`step ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}>
          <div className="step-number">
            {currentStep > 1 ? '✓' : '1'}
          </div>
          <div className="step-label">Assessment Form</div>
        </div>
        
        <div className="step-divider"></div>
        
        <div className={`step ${currentStep >= 2 ? 'active' : ''}`}>
          <div className="step-number">2</div>
          <div className="step-label">Upload Documents</div>
        </div>
      </div>

      {/* Form Content */}
      <div className="wizard-content">
        {currentStep === 1 && (
          <ApplicantAssessmentForm
            formData={formData}
            errors={errors}
            onChange={handleFormChange}
          />
        )}

        {currentStep === 2 && (
          <AttachmentsUploadForm
            files={files}
            onFilesChange={handleFilesChange}
            error={fileError}
          />
        )}
      </div>

      {/* Error Message */}
      {submitError && (
        <div className="submit-error">
          <p>{submitError}</p>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="wizard-actions">
        {currentStep === 2 && (
          <Button variant="outline" onClick={handleBack} disabled={isSubmitting}>
            ← Back
          </Button>
        )}
        
        <div className="flex-spacer"></div>

        {currentStep === 1 && (
          <Button onClick={handleNext}>
            Next: Upload Documents →
          </Button>
        )}

        {currentStep === 2 && (
          <Button onClick={handleSubmit} loading={isSubmitting} disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Submit Application'}
          </Button>
        )}
      </div>

      {/* Success Dialog */}
      <Dialog
        open={showSuccessDialog}
        onClose={handleCloseSuccessDialog}
        title="Application Submitted Successfully!"
      >
        <div className="success-dialog-content">
          <div className="success-icon">✓</div>
          <p className="success-message">
            Thank you for your application! {isMockModeEnabled ? '(Demo mode - data saved to localStorage)' : 'We have received your information and documents.'}
            Our HR team will review your application and contact you soon.
          </p>
          <Button onClick={handleCloseSuccessDialog} className="success-button">
            Close
          </Button>
        </div>
      </Dialog>
    </div>
  );
};
