import React, { useEffect, useState, useRef } from 'react';
import { Button, Card } from '../../components';
import { supabase } from '../../lib/supabase';
import '../../styles/fileUpload.css';
import type { UploadedFile } from '../../types/applicant.types';

interface AttachmentsUploadFormProps {
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  error?: string;
}

type DocumentType = 
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

const REQUIRED_DOCUMENTS = [
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
}) => {
  const [nextItemNumber, setNextItemNumber] = useState<string>('01');
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const categorizedFiles = files as CategorizedFile[];

  // Calculate next item number on mount
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const countResult = await supabase
          .from('applicants')
          .select('id', { count: 'exact', head: true });
        
        const count = (countResult as any).count || 0;
        const itemNum = String(count + 1).padStart(2, '0');
        setNextItemNumber(itemNum);
      } catch (err) {
        console.error('Error fetching applicant count:', err);
        setNextItemNumber('01');
      }
    };

    fetchCount();
  }, []);

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

  return (
    <Card title="Upload Required Documents">
      <div className="info-notice">
        <p className="notice-title">📋 Your Application Item Number</p>
        <p className="notice-number">{nextItemNumber}</p>
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
