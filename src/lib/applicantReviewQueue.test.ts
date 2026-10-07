import { describe, expect, it } from 'vitest';
import { nextUndecidedIndex, reviewOutcome, type ReviewQueueEntry } from './applicantReviewQueue';

const entry = (id: string, status: string): ReviewQueueEntry => ({ id, name: id, status });

describe('reviewOutcome', () => {
  it('treats screening-stage and unknown statuses as undecided', () => {
    expect(reviewOutcome('Submitted')).toBe('undecided');
    expect(reviewOutcome('Under Review')).toBe('undecided');
    expect(reviewOutcome('Pending')).toBe('undecided');
    expect(reviewOutcome('')).toBe('undecided');
  });

  it('treats Shortlisted and later as shortlisted', () => {
    expect(reviewOutcome('Shortlisted')).toBe('shortlisted');
    expect(reviewOutcome('Recommended for Hiring')).toBe('shortlisted');
    expect(reviewOutcome('Qualified')).toBe('shortlisted');
  });

  it('treats closed-out statuses as disqualified', () => {
    expect(reviewOutcome('Not Qualified')).toBe('disqualified');
    expect(reviewOutcome('Disqualified')).toBe('disqualified');
    expect(reviewOutcome('Not Selected')).toBe('disqualified');
  });
});

describe('nextUndecidedIndex', () => {
  it('skips decided applicants', () => {
    const queue = [entry('a', 'Submitted'), entry('b', 'Shortlisted'), entry('c', 'Submitted')];
    expect(nextUndecidedIndex(queue, 0)).toBe(2);
  });

  it('wraps round to earlier undecided applicants', () => {
    const queue = [entry('a', 'Submitted'), entry('b', 'Not Qualified'), entry('c', 'Submitted')];
    expect(nextUndecidedIndex(queue, 2)).toBe(0);
  });

  it('returns -1 when everyone else is decided', () => {
    const queue = [entry('a', 'Shortlisted'), entry('b', 'Submitted'), entry('c', 'Disqualified')];
    expect(nextUndecidedIndex(queue, 1)).toBe(-1);
  });
});
