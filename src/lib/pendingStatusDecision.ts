/**
 * A Shortlist/Disqualify decision held back for a short Undo window.
 *
 * Disqualify is final and immediately visible to the applicant, so Undo cannot
 * reverse a saved decision. Instead the write is delayed: Undo inside the
 * window cancels it before anything reaches the database. The decision lives
 * outside React so it survives the details page remounting for the next
 * applicant.
 */
import { useSyncExternalStore } from 'react';

export const UNDO_WINDOW_MS = 6000;

export type PendingStatusDecision = {
  applicantId: string;
  applicantName: string;
  label: string;
  /** Status before the decision, so Undo can restore the reviewer's view of it. */
  previousStatus: string;
  commit: () => Promise<void>;
};

let pending: (PendingStatusDecision & { timer: ReturnType<typeof setTimeout> }) | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Writes the pending decision now, if there is one. */
export function flushPendingDecision(): void {
  if (!pending) return;
  const { commit, timer } = pending;
  clearTimeout(timer);
  pending = null;
  emit();
  void commit();
}

/** Holds a decision for the Undo window. Any earlier pending decision is written first. */
export function schedulePendingDecision(decision: PendingStatusDecision): void {
  flushPendingDecision();
  pending = { ...decision, timer: setTimeout(flushPendingDecision, UNDO_WINDOW_MS) };
  emit();
}

/** Drops the pending decision without writing it. Returns what was dropped. */
export function cancelPendingDecision(): PendingStatusDecision | null {
  if (!pending) return null;
  const { timer, ...decision } = pending;
  clearTimeout(timer);
  pending = null;
  emit();
  return decision;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function usePendingDecision(): PendingStatusDecision | null {
  return useSyncExternalStore(subscribe, () => pending);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPendingDecision);
}
