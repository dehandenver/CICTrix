/**
 * The submission pipeline shared across IPCR Management (Module 2): the stages a
 * target or accomplishment entry moves through, from not started to forwarded to
 * PM. Used by New Entrant Onboarding (2.1), Target Setting (2.2), and
 * Accomplishment Rating (2.3).
 */

export const IPCR_STAGES = [
  'Not Started',
  'In Draft',
  'Submitted to Office',
  'Returned for Revision',
  'Verified',
  'Forwarded to PM',
] as const;

export type IpcrStage = (typeof IPCR_STAGES)[number];

export type StageTone = 'gray' | 'blue' | 'amber' | 'green' | 'indigo';

export const STAGE_TONE: Record<IpcrStage, StageTone> = {
  'Not Started': 'gray',
  'In Draft': 'blue',
  'Submitted to Office': 'blue',
  'Returned for Revision': 'amber',
  'Verified': 'green',
  'Forwarded to PM': 'indigo',
};

const TONE_COLORS: Record<StageTone, { bg: string; fg: string }> = {
  gray: { bg: 'rgba(107, 114, 128, 0.15)', fg: '#4b5563' },
  blue: { bg: 'rgba(54, 62, 232, 0.1)', fg: '#363EE8' },
  amber: { bg: 'rgba(245, 158, 11, 0.15)', fg: '#b45309' },
  green: { bg: 'rgba(16, 185, 129, 0.14)', fg: '#047857' },
  indigo: { bg: 'rgba(124, 58, 237, 0.12)', fg: '#6d28d9' },
};

/** Inline style for a stage pill. */
export const stagePillStyle = (stage: string): React.CSSProperties => {
  const tone = STAGE_TONE[stage as IpcrStage] ?? 'gray';
  const c = TONE_COLORS[tone];
  return {
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 600,
    background: c.bg,
    color: c.fg,
    whiteSpace: 'nowrap',
  };
};
