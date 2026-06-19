import React, { useRef, useState } from 'react';
import { Button, Card } from '../../components';
import '../../styles/fileUpload.css';
import type { UploadedFile, ApplicantFormData, ValidationErrors } from '../../types/applicant.types';

interface AttachmentsUploadFormProps {
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  error?: string;
  itemNumber?: string;
  applicationType?: 'job' | 'promotion';
  formData?: ApplicantFormData;
  onChange?: (field: keyof ApplicantFormData, value: string | boolean) => void;
  errors?: ValidationErrors;
}

export type DocumentType =
  | 'application_letter'
  | 'pds_with_photo'
  | 'curriculum_vitae'
  | 'eligibility_proof'
  | 'training_certificate'
  | 'transcript_of_records'
  | 'previous_employer_certificate'
  | 'drug_test'
  | 'government_id'
  | 'other';

interface CategorizedFile extends UploadedFile {
  documentType: DocumentType;
}

export const REQUIRED_DOCUMENTS = [
  {
    type: 'application_letter' as DocumentType,
    label: 'Application Letter',
    description: 'Indicating the position applied for, item number and name of office',
    required: true,
  },
  {
    type: 'pds_with_photo' as DocumentType,
    label: 'Personal Data Sheet (PDS)',
    description: 'CS Form No. 212, Revised 2023 with Work Experience Sheet and recent passport-sized photo; digitally signed',
    required: true,
  },
  {
    type: 'curriculum_vitae' as DocumentType,
    label: 'Curriculum Vitae',
    description: 'Updated CV summarizing your educational background, work experience, and relevant achievements',
    required: true,
  },
  {
    type: 'eligibility_proof' as DocumentType,
    label: 'Proof of Eligibility Rating/License',
    description: 'Hard copy or electronic copy',
    required: true,
  },
  {
    type: 'training_certificate' as DocumentType,
    label: 'Certificate of Relevant Training/Seminars',
    description: 'Hard copy or electronic copy',
    required: true,
  },
  {
    type: 'transcript_of_records' as DocumentType,
    label: 'Transcript of Records',
    description: 'Hard copy or electronic copy',
    required: true,
  },
  {
    type: 'government_id' as DocumentType,
    label: 'Government-Issued ID',
    description: 'Passport, Driver\'s License, National ID, UMID, PhilHealth ID, PRC ID, Postal ID',
    required: true,
  },
  {
    type: 'previous_employer_certificate' as DocumentType,
    label: 'Certificate from Previous Employer',
    description: 'Indicating that the applicant\'s previous work is relevant to the position',
    required: false,
  },
  {
    type: 'drug_test' as DocumentType,
    label: 'Drug Test Result',
    description: 'Conducted by a government or DOH-accredited drug testing laboratory',
    required: true,
  },
  {
    type: 'other' as DocumentType,
    label: 'Other Supporting Documents',
    description: 'Any additional documents you wish to submit',
    required: false,
  },
];

const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/jpg'
];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export const AttachmentsUploadForm: React.FC<AttachmentsUploadFormProps> = ({
  files,
  onFilesChange,
  error,
  itemNumber,
  applicationType = 'job',
  formData,
  onChange,
  errors = {},
}) => {
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const categorizedFiles = files as CategorizedFile[];
  const isPromotion = applicationType === 'promotion';

  // Local state for upload progress and status per document type (simulated interactive feedback)
  const [localProgress, setLocalProgress] = useState<Record<string, number>>({});
  const [localStatus, setLocalStatus] = useState<Record<string, 'uploading' | 'success' | 'error'>>({});
  const [localError, setLocalError] = useState<Record<string, string>>({});

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, documentType: DocumentType) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      
      // Reset statuses
      setLocalError(prev => ({ ...prev, [documentType]: '' }));
      setLocalStatus(prev => ({ ...prev, [documentType]: 'uploading' }));
      setLocalProgress(prev => ({ ...prev, [documentType]: 0 }));

      // 1. Validation (format and size)
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        const fileExt = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        if (!ACCEPTED_EXTENSIONS.includes(fileExt)) {
          setLocalStatus(prev => ({ ...prev, [documentType]: 'error' }));
          setLocalError(prev => ({ ...prev, [documentType]: 'Unsupported file format. Please upload PDF, DOC, DOCX, JPG, or PNG.' }));
          e.target.value = '';
          return;
        }
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        setLocalStatus(prev => ({ ...prev, [documentType]: 'error' }));
        setLocalError(prev => ({ ...prev, [documentType]: 'File exceeds 10MB size limit.' }));
        e.target.value = '';
        return;
      }

      // 2. Simulate Upload Progress
      let currentProgress = 0;
      const interval = setInterval(() => {
        currentProgress += 10;
        setLocalProgress(prev => ({ ...prev, [documentType]: currentProgress }));
        
        if (currentProgress >= 100) {
          clearInterval(interval);
          setLocalStatus(prev => ({ ...prev, [documentType]: 'success' }));
          
          const newFile: CategorizedFile = {
            file,
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            documentType,
          };
          
          // Replace existing file of same type or add new
          const filteredFiles = categorizedFiles.filter(f => f.documentType !== documentType);
          onFilesChange([...filteredFiles, newFile]);
        }
      }, 60);
    }
  };

  const removeFile = (id: string, documentType: DocumentType) => {
    onFilesChange(categorizedFiles.filter((f) => f.id !== id));
    setLocalStatus(prev => {
      const next = { ...prev };
      delete next[documentType];
      return next;
    });
    setLocalProgress(prev => {
      const next = { ...prev };
      delete next[documentType];
      return next;
    });
    setLocalError(prev => {
      const next = { ...prev };
      delete next[documentType];
      return next;
    });
  };

  const getFileForDocType = (docType: DocumentType) => {
    return categorizedFiles.find(f => f.documentType === docType);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handlePromotionFilesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const incoming = Array.from(e.target.files).map((file) => ({
      file,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      documentType: file.name,
    })) as CategorizedFile[];

    onFilesChange([...categorizedFiles, ...incoming]);
    e.target.value = '';
  };

  if (isPromotion) {
    return (
      <Card title="Upload Supporting Documents">
        <div className="info-notice">
          <p className="notice-title">Internal Promotional Application</p>
          <p className="notice-number">{itemNumber || 'ITEM-0000-0000'}</p>
          <p className="notice-subtitle">Upload all files that support your promotional application in one batch.</p>
        </div>

        <div className="upload-section">
          <div className="promotion-upload-callout">
            <p>
              Upload certificates, performance records, updated PDS, training proofs, and any other supporting files.
              If possible, name files clearly, for example: <strong>Training-Certificate-Leadership.pdf</strong>.
            </p>
          </div>

          <div className="drop-zone">
            <input
              type="file"
              id="promotion-files"
              ref={(el) => {
                inputRefs.current.promotion = el;
              }}
              className="file-input"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              multiple
              onChange={handlePromotionFilesUpload}
            />
            <label htmlFor="promotion-files" className="file-label">
              <div className="upload-icon" aria-hidden="true">📁</div>
              <div className="upload-text">
                <p className="upload-text-primary">Select one or more supporting documents</p>
                <p className="upload-text-secondary">Accepted formats: PDF, DOC, DOCX, JPG, PNG. Maximum 10MB per file.</p>
              </div>
            </label>
          </div>

          {categorizedFiles.length > 0 && (
            <div className="files-list">
              <p className="files-list-title">Uploaded Files</p>
              {categorizedFiles.map((uploadedFile) => (
                <div key={uploadedFile.id} className="file-item">
                  <div className="file-info">
                    <div className="file-icon" aria-hidden="true">
                      {uploadedFile.file.type.includes('pdf') ? '📄' : uploadedFile.file.type.includes('image') ? '🖼️' : '📝'}
                    </div>
                    <div className="file-details">
                      <p className="file-name">{uploadedFile.file.name}</p>
                      <p className="file-size">{formatFileSize(uploadedFile.file.size)}</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(uploadedFile.id, uploadedFile.documentType)}
                    className="file-remove"
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="upload-error">{error}</p>}
        </div>
      </Card>
    );
  }

  return (
    <Card title="Upload Required Documents">
      <div className="info-notice">
        <p className="notice-title">📋 Your Application Item Number</p>
        <p className="notice-number">{itemNumber || 'ITEM-0000-0000'}</p>
        <p className="notice-subtitle">This number will be assigned to your application automatically.</p>
      </div>

      <div className="upload-section">
        {/* Government ID Configuration */}
        {!isPromotion && formData && onChange && (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50/50 p-6 shadow-sm">
            <h4 className="text-base font-bold text-[#050D65] mb-2 flex items-center gap-1.5">
              💳 Government ID Verification
            </h4>
            <p className="text-xs text-slate-500 mb-4">
              Select your government-issued ID type and enter the expiration date (if applicable).
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="gov-id-type" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Government ID Type <span className="text-red-500">*</span>
                </label>
                <select
                  id="gov-id-type"
                  value={formData.gov_id_type || ''}
                  onChange={(e) => onChange('gov_id_type', e.target.value)}
                  className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${
                    errors.gov_id_type ? 'border-red-500 ring-1 ring-red-500' : ''
                  }`}
                >
                  <option value="">Select ID Type...</option>
                  <option value="Passport">Passport</option>
                  <option value="Driver's License">Driver's License</option>
                  <option value="National ID">National ID</option>
                  <option value="UMID">UMID</option>
                  <option value="PhilHealth ID">PhilHealth ID</option>
                  <option value="PRC ID">PRC ID</option>
                  <option value="Postal ID">Postal ID</option>
                </select>
                {errors.gov_id_type && (
                  <span className="text-xs font-semibold text-red-500 mt-1 block">
                    {errors.gov_id_type}
                  </span>
                )}
              </div>

              <div>
                <label htmlFor="gov-id-expiration" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Expiration Date {['Passport', "Driver's License", 'PRC ID', 'Postal ID'].includes(formData.gov_id_type) && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="date"
                  id="gov-id-expiration"
                  value={formData.gov_id_expiration || ''}
                  onChange={(e) => onChange('gov_id_expiration', e.target.value)}
                  disabled={!['Passport', "Driver's License", 'PRC ID', 'Postal ID'].includes(formData.gov_id_type)}
                  className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed ${
                    errors.gov_id_expiration ? 'border-red-500 ring-1 ring-red-500' : ''
                  }`}
                />
                {errors.gov_id_expiration && (
                  <span className="text-xs font-semibold text-red-500 mt-1 block">
                    {errors.gov_id_expiration}
                  </span>
                )}
                {!['Passport', "Driver's License", 'PRC ID', 'Postal ID'].includes(formData.gov_id_type) && formData.gov_id_type && (
                  <span className="text-xs text-slate-500 mt-1 block">
                    Expiration date not applicable for {formData.gov_id_type}.
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="upload-instructions mb-4">
          <p className="text-sm font-medium text-slate-700">
            <strong>Required Documents Checklist:</strong> Please upload the documents below.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Accepted formats: <strong>PDF, JPG, JPEG, PNG, DOC, DOCX</strong>. Maximum file size: <strong>10MB</strong> per file.
          </p>
        </div>

        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '0.5rem', background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: '0.85rem', color: '#1e40af' }}>
          <strong>📁 File Naming Format:</strong> Please name your files using this format for easier tracking:<br />
          <code style={{ background: '#dbeafe', padding: '0.1rem 0.4rem', borderRadius: '0.25rem', fontSize: '0.8rem' }}>
            [DocumentType]-[LastName]-[FirstName].pdf
          </code>
          <br />
          <span style={{ color: '#3b82f6', fontSize: '0.78rem' }}>
            Example: <em>ApplicationLetter-DelaCruz-Juan.pdf</em> &nbsp;|&nbsp; <em>CurriculumVitae-Santos-Maria.pdf</em>
          </span>
        </div>

        <div className="required-documents-list">
          {REQUIRED_DOCUMENTS.map((doc, index) => {
            const uploadedFile = getFileForDocType(doc.type);
            const inputId = `file-${doc.type}`;
            const status = localStatus[doc.type];
            const progress = localProgress[doc.type] || 0;
            const docError = localError[doc.type];

            return (
              <div key={doc.type} className="document-item border border-slate-200 rounded-xl p-4 mb-4 bg-white hover:border-slate-300 transition-colors">
                <div className="document-header flex gap-4">
                  <div className="document-number bg-slate-100 text-slate-600 font-bold rounded-lg h-8 w-8 flex items-center justify-center flex-shrink-0">{index + 1}</div>
                  <div className="document-info flex-grow min-w-0">
                    <div className="document-title font-semibold text-[#050D65] flex items-center gap-2">
                      {doc.label}
                      {doc.required && <span className="required-badge bg-rose-50 text-rose-600 border border-rose-200 text-xs px-2 py-0.5 rounded-full font-bold">Required</span>}
                    </div>
                    <p className="document-description text-xs text-slate-500 mt-1">{doc.description}</p>
                    
                    {/* Format list helper */}
                    <p className="text-[11px] text-slate-400 mt-1">
                      Formats accepted: PDF, JPG, JPEG, PNG, DOC, DOCX (Max 10MB)
                    </p>
                  </div>
                </div>

                <div className="document-upload-area mt-4">
                  {!uploadedFile && status !== 'uploading' ? (
                    <div className="upload-button-label">
                      <input
                        type="file"
                        id={inputId}
                        ref={(el) => {
                          inputRefs.current[doc.type] = el;
                        }}
                        className="file-input-hidden hidden"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        onChange={(e) => handleFileUpload(e, doc.type)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="upload-trigger"
                        onClick={() => inputRefs.current[doc.type]?.click()}
                      >
                        📎 Choose File
                      </Button>
                    </div>
                  ) : status === 'uploading' ? (
                    /* Progress Bar indicator */
                    <div className="w-full max-w-xs mt-2">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Uploading...</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-blue-600 h-1.5 rounded-full transition-all duration-100"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    /* Success / Failure displays */
                    <div className="uploaded-file-display flex items-center justify-between border border-emerald-100 bg-emerald-50/50 p-3 rounded-lg">
                      <div className="uploaded-file-info flex items-center gap-3 min-w-0">
                        <div className="file-icon-small text-lg">
                          {uploadedFile.file.type.includes('pdf') ? '📄' : 
                           uploadedFile.file.type.includes('image') ? '🖼️' : '📝'}
                        </div>
                        <div className="file-details-compact min-w-0">
                          <p className="file-name-small font-semibold text-slate-700 truncate text-xs">{uploadedFile.file.name}</p>
                          <p className="file-size-small text-[10px] text-slate-500">{formatFileSize(uploadedFile.file.size)}</p>
                          <span className="inline-flex items-center text-[10px] font-bold text-emerald-600 mt-0.5">
                            ✓ Uploaded successfully
                          </span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(uploadedFile.id, doc.type)}
                        className="file-remove-btn text-rose-500 hover:text-rose-700"
                      >
                        ✕ Remove
                      </Button>
                    </div>
                  )}

                  {docError && (
                    <div className="mt-2 text-xs font-semibold text-rose-600 border border-rose-100 bg-rose-50 p-2 rounded-lg">
                      ✗ {docError}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {error && <p className="upload-error text-sm font-semibold text-rose-600 mt-4">{error}</p>}

        <div className="upload-summary mt-6 pt-4 border-t border-slate-100">
          <p className="summary-text text-sm font-medium text-[#050D65]">
            📊 <strong>{categorizedFiles.length}</strong> of <strong>{REQUIRED_DOCUMENTS.length}</strong> documents uploaded
            ({REQUIRED_DOCUMENTS.filter(d => d.required && getFileForDocType(d.type)).length} of {REQUIRED_DOCUMENTS.filter(d => d.required).length} required)
          </p>
        </div>
      </div>
    </Card>
  );
};
