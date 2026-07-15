import React from 'react';
import '../styles/components.css';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string; disabled?: boolean }[];
}

export const Select: React.FC<SelectProps> = ({ 
  label, 
  error, 
  options,
  className = '',
  ...props 
}) => {
  return (
    <div className="select-wrapper">
      {label && <label className="select-label">{label}</label>}
      <select 
        className={`select ${error ? 'select-error' : ''} ${className}`}
        {...props}
      >
        <option value="">Select an option...</option>
        {options.map((option) => (
          <option 
            key={option.value} 
            value={option.value} 
            disabled={option.disabled}
            style={option.disabled ? { color: '#9ca3af' } : undefined}
          >
            {option.label}
          </option>
        ))}
      </select>
      {error && <span className="select-error-text">{error}</span>}
    </div>
  );
};
