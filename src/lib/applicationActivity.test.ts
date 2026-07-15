import { describe, expect, it } from 'vitest';
import {
  buildDisqualificationActivityDescription,
  getDisqualificationReasonLabel,
} from './applicationActivity';

describe('application activity helpers', () => {
  it('formats the reason label for known categories', () => {
    expect(getDisqualificationReasonLabel('failed_qualifications')).toBe('Failed Qualifications');
    expect(getDisqualificationReasonLabel('other')).toBe('Other');
  });

  it('builds a visible applicant-facing description with the provided note', () => {
    const description = buildDisqualificationActivityDescription(
      'incomplete_documents',
      'Please resubmit the missing certificates.',
      true,
    );

    expect(description).toContain('Incomplete Documents');
    expect(description).toContain('Please resubmit the missing certificates.');
  });
});
