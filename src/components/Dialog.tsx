import React from 'react';
import '../styles/components.css';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Dialog: React.FC<DialogProps> = ({ open, onClose, title, children, size = 'md' }) => {
  if (!open) return null;

  const getStyle = () => {
    if (size === 'xl') return { maxWidth: '85rem', width: '95%' };
    if (size === 'lg') return { maxWidth: '70rem', width: '90%' };
    if (size === 'sm') return { maxWidth: '380px', width: '90%' };
    return { maxWidth: '550px', width: '90%' };
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" style={getStyle()} onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="dialog-header">
            <h2 className="dialog-title">{title}</h2>
            <button className="dialog-close" onClick={onClose}>×</button>
          </div>
        )}
        <div className="dialog-body">
          {children}
        </div>
      </div>
    </div>
  );
};
