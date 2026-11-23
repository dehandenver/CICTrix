import { describe, expect, it } from 'vitest';
import { todayManilaIso } from './manilaDate';
import { effectiveState } from '../lib/api/phaseSchedules';
import { effectiveIdpState } from '../lib/api/idpSchedule';

describe('todayManilaIso', () => {
  it('returns the next calendar day during 00:00-07:59 PHT (16:00-23:59 UTC)', () => {
    // 2026-07-01T16:30:00Z is 2026-07-02 00:30 in Asia/Manila
    const earlyMorningPht = new Date('2026-07-01T16:30:00Z');
    expect(todayManilaIso(earlyMorningPht)).toBe('2026-07-02');
  });

  it('matches the UTC date during 08:00-23:59 PHT (00:00-15:59 UTC)', () => {
    // 2026-07-02T07:00:00Z is 2026-07-02 15:00 in Asia/Manila
    const afternoonPht = new Date('2026-07-02T07:00:00Z');
    expect(todayManilaIso(afternoonPht)).toBe('2026-07-02');
  });

  it('handles month and year rollovers at midnight PHT', () => {
    // 2026-12-31T16:00:00Z is 2027-01-01 00:00 in Asia/Manila
    expect(todayManilaIso(new Date('2026-12-31T16:00:00Z'))).toBe('2027-01-01');
  });

  it('drives IPCR and IDP Auto phase gates on the PHT start and deadline dates', () => {
    const startMidnightPht = todayManilaIso(new Date('2026-07-01T16:05:00Z')); // 2026-07-02 00:05 PHT
    const pastDeadlineMidnightPht = todayManilaIso(new Date('2026-07-10T16:05:00Z')); // 2026-07-11 00:05 PHT

    expect(
      effectiveState({ mode: 'Auto', start_date: '2026-07-02', deadline_date: '2026-07-10' }, startMidnightPht),
    ).toBe('Open');
    expect(
      effectiveState({ mode: 'Auto', start_date: '2026-07-02', deadline_date: '2026-07-10' }, pastDeadlineMidnightPht),
    ).toBe('Closed');

    expect(
      effectiveIdpState({ mode: 'Auto', opensAt: '2026-07-02', closesAt: '2026-07-10' }, startMidnightPht),
    ).toBe('Open');
    expect(
      effectiveIdpState({ mode: 'Auto', opensAt: '2026-07-02', closesAt: '2026-07-10' }, pastDeadlineMidnightPht),
    ).toBe('Closed');
  });
});
