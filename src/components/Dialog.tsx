import React from 'react';
import '../styles/components.css';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export const Dialog: React.FC<DialogProps> = ({ open, onClose, title, children }) => {
  if (!open) return null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
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
