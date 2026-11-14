import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open modals, newest last. Only the top one answers Esc and traps Tab. */
const stack: symbol[] = [];
let scrollLocks = 0;
let savedOverflow = '';

interface Options {
  open: boolean;
  dismissible: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement>;
  bodyRef: RefObject<HTMLElement>;
  closeRef: RefObject<HTMLElement>;
  initialFocusRef?: RefObject<HTMLElement>;
}

/**
 * §9.10 behaviour: focus in, Tab trapped, Esc closes (top modal only), page
 * scroll locked, and focus returned to the opener on close.
 */
export const useModalBehavior = ({ open, dismissible, onClose, panelRef, bodyRef, closeRef, initialFocusRef }: Options) => {
  const latest = useRef({ dismissible, onClose });
  latest.current = { dismissible, onClose };

  useEffect(() => {
    if (!open) return undefined;
    const id = Symbol('modal');
    stack.push(id);
    const opener = document.activeElement as HTMLElement | null;

    if (scrollLocks++ === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    const first = initialFocusRef?.current
      ?? bodyRef.current?.querySelector<HTMLElement>('[data-autofocus]')
      ?? bodyRef.current?.querySelector<HTMLElement>('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])')
      // A non-dismissible modal disables Close, and a disabled button can't take focus.
      ?? (closeRef.current?.matches(':disabled') ? null : closeRef.current)
      ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)
      ?? panelRef.current;
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === 'Escape') {
        // A field that used Esc itself (closing a combobox menu) calls preventDefault.
        if (e.defaultPrevented) return;
        if (latest.current.dismissible) { e.stopPropagation(); latest.current.onClose(); }
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest('[hidden], [aria-hidden="true"]'));
      if (items.length === 0) { e.preventDefault(); return; }
      const head = items[0];
      const tail = items[items.length - 1];
      const inside = panelRef.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === head || !inside)) { e.preventDefault(); tail.focus(); }
      else if (!e.shiftKey && (document.activeElement === tail || !inside)) { e.preventDefault(); head.focus(); }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      const at = stack.indexOf(id);
      if (at >= 0) stack.splice(at, 1);
      if (--scrollLocks === 0) document.body.style.overflow = savedOverflow;
      if (opener && document.contains(opener)) opener.focus();
    };
    // Focus and listeners are set once per opening; later prop changes go through `latest`.
  }, [open, panelRef, bodyRef, closeRef, initialFocusRef]);
};
