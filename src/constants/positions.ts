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
 * Standard departments/offices in the organization
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
 * Department options formatted for Select components
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
 * Salary grades available in the system
 */
export const SALARY_GRADES = [
  'SG-1', 'SG-2', 'SG-3', 'SG-4', 'SG-5',
  'SG-6', 'SG-7', 'SG-8', 'SG-9', 'SG-10'
] as const;

/**
 * Salary grade options formatted for Select components
 */
export const SALARY_GRADE_OPTIONS = SALARY_GRADES.map(grade => ({
  value: grade,
  label: grade
}));

/**
 * Type definitions for type safety
 */
export type Position = typeof POSITIONS[number];
export type Department = typeof DEPARTMENTS[number];
export type SalaryGrade = typeof SALARY_GRADES[number];
