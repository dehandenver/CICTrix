import React, { useState } from 'react';
import '../styles/components.css';

interface AccordionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export const Accordion: React.FC<AccordionProps> = ({ 
  title, 
  children, 
  defaultOpen = false 
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="accordion">
      <button 
        className="accordion-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{title}</span>
        <span className={`accordion-icon ${isOpen ? 'open' : ''}`}>▼</span>
      </button>
      {isOpen && (
        <div className="accordion-content">
          {children}
        </div>
      )}
    </div>
  );
};
