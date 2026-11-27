/**
 * Building blocks shared by Job Details (Step 1) and the application wizard
 * (Steps 2–3). Styles: src/styles/applicant-flow.css.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Check, ChevronRight, X } from 'lucide-react';
import abyanLogo from '../../../assets/abyan-logo.png';
import type { ChoiceStatus } from './applicationDrafts';
import '../../../styles/applicant-flow.css';

// ── Public header (DESIGN_IDENTITY.md §8.1) ─────────────────────────────────

// Carries its own `abyan-ds` so it also renders correctly on pages whose root
// isn't in the design-system scope (the /apply landing view).
export const PublicTopBar = ({ current }: { current?: 'home' | 'about' }) => (
  <header className="abyan-ds af-topbar">
    <div className="af-container">
      <a href="/" className="af-lockup" aria-label="ABYAN HRIS home">
        <img src={abyanLogo} alt="" />
        <span className="af-lockup-name">ABYAN</span>
        <span className="af-lockup-sub">Human Resource Information System</span>
      </a>
      <nav className="af-nav" aria-label="Main">
        <a href="/" aria-current={current === 'home' ? 'page' : undefined}>Home</a>
        <a href="/about" aria-current={current === 'about' ? 'page' : undefined}>About</a>
      </nav>
    </div>
  </header>
);

// ── Stepper ─────────────────────────────────────────────────────────────────
// NEW COMPONENT: the guide has no stepper spec. Built from tokens only —
// current = primary, done = check icon, upcoming = neutral-400 — and every
// step always carries its text label, so state never relies on colour.

export interface StepDef {
  label: string;
}

export const Stepper = ({ steps, current }: { steps: StepDef[]; current: number }) => (
  <ol className="af-stepper" aria-label="Application progress">
    {steps.map((step, index) => {
      const state = index < current ? 'done' : index === current ? 'current' : 'upcoming';
      return (
        <li key={step.label} style={{ display: 'contents' }}>
          <span className="af-step" data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="af-step-dot" aria-hidden="true">
              {state === 'done' ? <Check size={14} strokeWidth={2.5} /> : index + 1}
            </span>
            <span>
              {step.label}
              <span className="af-sr-only">
                {state === 'done' ? ' (completed)' : state === 'current' ? ' (current step)' : ''}
              </span>
            </span>
          </span>
          {index < steps.length - 1 && (
            <ChevronRight className="af-step-sep" size={16} strokeWidth={1.75} aria-hidden="true" />
          )}
        </li>
      );
    })}
  </ol>
);

export const APPLY_STEPS: StepDef[] = [
  { label: 'Choose plantilla' },
  { label: 'Fill up application' },
  { label: 'Review & submit' },
];

/** A general application has no plantilla to choose. */
export const GENERAL_APPLY_STEPS: StepDef[] = [
  { label: 'Fill up application' },
  { label: 'Review & submit' },
];

// ── Status badge (§9.8 soft style, §10 map) ─────────────────────────────────

const STATUS_BADGE: Record<ChoiceStatus, { cls: string; label: string }> = {
  open: { cls: 'badge-success', label: 'Open' },
  closing: { cls: 'badge-warning', label: 'Closing soon' },
  filled: { cls: 'badge-neutral', label: 'Filled' },
  closed: { cls: 'badge-neutral', label: 'Closed' },
  applied: { cls: 'badge-info', label: 'Already applied' },
};

export const StatusBadge = ({ status }: { status: ChoiceStatus }) => {
  const { cls, label } = STATUS_BADGE[status];
  return (
    <span className={`badge ${cls}`}>
      <span className="badge-dot" aria-hidden="true" />
      {label}
    </span>
  );
};

// ── Section card: 36px icon chip + Title S ──────────────────────────────────

export const FormSection = ({
  icon,
  title,
  description,
  wide = false,
  children,
  headingId,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  /** Repeatable or wide content spans both grid columns. */
  wide?: boolean;
  children: ReactNode;
  headingId?: string;
}) => (
  <section className={`af-card ${wide ? 'af-span-2' : ''}`} aria-labelledby={headingId}>
    <div className="af-card-head">
      <span className="af-chip" aria-hidden="true">{icon}</span>
      <div className="af-card-head-text">
        <h3 className="af-title-s" id={headingId}>{title}</h3>
        {description && <p className="af-caption">{description}</p>}
      </div>
    </div>
    {children}
  </section>
);

// ── Confirm modal (native <dialog>, §9.10: 480px desktop / full-screen sheet < 640px) ──

export const ConfirmModal = ({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') {
          dialog.showModal();
        } else {
          dialog.setAttribute('open', '');
        }
      }
      // Safe action receives initial focus so accidental Enter never confirms.
      cancelRef.current?.focus();
    } else if (dialog.open) {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    }
  }, [open]);

  // Fallback light-dismiss when native <dialog closedby="any"> is unsupported (e.g. Safari).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog || busy) return;
    if (typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype) return;

    const isOutside = (event: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
    };

    let pressedOutside = false;
    const onPointerDown = (event: PointerEvent) => {
      pressedOutside = isOutside(event);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (pressedOutside && isOutside(event)) {
        onCancel();
      }
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', onPointerDown);
    dialog.addEventListener('pointerup', onPointerUp);
    return () => {
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('pointerup', onPointerUp);
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  const closedByAttrs = { closedby: busy ? 'none' : 'any' } as Record<string, string>;

  return (
    <dialog
      ref={dialogRef}
      className="af-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClose={() => {
        if (dialogRef.current) dialogRef.current.returnValue = '';
      }}
      {...closedByAttrs}
    >
      <div className="af-dialog-head">
        <h1 className="af-dialog-title" id={titleId}>{title}</h1>
        <button type="button" className="af-dialog-close" onClick={onCancel} aria-label="Close" disabled={busy}>
          <X size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      {children && <div className="af-dialog-body af-body-m">{children}</div>}
      <div className="af-modal-actions">
        <button ref={cancelRef} type="button" autoFocus className="btn btn-md btn-secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`btn btn-md ${destructive ? 'af-btn-destructive' : 'btn-primary'} ${busy ? 'af-loading' : ''}`}
          onClick={onConfirm}
          disabled={busy}
          aria-busy={busy || undefined}
        >
          <span>{confirmLabel}</span>
        </button>
      </div>
    </dialog>
  );
};
