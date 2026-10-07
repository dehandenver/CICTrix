import { describe, expect, it } from 'vitest';
import { emptySubmission, type IdpSubmission } from './api/idpSubmissions';
import { matchOffice, officeTagShares, tagSelectionsByOffice, topTagPerOffice } from './idpAnalytics';

const sub = (office: string, careerNeeds: string[], personalGoals: string[] = []): IdpSubmission => ({
  ...emptySubmission(`EMP-${Math.random()}`, 2026),
  office,
  careerNeeds,
  personalGoals,
});

const ENGINEER = 'OFFICE OF THE CITY ENGINEER';
const LEGAL = 'OFFICE OF THE CITY LEGAL OFFICER';

describe('tagSelectionsByOffice', () => {
  it('counts each tag per office, career tags first, in form order', () => {
    const rows = tagSelectionsByOffice([
      sub(ENGINEER, ['JOB SPECIFIC TRAINING', 'COMPUTER LITERACY'], ['COMMUNICATION SKILLS']),
      sub(ENGINEER, ['JOB SPECIFIC TRAINING']),
      sub(LEGAL, ['COMPUTER LITERACY']),
    ]);
    expect(rows.map((r) => r.tag)).toEqual([
      'JOB SPECIFIC TRAINING',
      'LEADERSHIP AND SUPERVISORY TRAINING',
      'COMPUTER LITERACY',
      'FINANCIAL LITERACY',
      'GENERAL HEALTH AND WELLNESS',
      'COMMUNICATION SKILLS',
      'PERSONAL DEVELOPMENT',
    ]);
    const job = rows.find((r) => r.tag === 'JOB SPECIFIC TRAINING')!;
    expect(job.byOffice).toEqual({ [ENGINEER]: 2 });
    expect(job.total).toBe(2);
    const computer = rows.find((r) => r.tag === 'COMPUTER LITERACY')!;
    expect(computer.byOffice).toEqual({ [ENGINEER]: 1, [LEGAL]: 1 });
    expect(rows.find((r) => r.tag === 'COMMUNICATION SKILLS')!.kind).toBe('personal');
  });

  it('ignores tag case and unknown tags', () => {
    const rows = tagSelectionsByOffice([sub(ENGINEER, ['computer literacy', 'BASKET WEAVING'])]);
    expect(rows.find((r) => r.tag === 'COMPUTER LITERACY')!.total).toBe(1);
    expect(rows.reduce((n, r) => n + r.total, 0)).toBe(1);
  });
});

describe('officeTagShares', () => {
  it('gives the share of that office’s submitters who picked each tag', () => {
    const subs = [
      sub(ENGINEER, ['JOB SPECIFIC TRAINING'], ['FINANCIAL LITERACY']),
      sub(ENGINEER, ['JOB SPECIFIC TRAINING']),
      sub(ENGINEER, []),
      sub(LEGAL, ['COMPUTER LITERACY']),
    ];
    const shares = officeTagShares(subs, 'Office of The City Engineer');
    expect(shares.find((s) => s.tag === 'JOB SPECIFIC TRAINING')).toMatchObject({ count: 2, share: 67 });
    expect(shares.find((s) => s.tag === 'FINANCIAL LITERACY')).toMatchObject({ count: 1, share: 33 });
    expect(shares.find((s) => s.tag === 'COMPUTER LITERACY')).toMatchObject({ count: 0, share: 0 });
  });

  it('returns zero shares for an office with no submissions', () => {
    expect(officeTagShares([], ENGINEER).every((s) => s.share === 0)).toBe(true);
  });
});

describe('topTagPerOffice', () => {
  it('lists each office with its most-picked tag, highest share first', () => {
    const rows = topTagPerOffice([
      sub(ENGINEER, ['JOB SPECIFIC TRAINING']),
      sub(ENGINEER, ['COMPUTER LITERACY', 'JOB SPECIFIC TRAINING']),
      sub(LEGAL, ['COMPUTER LITERACY']),
      sub(LEGAL, []),
    ]);
    expect(rows).toEqual([
      { office: ENGINEER, submitters: 2, tag: 'JOB SPECIFIC TRAINING', label: 'Job specific', share: 100 },
      { office: LEGAL, submitters: 2, tag: 'COMPUTER LITERACY', label: 'Computer literacy', share: 50 },
    ]);
  });

  it('reports no top tag when nobody in the office ticked one', () => {
    expect(topTagPerOffice([sub(LEGAL, [])])).toEqual([
      { office: LEGAL, submitters: 1, tag: null, label: '—', share: 0 },
    ]);
  });
});

describe('matchOffice', () => {
  it('matches office names ignoring case and spacing', () => {
    expect(matchOffice('Office of The City Engineer', [LEGAL, ENGINEER])).toBe(ENGINEER);
    expect(matchOffice('Legal', [LEGAL, ENGINEER])).toBeNull();
  });
});
