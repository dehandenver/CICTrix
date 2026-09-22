import { describe, expect, it } from 'vitest';
import {
  closedReason,
  effectiveIdpState,
  toEmbeddableFormUrl,
  EMPTY_IDP_CONFIG,
  type IdpFormConfig,
} from './idpSchedule';

const config = (over: Partial<IdpFormConfig> = {}): IdpFormConfig => ({
  ...EMPTY_IDP_CONFIG,
  ...over,
});

describe('effectiveIdpState', () => {
  it('forces Open regardless of the dates', () => {
    // A deadline that slipped is the reason this override exists, so dates
    // already in the past must not win over it.
    const c = config({ mode: 'Open', opensAt: '2020-01-01', closesAt: '2020-01-02' });
    expect(effectiveIdpState(c, '2026-09-22')).toBe('Open');
  });

  it('forces Closed even inside the window', () => {
    const c = config({ mode: 'Closed', opensAt: '2026-09-01', closesAt: '2026-12-31' });
    expect(effectiveIdpState(c, '2026-09-22')).toBe('Closed');
  });

  it('opens on Auto inside the window, inclusive of both ends', () => {
    const c = config({ mode: 'Auto', opensAt: '2026-09-01', closesAt: '2026-09-30' });
    expect(effectiveIdpState(c, '2026-09-01')).toBe('Open');
    expect(effectiveIdpState(c, '2026-09-15')).toBe('Open');
    expect(effectiveIdpState(c, '2026-09-30')).toBe('Open');
  });

  it('closes on Auto outside the window', () => {
    const c = config({ mode: 'Auto', opensAt: '2026-09-01', closesAt: '2026-09-30' });
    expect(effectiveIdpState(c, '2026-08-31')).toBe('Closed');
    expect(effectiveIdpState(c, '2026-10-01')).toBe('Closed');
  });

  it('stays closed on Auto when either date is missing', () => {
    // A half-configured window must not read as "open forever" — that is how a
    // form silently stays collectable after a cycle ends.
    expect(effectiveIdpState(config({ mode: 'Auto', opensAt: '2026-09-01' }), '2026-09-22')).toBe('Closed');
    expect(effectiveIdpState(config({ mode: 'Auto', closesAt: '2026-09-30' }), '2026-09-22')).toBe('Closed');
    expect(effectiveIdpState(config({ mode: 'Auto' }), '2026-09-22')).toBe('Closed');
  });

  it('treats a missing config as closed', () => {
    expect(effectiveIdpState(null)).toBe('Closed');
  });
});

describe('toEmbeddableFormUrl', () => {
  it('adds embedded=true to a viewform link', () => {
    const out = toEmbeddableFormUrl('https://docs.google.com/forms/d/e/1FAIpQL/viewform');
    expect(out).toContain('/viewform');
    expect(out).toContain('embedded=true');
  });

  it('rewrites an edit link to the response view', () => {
    // Pasting the edit URL is easy to do and would embed the editor, which
    // employees cannot open.
    const out = toEmbeddableFormUrl('https://docs.google.com/forms/d/e/1FAIpQL/edit');
    expect(out).toContain('/viewform');
    expect(out).not.toContain('/edit');
  });

  it('accepts a forms.gle short link unchanged', () => {
    const out = toEmbeddableFormUrl('https://forms.gle/abc123');
    expect(out).toBe('https://forms.gle/abc123');
  });

  it('rejects a Google Drive folder link', () => {
    // The exact mistake in the original requirements doc. It looks like a form
    // link and embeds as a blank frame rather than failing loudly.
    expect(
      toEmbeddableFormUrl('https://drive.google.com/drive/u/0/folders/1QFffk5g12dPJCA'),
    ).toBeNull();
  });

  it('rejects a Google Sheets link', () => {
    expect(
      toEmbeddableFormUrl('https://docs.google.com/spreadsheets/d/1lXzZF7/edit?gid=1217248967'),
    ).toBeNull();
  });

  it('rejects empty and malformed input', () => {
    expect(toEmbeddableFormUrl('')).toBeNull();
    expect(toEmbeddableFormUrl('   ')).toBeNull();
    expect(toEmbeddableFormUrl('not a url')).toBeNull();
  });

  it('does not treat a lookalike host as Google', () => {
    // `docs.google.com.evil.test` must not pass a naive substring check.
    expect(toEmbeddableFormUrl('https://docs.google.com.evil.test/forms/d/e/x/viewform')).toBeNull();
  });
});

describe('closedReason', () => {
  it('explains a not-yet-scheduled window', () => {
    expect(closedReason(config({ mode: 'Auto' }), '2026-09-22')).toMatch(/not scheduled|hasn|has not/i);
  });

  it('names the opening date when the window is still ahead', () => {
    const c = config({ mode: 'Auto', opensAt: '2026-10-01', closesAt: '2026-10-31' });
    expect(closedReason(c, '2026-09-22')).toContain('2026-10-01');
  });

  it('names the closing date once the window has passed', () => {
    const c = config({ mode: 'Auto', opensAt: '2026-08-01', closesAt: '2026-08-31' });
    expect(closedReason(c, '2026-09-22')).toContain('2026-08-31');
  });

  it('is empty while the form is open', () => {
    const c = config({ mode: 'Auto', opensAt: '2026-09-01', closesAt: '2026-09-30' });
    expect(closedReason(c, '2026-09-22')).toBe('');
  });
});
