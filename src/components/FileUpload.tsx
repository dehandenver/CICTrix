import React from 'react';
import '../styles/components.css';

interface FileUploadProps {
  label?: string;
  accept?: string;
  onChange: (files: FileList | null) => void;
  error?: string;
  helperText?: string;
  multiple?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  label,
  accept,
  onChange,
  error,
  helperText,
  multiple = false
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.files);
  };

  return (
    <div className="file-upload-wrapper">
      {label && <label className="file-upload-label">{label}</label>}
      <div className={`file-upload ${error ? 'file-upload-error' : ''}`}>
        <input
          type="file"
          accept={accept}
          onChange={handleChange}
          multiple={multiple}
          className="file-upload-input"
        />
        <div className="file-upload-text">
          <span className="file-upload-icon">📁</span>
          <span>Click to upload or drag and drop</span>
        </div>
      </div>
      {error && <span className="file-upload-error-text">{error}</span>}
      {helperText && !error && <span className="file-upload-helper-text">{helperText}</span>}
    </div>
  );
};
