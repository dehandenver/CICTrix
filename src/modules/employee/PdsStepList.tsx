// Presentational step list for the Personal Data Sheet sections
// (docs/plans/2026-10-06-pds-step-list.md). Vertical list at >=1024px, compact
// strip below; both render and CSS picks one. The parent owns all state.

import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import './pds-step-list.css';

export interface PdsStep<Id extends string = string> { id: Id; label: string; numeral: string }
export interface PdsStepListProps<Id extends string = string> {
  steps: PdsStep<Id>[];
  activeId: Id;
  savedIds: ReadonlySet<Id>;
  onSelect: (id: Id) => void;
}

const CHECK_SIZE = 14;
const ICON_STROKE = 1.75;
const CHEVRON_SIZE = 16;

export function PdsStepList<Id extends string>({ steps, activeId, savedIds, onSelect }: PdsStepListProps<Id>) {
  const activeIndex = steps.findIndex((s) => s.id === activeId);
  const current = steps[activeIndex];
  const prev = activeIndex > 0 ? steps[activeIndex - 1] : undefined;
  const next = activeIndex >= 0 && activeIndex < steps.length - 1 ? steps[activeIndex + 1] : undefined;
  const savedCount = steps.filter((s) => savedIds.has(s.id)).length;

  return (
    <>
      <nav className="pds-steps" aria-label="PDS sections">
        <ol className="pds-steps__list">
          {steps.map((step) => {
            const saved = savedIds.has(step.id);
            return (
              <li key={step.id} className={`pds-steps__item${saved ? ' pds-steps__item--saved' : ''}`}>
                <button
                  type="button"
                  className="pds-steps__btn"
                  aria-current={step.id === activeId ? 'step' : undefined}
                  onClick={() => onSelect(step.id)}
                >
                  <span className="pds-steps__dot" aria-hidden="true">
                    {saved ? <Check size={CHECK_SIZE} strokeWidth={ICON_STROKE} /> : step.numeral}
                  </span>
                  <span className="pds-steps__label">{step.label}</span>
                  {saved && <span className="pds-steps__sr"> (saved)</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="pds-compact" role="group" aria-label="PDS progress">
        <div className="pds-compact__top">
          <span>Step {activeIndex + 1} of {steps.length}</span>
          <span>{savedCount} saved</span>
        </div>
        <div className="pds-compact__bar" aria-hidden="true">
          {steps.map((step) => (
            <span
              key={step.id}
              className={`pds-compact__seg${
                step.id === activeId ? ' pds-compact__seg--current' : savedIds.has(step.id) ? ' pds-compact__seg--saved' : ''
              }`}
            />
          ))}
        </div>
        <div className="pds-compact__nav">
          <button type="button" className="pds-compact__btn" disabled={!prev} onClick={() => prev && onSelect(prev.id)}>
            <ChevronLeft size={CHEVRON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
            <span>Previous{prev ? `: ${prev.numeral}. ${prev.label}` : ''}</span>
          </button>
          <span className="pds-compact__title">{current ? `${current.numeral}. ${current.label}` : ''}</span>
          <button type="button" className="pds-compact__btn pds-compact__btn--next" disabled={!next} onClick={() => next && onSelect(next.id)}>
            <span>Next{next ? `: ${next.numeral}. ${next.label}` : ''}</span>
            <ChevronRight size={CHEVRON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
          </button>
        </div>
        <div className="pds-compact__jump">
          <label htmlFor="pds-jump-select">Jump to section</label>
          <select
            id="pds-jump-select"
            className="pds-compact__select"
            value={activeId}
            onChange={(e) => onSelect(e.target.value as Id)}
          >
            {steps.map((step) => (
              <option key={step.id} value={step.id}>{`${step.numeral}. ${step.label}`}</option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}
