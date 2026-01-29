import React, { useState } from 'react';
import { Button, Card } from '../../components';
import '../../styles/fileUpload.css';
import type { UploadedFile } from '../../types/applicant.types';

interface AttachmentsUploadFormProps {
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  error?: string;
}

export const AttachmentsUploadForm: React.FC<AttachmentsUploadFormProps> = ({
  files,
  onFilesChange,
  error,
}) => {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = (fileList: FileList) => {
    const newFiles: UploadedFile[] = Array.from(fileList).map((file) => ({
      file,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    }));
    
    onFilesChange([...files, ...newFiles]);
  };

  const removeFile = (id: string) => {
    onFilesChange(files.filter((f) => f.id !== id));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <Card title="Upload Documents">
      <div className="upload-section">
        <p className="upload-instructions">
          Please upload your resume and any other required documents. 
          Accepted formats: PDF, DOC, DOCX, JPG, PNG (Max 10MB per file)
        </p>

        <div
          className={`drop-zone ${dragActive ? 'drag-active' : ''} ${error ? 'drop-zone-error' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            type="file"
            id="file-upload"
            className="file-input"
            multiple
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            onChange={handleChange}
          />
          <label htmlFor="file-upload" className="file-label">
            <div className="upload-icon">📁</div>
            <div className="upload-text">
              <p className="upload-text-primary">
                Click to upload or drag and drop
              </p>
              <p className="upload-text-secondary">
                PDF, DOC, DOCX, JPG or PNG (max. 10MB)
              </p>
            </div>
          </label>
        </div>

        {error && <p className="upload-error">{error}</p>}

        {files.length > 0 && (
          <div className="files-list">
            <h4 className="files-list-title">Uploaded Files ({files.length})</h4>
            <div className="files-grid">
              {files.map((uploadedFile) => (
                <div key={uploadedFile.id} className="file-item">
                  <div className="file-info">
                    <div className="file-icon">
                      {uploadedFile.file.type.includes('pdf') ? '📄' : 
                       uploadedFile.file.type.includes('image') ? '🖼️' : '📝'}
                    </div>
                    <div className="file-details">
                      <p className="file-name">{uploadedFile.file.name}</p>
                      <p className="file-size">{formatFileSize(uploadedFile.file.size)}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(uploadedFile.id)}
                    className="file-remove"
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};
