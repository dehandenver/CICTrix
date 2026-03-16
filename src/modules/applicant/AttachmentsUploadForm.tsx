import React, { useRef } from 'react';
import { Button, Card } from '../../components';
import '../../styles/fileUpload.css';
import type { UploadedFile } from '../../types/applicant.types';

interface AttachmentsUploadFormProps {
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  error?: string;
  itemNumber?: string;
  applicationType?: 'job' | 'promotion';
}

export type DocumentType = 
  | 'application_letter'
  | 'pds_with_photo'
  | 'eligibility_proof'
  | 'training_certificate'
  | 'transcript_of_records'
  | 'previous_employer_certificate'
  | 'drug_test'
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

export const AttachmentsUploadForm: React.FC<AttachmentsUploadFormProps> = ({
  files,
  onFilesChange,
  error,
  itemNumber,
  applicationType = 'job',
}) => {
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const categorizedFiles = files as CategorizedFile[];
  const isPromotion = applicationType === 'promotion';

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, documentType: DocumentType) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const newFile: CategorizedFile = {
        file,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        documentType,
      };
      
      // Replace existing file of same type or add new
      const filteredFiles = categorizedFiles.filter(f => f.documentType !== documentType);
      onFilesChange([...filteredFiles, newFile]);
    }
  };

  const removeFile = (id: string) => {
    onFilesChange(categorizedFiles.filter((f) => f.id !== id));
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
                    onClick={() => removeFile(uploadedFile.id)}
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
        <p className="upload-instructions">
          <strong>Required Documents:</strong> Please upload all required documents below.
          Accepted formats: PDF, DOC, DOCX, JPG, PNG (Max 10MB per file)
        </p>

        <div className="required-documents-list">
          {REQUIRED_DOCUMENTS.map((doc, index) => {
            const uploadedFile = getFileForDocType(doc.type);
            const inputId = `file-${doc.type}`;

            return (
              <div key={doc.type} className="document-item">
                <div className="document-header">
                  <div className="document-number">{index + 1}</div>
                  <div className="document-info">
                    <div className="document-title">
                      {doc.label}
                      {doc.required && <span className="required-badge">Required</span>}
                    </div>
                    <p className="document-description">{doc.description}</p>
                  </div>
                </div>

                <div className="document-upload-area">
                  {!uploadedFile ? (
                    <div className="upload-button-label">
                      <input
                        type="file"
                        id={inputId}
                        ref={(el) => {
                          inputRefs.current[doc.type] = el;
                        }}
                        className="file-input-hidden"
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
                  ) : (
                    <div className="uploaded-file-display">
                      <div className="uploaded-file-info">
                        <div className="file-icon-small">
                          {uploadedFile.file.type.includes('pdf') ? '📄' : 
                           uploadedFile.file.type.includes('image') ? '🖼️' : '📝'}
                        </div>
                        <div className="file-details-compact">
                          <p className="file-name-small">{uploadedFile.file.name}</p>
                          <p className="file-size-small">{formatFileSize(uploadedFile.file.size)}</p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(uploadedFile.id)}
                        className="file-remove-btn"
                      >
                        ✕ Remove
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {error && <p className="upload-error">{error}</p>}

        <div className="upload-summary">
          <p className="summary-text">
            📊 <strong>{categorizedFiles.length}</strong> of <strong>8</strong> documents uploaded
            ({REQUIRED_DOCUMENTS.filter(d => d.required && getFileForDocType(d.type)).length} of 6 required)
          </p>
        </div>
      </div>
    </Card>
  );
};
