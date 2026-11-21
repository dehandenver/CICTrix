import { beforeEach, describe, expect, it } from 'vitest';
import {
  DRAFTS_KEY,
  GENERAL_KEY,
  emptyDrafts,
  loadDrafts,
  saveDrafts,
} from './applicationDrafts';

describe('applicationDrafts password sanitization', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('strips password when saving authenticatedEmployeeAccount to sessionStorage', () => {
    const state = {
      ...emptyDrafts(),
      entryMode: 'wizard' as const,
      authenticatedEmployeeAccount: {
        id: 'acct-1',
        username: 'maria.santos',
        password: 'LeakedPassword#123',
        mustChangePassword: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        employee: {
          employeeId: 'EMP-2024-001',
          fullName: 'Maria Santos',
          email: 'maria@example.gov.ph',
          mobileNumber: '+63 900 000 0000',
          dateOfBirth: '',
          age: 0,
          gender: 'Female',
          civilStatus: 'Single',
          nationality: '',
          homeAddress: '',
          emergencyContactName: '',
          emergencyRelationship: '',
          emergencyContactNumber: '',
          sssNumber: '',
          philhealthNumber: '',
          pagibigNumber: '',
          tinNumber: '',
        },
      } as any,
    };

    saveDrafts(state);

    const raw = sessionStorage.getItem(DRAFTS_KEY) ?? '';
    expect(raw).not.toContain('LeakedPassword#123');
    const parsed = JSON.parse(raw);
    expect(parsed.authenticatedEmployeeAccount).toMatchObject({
      id: 'acct-1',
      username: 'maria.santos',
      mustChangePassword: false,
    });
    expect('password' in parsed.authenticatedEmployeeAccount).toBe(false);
  });

  it('strips legacy password from sessionStorage on loadDrafts while keeping form drafts and choices', () => {
    const legacyDraft = {
      ...emptyDrafts(),
      entryMode: 'wizard',
      choices: [{ key: 'slot-1', slotId: 'slot-1', slotNumber: 1, label: 'Plantilla 1', itemNumber: 'IT-1', status: 'open' }],
      drafts: { [GENERAL_KEY]: { first_name: 'Maria', last_name: 'Santos' } },
      authenticatedEmployeeAccount: {
        id: 'acct-1',
        username: 'maria.santos',
        password: 'LegacyStoredPassword#9',
        mustChangePassword: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        employee: {
          employeeId: 'EMP-2024-001',
          fullName: 'Maria Santos',
          email: 'maria@example.gov.ph',
        },
      },
    };
    sessionStorage.setItem(DRAFTS_KEY, JSON.stringify(legacyDraft));

    const loaded = loadDrafts();

    expect(loaded.choices).toHaveLength(1);
    expect((loaded.drafts[GENERAL_KEY] as any).first_name).toBe('Maria');
    expect(loaded.authenticatedEmployeeAccount).not.toBeNull();
    expect('password' in (loaded.authenticatedEmployeeAccount as any)).toBe(false);
    expect(loaded.authenticatedEmployeeAccount?.username).toBe('maria.santos');
    expect(loaded.authenticatedEmployeeAccount?.mustChangePassword).toBe(true);
    expect(loaded.authenticatedEmployeeAccount?.employee.employeeId).toBe('EMP-2024-001');
  });

  it('drops malformed authenticatedEmployeeAccount without discarding unrelated form answers', () => {
    const brokenDraft = {
      ...emptyDrafts(),
      drafts: { [GENERAL_KEY]: { first_name: 'Juan', email: 'juan@example.gov.ph' } },
      authenticatedEmployeeAccount: {
        id: 'acct-bad',
        username: '',
        password: 'SecretPassword',
        employee: { employeeId: '' },
      },
    };
    sessionStorage.setItem(DRAFTS_KEY, JSON.stringify(brokenDraft));

    const loaded = loadDrafts();

    expect(loaded.authenticatedEmployeeAccount).toBeNull();
    expect((loaded.drafts[GENERAL_KEY] as any).first_name).toBe('Juan');
  });
});
