import React from 'react';
import '../styles/components.css';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({ 
  label, 
  className = '',
  ...props 
}) => {
  return (
    <label className={`checkbox-wrapper ${className}`}>
      <input 
        type="checkbox"
        className="checkbox"
        {...props}
      />
      {label && <span className="checkbox-label">{label}</span>}
    </label>
  );
};
