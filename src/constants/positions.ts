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
 * @deprecated Source of truth is now the `departments` table (migration 006).
 * Use listDepartments() / getDepartmentOptions() from src/lib/api/departments.ts.
 * This constant is retained as an offline fallback during phase 1 and should
 * not be referenced by new code.
 */
export const DEPARTMENTS = [
  'Human Resources',
  'Finance',
  'Information Technology',
  'Operations',
  'Sales & Marketing',
  'Customer Support',
  'Legal',
  'Product Management'
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
