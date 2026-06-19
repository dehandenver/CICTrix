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
  const readOnlyInputStyle: React.CSSProperties = readOnly
    ? { backgroundColor: '#e5e7eb', color: '#6b7280', borderColor: '#d1d5db', cursor: 'default' }
    : {};

  const readOnlyLabelStyle: React.CSSProperties = readOnly
    ? { color: '#9ca3af' }
    : {};

  return (
    <div className="input-wrapper">
      {label && (
        <label className="input-label" style={readOnlyLabelStyle}>
          {label}
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
          style={{ ...readOnlyInputStyle, ...style }}
          {...props}
        />
      </div>
      {error && <span className="input-error-text">{error}</span>}
      {helperText && !error && <span className="input-helper-text">{helperText}</span>}
    </div>
  );
};
