/**
 * Shared presentational helpers for the admin "module" pages (System
 * Administration, IPCR Management, …). Keeps the look consistent without each
 * subtab re-declaring the same style objects.
 */

import type { CSSProperties, ReactNode } from 'react';

const ADMIN_SESSION_KEY = 'cictrix_admin_session';

/** Identifier (email) of the signed-in admin, for audit/attribution fields. */
export const getCurrentAdminEmail = (): string => {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return 'super-admin';
    const parsed = JSON.parse(raw) as { email?: string };
    return parsed?.email || 'super-admin';
  } catch {
    return 'super-admin';
  }
};

export const ui = {
  card: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    overflow: 'hidden',
  } as CSSProperties,
  cardHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontWeight: 600,
    color: '#1f2937',
  } as CSSProperties,
  emptyBox: {
    padding: '32px',
    textAlign: 'center',
    color: '#6b7280',
    fontSize: '14px',
    lineHeight: 1.5,
  } as CSSProperties,
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#1f2937',
    margin: '0 0 14px',
  } as CSSProperties,
  th: {
    padding: '12px 16px',
    fontWeight: 600,
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
  } as CSSProperties,
  td: {
    padding: '14px 16px',
    color: '#374151',
    verticalAlign: 'top',
  } as CSSProperties,
  input: {
    width: '100%',
    padding: '9px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    background: '#fff',
    color: '#111827',
  } as CSSProperties,
  miniLabel: {
    display: 'block',
    fontSize: '12px',
    fontWeight: 600,
    color: '#6b7280',
    marginBottom: '5px',
  } as CSSProperties,
  primaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '9px 16px',
    background: '#363EE8',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  } as CSSProperties,
  secondaryBtn: {
    padding: '9px 16px',
    background: '#fff',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  } as CSSProperties,
  bannerOk: {
    margin: '0 0 16px',
    padding: '12px 16px',
    background: 'rgba(40, 167, 69, 0.1)',
    border: '1px solid rgba(40, 167, 69, 0.3)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
  } as CSSProperties,
  bannerErr: {
    margin: '0 0 16px',
    padding: '12px 16px',
    background: 'rgba(220, 38, 38, 0.1)',
    border: '1px solid rgba(220, 38, 38, 0.3)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
  } as CSSProperties,
};

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ marginBottom: '14px' }}>
    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
      {label}
    </label>
    {children}
  </div>
);
