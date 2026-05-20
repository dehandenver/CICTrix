import { FileText } from 'lucide-react';
import React from 'react';

type EmptyStateProps = {
  icon?: React.ElementType;
  title: string;
  description?: string;
  className?: string;
};

export function EmptyState({ icon: Icon = FileText, title, description, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl ${className}`}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-500 max-w-sm">{description}</p>}
    </div>
  );
}
