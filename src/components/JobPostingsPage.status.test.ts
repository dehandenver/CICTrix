import { describe, expect, it } from 'vitest';
import { toJobPostApplicantStatus } from './JobPostingsPage';

describe('toJobPostApplicantStatus', () => {
  it.each([
    ['For Evaluation', 'Interview Completed'],
    ['Not Selected', 'Rejected'],
    ['Withdrawn - Hired Elsewhere', 'Rejected'],
    ['Not Qualified', 'Not Qualified'],
    ['Disqualified', 'Not Qualified'],
    ['Hired', 'Qualified'],
    ['Qualified', 'Qualified'],
    ['Interview/Exam Scheduled', 'For Interview'],
    ['Under Review', 'Under Review'],
    ['New Application', 'New Application'],
  ])('maps %s to %s for the archive', (stored, expected) => {
    expect(toJobPostApplicantStatus(stored)).toBe(expected);
  });
});
