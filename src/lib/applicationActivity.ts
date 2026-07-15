export const DISQUALIFICATION_REASON_OPTIONS = [
  { value: 'incomplete_documents', label: 'Incomplete Documents' },
  { value: 'failed_qualifications', label: 'Failed Qualifications' },
  { value: 'failed_interview', label: 'Failed Interview' },
  { value: 'missing_requirements', label: 'Missing Requirements' },
  { value: 'other', label: 'Other' },
] as const;

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  DISQUALIFICATION_REASON_OPTIONS.map((option) => [option.value, option.label]),
);

export const getDisqualificationReasonLabel = (value?: string | null): string => {
  const trimmed = value?.trim();
  if (!trimmed) return 'Other';
  if (CATEGORY_LABELS[trimmed]) return CATEGORY_LABELS[trimmed];
  const directMatch = DISQUALIFICATION_REASON_OPTIONS.find((option) => option.label === trimmed);
  if (directMatch) return directMatch.label;
  return trimmed;
};

export const buildDisqualificationActivityDescription = (
  category?: string | null,
  note?: string | null,
  includeCategory = true,
): string => {
  const label = getDisqualificationReasonLabel(category);
  const trimmedNote = note?.trim();

  if (!trimmedNote) return label;
  if (!includeCategory) return trimmedNote;

  return `${label}: ${trimmedNote}`;
};

export const parseDisqualificationReason = (reason?: string | null) => {
  const trimmed = reason?.trim();
  if (!trimmed) {
    return { label: 'Other', note: '', value: null as string | null };
  }

  const separatorIndex = trimmed.indexOf(':');
  if (separatorIndex === -1) {
    return { label: getDisqualificationReasonLabel(trimmed), note: '', value: trimmed };
  }

  const label = trimmed.slice(0, separatorIndex).trim();
  const note = trimmed.slice(separatorIndex + 1).trim();
  return {
    label: getDisqualificationReasonLabel(label),
    note,
    value: label,
  };
};
