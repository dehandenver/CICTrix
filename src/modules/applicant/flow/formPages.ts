/**
 * Step 2 (Fill up application) is split into short pages. Each page lists the
 * error fields it shows, so "Next" validates only what the applicant can see.
 * Validation itself is unchanged: the same validators run over the whole form
 * and their errors are filtered to the page.
 */
import type { ValidationErrors } from '../../../types/applicant.types';

export interface FormPage {
  title: string;
  /** Error keys whose inputs render on this page. */
  fields: Array<keyof ValidationErrors>;
  /** The documents page also owns the file-upload error. */
  documents?: boolean;
}

export const FORM_PAGES: FormPage[] = [
  {
    title: 'Application type and personal information',
    fields: ['employee_id', 'current_position', 'current_department', 'first_name', 'middle_name', 'last_name', 'gender'],
  },
  {
    title: 'Contact, address and position',
    fields: ['email', 'contact_number', 'address', 'position', 'item_number', 'office'],
  },
  {
    title: 'Education and government ID',
    fields: ['gov_id_type', 'gov_id_expiration'],
  },
  {
    title: 'Relevant work experience',
    fields: ['work_experiences'],
  },
  {
    title: 'Documents',
    fields: [],
    documents: true,
  },
];

export const FORM_PAGE_COUNT = FORM_PAGES.length;

/** Clamps a stored page number to a real page (1-based). */
export const clampFormPage = (page: unknown): number => {
  const n = Number(page);
  return Number.isInteger(n) ? Math.min(Math.max(n, 1), FORM_PAGE_COUNT) : 1;
};

/** The errors that belong to one page (1-based). */
export const pageErrors = (page: number, errors: ValidationErrors, fileError: string) => {
  const def = FORM_PAGES[clampFormPage(page) - 1];
  const scoped: ValidationErrors = {};
  for (const field of def.fields) {
    // Values differ by key (strings, or per-entry objects for work_experiences).
    if (errors[field]) (scoped as Record<string, unknown>)[field] = errors[field];
  }
  const scopedFileError = def.documents ? fileError : '';
  return {
    errors: scoped,
    fileError: scopedFileError,
    count: Object.keys(scoped).length + (scopedFileError ? 1 : 0),
  };
};

/** The first page (1-based) that has an error, or null when every page is valid. */
export const firstPageWithErrors = (errors: ValidationErrors, fileError: string): number | null => {
  for (let page = 1; page <= FORM_PAGE_COUNT; page += 1) {
    if (pageErrors(page, errors, fileError).count > 0) return page;
  }
  return null;
};
