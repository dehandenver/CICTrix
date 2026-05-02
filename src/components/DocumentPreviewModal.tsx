import { Download, X } from 'lucide-react';
import React, { useEffect } from 'react';
import { downloadEmployeeDocument } from '../lib/employeeDocuments';

interface DocumentPreviewModalProps {
  open: boolean;
  fileUrl: string;
  fileName: string;
  fileType?: string | null;
  title?: string;
  subtitle?: string;
  onClose: () => void;
}

const isImage = (fileName: string, fileType?: string | null): boolean => {
  if (fileType?.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fileName);
};

const isPdf = (fileName: string, fileType?: string | null): boolean => {
  if (fileType === 'application/pdf') return true;
  return /\.pdf$/i.test(fileName);
};

const isOfficeDoc = (fileName: string): boolean => {
  return /\.(docx?|xlsx?|pptx?)$/i.test(fileName);
};

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  open,
  fileUrl,
  fileName,
  fileType,
  title,
  subtitle,
  onClose,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleDownload = () => {
    void downloadEmployeeDocument({ file_url: fileUrl, file_name: fileName });
  };

  const renderBody = () => {
    if (!fileUrl) {
      return (
        <div className="flex h-full items-center justify-center text-slate-500">
          No file available to preview.
        </div>
      );
    }

    if (isImage(fileName, fileType)) {
      return (
        <div className="flex h-full items-center justify-center bg-slate-100 p-4">
          <img
            src={fileUrl}
            alt={fileName}
            className="max-h-full max-w-full object-contain shadow-md"
          />
        </div>
      );
    }

    if (isPdf(fileName, fileType)) {
      return (
        <iframe
          src={fileUrl}
          title={fileName}
          className="h-full w-full border-0 bg-slate-100"
        />
      );
    }

    if (isOfficeDoc(fileName)) {
      const officeViewer = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
      return (
        <iframe
          src={officeViewer}
          title={fileName}
          className="h-full w-full border-0 bg-slate-100"
        />
      );
    }

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-slate-600">
        <p className="text-sm">
          This file type can't be previewed in the browser.
        </p>
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Download className="h-4 w-4" />
          Download to view
        </button>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 px-4 py-6"
      onClick={onClose}
    >
      <div
        className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-900">
              {title || fileName}
            </h2>
            {subtitle && (
              <p className="truncate text-xs text-slate-500">{subtitle}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <Download className="h-4 w-4" />
              Download
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">{renderBody()}</div>
      </div>
    </div>
  );
};
