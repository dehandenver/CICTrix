import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { applicationStatusVariant, normalizeStatus } from '../lib/api/applicantStatus';
import { withdrawnLabel, type ReferenceApplication } from '../lib/referenceApplications';
import './ReferenceAppsChip.css';

interface ReferenceAppsChipProps {
  applicantName: string;
  referenceNo: string;
  /** Every application under the reference, this row's included. */
  applications: ReferenceApplication[];
  /** The row the chip sits on, marked in the list. */
  currentApplicationId?: string;
  /** Spacing from the call site; the chip itself carries no margin. */
  className?: string;
}

/** Gap between the chip and the popover, and the minimum edge margin (§5.1). */
const POPOVER_GAP = 8;
const VIEWPORT_MARGIN = 16;

/**
 * "2 apps" beside a Reference No. Opens a list of every application the person
 * filed under it, including ones withdrawn by a hire on another plantilla, which
 * the RSP lists themselves no longer show. Renders nothing for a single
 * application.
 *
 * The popover is portalled to the body because table containers clip overflow.
 * Focus moves into it on open, and it closes when focus leaves it, so it is
 * never left open behind another layer such as a Modal.
 */
export function ReferenceAppsChip({ applicantName, referenceNo, applications, currentApplicationId, className }: ReferenceAppsChipProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) chipRef.current?.focus();
  }, []);

  const isInside = useCallback((target: EventTarget | null) =>
    target instanceof Node && Boolean(chipRef.current?.contains(target) || popoverRef.current?.contains(target)), []);

  // Place below the chip, flip above it when only that fits, and always stay
  // inside the viewport. Re-measured when the list changes while open.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const chip = chipRef.current?.getBoundingClientRect();
      const pop = popoverRef.current?.getBoundingClientRect();
      if (!chip) return;
      const height = pop?.height ?? 0;
      const width = pop?.width ?? 0;
      const below = chip.bottom + POPOVER_GAP;
      const above = chip.top - POPOVER_GAP - height;
      const fitsBelow = below + height + VIEWPORT_MARGIN <= window.innerHeight;
      const preferred = !fitsBelow && above >= VIEWPORT_MARGIN ? above : below;
      const top = Math.max(VIEWPORT_MARGIN, Math.min(preferred, window.innerHeight - height - VIEWPORT_MARGIN));
      const left = Math.max(VIEWPORT_MARGIN, Math.min(chip.left, window.innerWidth - width - VIEWPORT_MARGIN));
      setPosition((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, applications.length]);

  // Once placed (it renders hidden until then), move focus into the popover so
  // its list is read and can be scrolled from the keyboard.
  const placed = position !== null;
  useEffect(() => {
    if (open && placed) popoverRef.current?.focus({ preventScroll: true });
  }, [open, placed]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !isInside(document.activeElement)) return;
      // preventDefault, not stopPropagation: an enclosing Modal skips an Esc
      // that something inside it already handled.
      event.preventDefault();
      close(true);
    };
    const onPointer = (event: MouseEvent) => {
      if (!isInside(event.target)) close(false);
    };
    const onFocus = (event: FocusEvent) => {
      if (!isInside(event.target)) close(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('focusin', onFocus);
    };
  }, [open, close, isInside]);

  if (applications.length <= 1) return null;

  const count = applications.length;
  return (
    <span className={className ? `abyan-ds ${className}` : 'abyan-ds'} onClick={(event) => event.stopPropagation()}>
      <button
        ref={chipRef}
        type="button"
        className="ref-apps-chip"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${count} apps: show all applications under ${referenceNo}`}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        {count} apps
      </button>
      {open && createPortal(
        <div className="abyan-ds" onClick={(event) => event.stopPropagation()}>
          <div
            ref={popoverRef}
            role="dialog"
            tabIndex={-1}
            aria-labelledby={titleId}
            className="ref-apps-popover"
            style={position ? { top: position.top, left: position.left } : { visibility: 'hidden', top: 0, left: 0 }}
          >
            <p id={titleId} className="ref-apps-popover-title">
              {applicantName} <span className="ref">· {referenceNo}</span>
            </p>
            <table className="ref-apps-table">
              <thead>
                <tr>
                  <th scope="col">Position</th>
                  <th scope="col">Plantilla</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => {
                  const withdrawn = normalizeStatus(app.status) === 'Withdrawn - Hired Elsewhere';
                  return (
                    <tr key={app.id} className={app.id === currentApplicationId ? 'current' : undefined}
                      aria-current={app.id === currentApplicationId ? 'true' : undefined}>
                      <td>{app.position || '—'}</td>
                      <td>{app.plantillaLabel ?? '—'}</td>
                      <td>
                        <span className={`badge badge-${applicationStatusVariant(app.status)}`}>
                          <span className="badge-dot" aria-hidden="true" />
                          {withdrawn ? withdrawnLabel(app, applications) : (normalizeStatus(app.status) ?? app.status) || '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}
