import React from 'react';
import '../styles/components.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  className = '',
  icon,
  readOnly,
  style,
  ...props
}) => {
  // Spec (Applicant Portal Improvements → Uneditable Fields):
  // read-only fields must be visually distinguished — gray background, no
  // text-cursor on focus, and they should not steal tab focus from real
  // inputs the applicant is meant to fill in.
  const readOnlyInputStyle: React.CSSProperties = readOnly
    ? { backgroundColor: '#e5e7eb', color: '#6b7280', borderColor: '#d1d5db', cursor: 'not-allowed' }
    : {};

  const readOnlyLabelStyle: React.CSSProperties = readOnly
    ? { color: '#9ca3af' }
    : {};

  return (
    <div className="input-wrapper">
      {label && (
        <label className="input-label" style={readOnlyLabelStyle}>
          {label}
          {readOnly && (
            <span
              aria-label="Read only"
              title="Auto-generated · cannot be edited"
              style={{
                marginLeft: 6,
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: '#6b7280',
                background: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: 4,
                padding: '1px 6px',
                verticalAlign: 'middle',
              }}
            >
              Read-only
            </span>
          )}
        </label>
      )}
      <div className="relative flex items-center">
        {icon && (
          <div className="absolute left-3 text-gray-400 pointer-events-none flex items-center">
            {icon}
          </div>
        )}
        <input
          className={`input ${icon ? 'pl-10' : ''} ${error ? 'input-error' : ''} ${className}`}
          readOnly={readOnly}
          tabIndex={readOnly ? -1 : props.tabIndex}
          aria-readonly={readOnly || undefined}
          style={{ ...readOnlyInputStyle, ...style }}
          {...props}
        />
      </div>
      {error && <span className="input-error-text">{error}</span>}
      {helperText && !error && <span className="input-helper-text">{helperText}</span>}
    </div>
  );
};
