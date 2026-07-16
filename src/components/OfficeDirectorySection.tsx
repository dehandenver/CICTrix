import React from 'react';

interface OfficeDirectorySectionProps {
  showBulkRequest?: boolean;
}

export const OfficeDirectorySection: React.FC<OfficeDirectorySectionProps> = ({
  showBulkRequest = false,
}) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-800 mb-2">Office Directory</h3>
      <p className="text-sm text-slate-500">
        Manage departments, offices, and view staff headcounts.
      </p>
      <div className="mt-4 p-4 border border-dashed border-slate-200 rounded-lg text-center text-xs text-slate-400">
        Office directory details are loading...
      </div>
    </div>
  );
};
