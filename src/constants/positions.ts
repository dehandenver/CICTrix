/**
 * Centralized Position and Department/Office Constants
 * Use these constants across all modules to ensure consistency
 */

/**
 * Standard job positions available in the system
 */
export const POSITIONS = [
  'Administrative Officer',
  'Human Resource Specialist',
  'IT Specialist',
  'Accountant',
  'Budget Officer',
  'Legal Officer',
  'Project Coordinator',
  'Data Analyst'
] as const;

/**
 * Position options formatted for Select components
 */
export const POSITION_OPTIONS = POSITIONS.map(pos => ({
  value: pos,
  label: pos
}));

/**
 * OFFLINE FALLBACK ONLY — do not read this directly in a screen.
 *
 * The canonical department list lives in the Supabase `departments` table; read
 * it through `useDepartmentOptions()` / `useDepartmentNames()` so every screen
 * shows the same offices. This copy exists only so a dropdown still renders
 * something when that table can't be reached, and it will be missing any office
 * added since (e.g. the city offices), which is exactly why reading it directly
 * caused screens to disagree.
 */
export const DEPARTMENTS = [
  'Human Resources',
  'Finance',
  'Information Technology',
  'Operations',
  'Sales & Marketing',
  'Customer Support',
  'Product Management',
] as const;

/**
 * Competencies catalog used by the qualifications dropdown on CREATE JOB and
 * by the competency gap analysis in Succession Planning.
 */
export const COMPETENCIES = [
  'Knowledge of Local Governance',
  'Public Administration Principles',
  'Community Engagement Skills',
  'Project Management in a Public Setting',
  'Fiscal Management / Budgeting for LGU',
  'Transparency and Accountability Practices',
  'Disaster Risk Reduction and Management',
  'Digital Literacy for Government Services',
  'Ethical Conduct and Public Service Standards',
  'Technical Writing for Government Documents',
  'Data and Records Management and Organization',
  'Public Communication Skills',
] as const;

/**
 * Education options for the Qualifications section on CREATE JOB.
 */
export const EDUCATION_LEVELS = [
  'Elementary Level',
  'Elementary Graduate',
  'High School Level',
  'High School Graduate',
  'College Level',
  'College Graduate',
  'Masteral Units',
  'Graduate School',
] as const;

/**
 * @deprecated See DEPARTMENTS — use getDepartmentOptions() from
 * src/lib/api/departments.ts instead.
 */
export const DEPARTMENT_OPTIONS = DEPARTMENTS.map(dept => ({
  value: dept,
  label: dept
}));

/**
 * Display label for an office/department. A specific division wins when set;
 * otherwise the stored short department name (e.g. "Information Technology") is
 * suffixed to read as an office ("Information Technology Department").
 *
 * Shared so every screen that shows an office — Job Posts, Newly Hired — reads
 * identically instead of some showing the raw stored value and others the
 * suffixed one.
 */
export const formatOfficeLabel = (
  department?: string | null,
  division?: string | null,
): string => {
  const divisionName = String(division ?? '').trim();
  if (divisionName) return divisionName;

  const departmentName = String(department ?? '').trim();
  return departmentName ? `${departmentName} Department` : 'Unassigned Department';
};

/**
 * Position to Department mapping
 * Automatically assigns department based on selected position
 */
export const POSITION_TO_DEPARTMENT_MAP: Record<string, string> = {
  'Administrative Officer': 'Operations',
  'Human Resource Specialist': 'Human Resources',
  'IT Specialist': 'Information Technology',
  'Accountant': 'Finance',
  'Budget Officer': 'Finance',
  'Legal Officer': 'Legal',
  'Project Coordinator': 'Operations',
  'Data Analyst': 'Product Management',
};

/**
 * Type definitions for type safety
 */
export type Position = typeof POSITIONS[number];
export type Department = typeof DEPARTMENTS[number];
