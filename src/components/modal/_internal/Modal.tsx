import { useId, useRef, type ReactNode, type RefObject, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useModalBehavior } from './useModalBehavior';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

/** §9.10 widths: confirmations, forms, lists. */
const WIDTH: Record<ModalSize, string> = {
  sm: 'sm:max-w-[480px]',
  md: 'sm:max-w-[640px]',
  lg: 'sm:max-w-[880px]',
  xl: 'sm:max-w-[1024px]',
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Header title. Omit only for legacy Dialog callers that draw their own heading (they then need ariaLabel). */
  title?: ReactNode;
  /** Accessible name when there is no title. */
  ariaLabel?: string;
  subtitle?: ReactNode;
  /** Optional 20px icon before the title. */
  icon?: ReactNode;
  /** sm 480 (confirmations), md 640 (forms, default), lg 880 (lists), xl 1024 (document viewers). */
  size?: ModalSize;
  /** Footer actions, right-aligned: Cancel (secondary) then the primary. */
  footer?: ReactNode;
  children: ReactNode;
  /** false turns off Esc, overlay click and the close button, e.g. while saving. */
  dismissible?: boolean;
  /** Element to focus on open; defaults to the first field, then the close button. */
  initialFocusRef?: RefObject<HTMLElement>;
  /** Edge-to-edge body at a fixed 88vh height, for document viewers. */
  flush?: boolean;
  /** window.print() prints only this modal's body: no page, overlay, header or footer. */
  printable?: boolean;
  /** Ref to the scrolling body, for callers that scroll to a field. */
  bodyRef?: Ref<HTMLDivElement>;
}

/**
 * The standard ABYAN modal (DESIGN_IDENTITY §9.10): gradient header, white
 * scrolling body, footer actions. Renders in a portal inside an `.abyan-ds`
 * scope so tokens, `.btn` classes and the white header text hold in every portal.
 */
export const Modal = ({
  open, onClose, title, ariaLabel, subtitle, icon, size = 'md', footer, children, dismissible = true, initialFocusRef, bodyRef, flush = false, printable = false,
}: ModalProps) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const innerBodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const subtitleId = useId();

  useModalBehavior({ open, dismissible, onClose, panelRef, bodyRef: innerBodyRef, closeRef, initialFocusRef });

  if (!open) return null;

  const setBodyRef = (el: HTMLDivElement | null) => {
    (innerBodyRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (typeof bodyRef === 'function') bodyRef(el);
    else if (bodyRef) (bodyRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };

  return createPortal(
    <div
      className={`abyan-ds${printable ? ' abyan-modal-printable' : ''} fixed inset-0 z-[1000] flex items-stretch justify-center bg-[var(--overlay)] sm:items-center sm:p-4`}
      onMouseDown={(e) => { if (dismissible && e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel}
        aria-describedby={subtitle ? subtitleId : undefined}
        className={`relative flex h-full w-full flex-col overflow-hidden bg-white outline-none shadow-[var(--shadow-3)] sm:max-h-[88vh] sm:rounded-2xl ${flush ? 'sm:h-[88vh]' : 'sm:h-auto'} ${WIDTH[size]}`}
      >
        {title ? (
        <header className="abyan-modal-chrome flex shrink-0 items-start justify-between gap-4 px-6 py-4" style={{ background: 'var(--gradient-modal-header)' }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-white">
              {icon && <span className="shrink-0 [&>svg]:h-5 [&>svg]:w-5" aria-hidden="true">{icon}</span>}
              <h2 id={titleId} className="!m-0 !text-xl !font-bold !leading-7 !text-white">{title}</h2>
            </div>
            {subtitle && <p id={subtitleId} className="!mb-0 mt-1 !text-sm !leading-5 !text-[var(--color-primary-200)]">{subtitle}</p>}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={!dismissible}
            aria-label="Close"
            className="-mr-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg !text-white/80 transition hover:bg-white/10 hover:!text-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </header>
        ) : (
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={!dismissible}
            aria-label="Close"
            className="abyan-modal-chrome absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-lg !text-[var(--neutral-600)] hover:bg-[var(--bg-page)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-primary-200)]"
          >
            <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}

        <div ref={setBodyRef} className={`abyan-modal-body min-h-0 flex-1 text-sm text-[var(--neutral-800)] ${flush ? 'overflow-hidden' : 'overflow-y-auto px-6 py-5'}`}>
          {children}
        </div>

        {footer && (
          <footer className="abyan-modal-chrome flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-[var(--neutral-200)] px-6 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
};
