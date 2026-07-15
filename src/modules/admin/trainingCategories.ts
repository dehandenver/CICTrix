/**
 * The four training categories, shared by every L&D page.
 *
 * These live here rather than in LNDDashboard so that TrainingCourses and
 * SeminarEnrollment can import them without a circular dependency (LNDDashboard
 * imports both of those components).
 *
 * Category is a closed set, not a free-text field: an event chip must mean the
 * same thing on the dashboard, the calendar, the course list, and the enrollment
 * page. Adding a fifth category means adding a fifth color here *and* widening
 * the training_sessions_category_check constraint.
 */
export const TRAINING_CATEGORIES = [
  'Cultural Transformation',
  'Employee Development',
  'Leadership',
  'Technical',
] as const;

export type TrainingCategory = (typeof TRAINING_CATEGORIES)[number];

/** Fixed category colors — the single definition all L&D pages read from. */
export const CATEGORY_COLORS: Record<string, string> = {
  'Cultural Transformation': '#7c3aed',
  'Employee Development': '#0891b2',
  'Leadership': '#d97706',
  'Technical': '#16a34a',
};

/** Neutral gray for events whose category is missing or no longer recognized. */
export const UNCATEGORIZED_COLOR = '#94a3b8';

export const categoryColor = (category: string | null | undefined): string =>
  (category && CATEGORY_COLORS[category]) || UNCATEGORIZED_COLOR;
