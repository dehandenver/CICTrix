import { useEffect, useState } from 'react';

import { DEPARTMENTS } from '../constants/positions';
import { getDepartmentOptions, type DepartmentOption } from '../lib/api/departments';

/**
 * Department options for every screen in the system.
 *
 * The canonical `departments` table in Supabase is the single source of truth —
 * this hook is the one place that reads it, so a department added there shows up
 * everywhere (Job Posts, Newly Hired, the applicant form, PM, RSP) at once
 * instead of each screen carrying its own hardcoded copy that silently drifts.
 *
 * The static DEPARTMENTS constant is an offline fallback only: it's used when the
 * table can't be read, so a dropdown never renders empty.
 */

const FALLBACK_OPTIONS: DepartmentOption[] = DEPARTMENTS.map((name) => ({
  value: name,
  label: name,
}));

// Module-level cache: the department list is small and effectively static for a
// session, so every mounting screen shares one fetch rather than re-querying.
let cachedOptions: DepartmentOption[] | null = null;
let inFlight: Promise<DepartmentOption[]> | null = null;

const loadDepartmentOptions = (): Promise<DepartmentOption[]> => {
  if (cachedOptions) return Promise.resolve(cachedOptions);

  if (!inFlight) {
    inFlight = getDepartmentOptions()
      .then((options) => {
        // An empty result means the table is unreadable/unseeded — keep the
        // fallback rather than caching a blank list.
        cachedOptions = options.length > 0 ? options : FALLBACK_OPTIONS;
        return cachedOptions;
      })
      .catch((error) => {
        console.warn('[useDepartmentOptions] departments lookup failed, using fallback:', error);
        return FALLBACK_OPTIONS;
      })
      .finally(() => {
        inFlight = null;
      });
  }

  return inFlight;
};

/** Clears the cache so the next consumer re-reads the departments table. */
export const invalidateDepartmentOptions = (): void => {
  cachedOptions = null;
};

export const useDepartmentOptions = (): DepartmentOption[] => {
  const [options, setOptions] = useState<DepartmentOption[]>(cachedOptions ?? FALLBACK_OPTIONS);

  useEffect(() => {
    let active = true;
    void loadDepartmentOptions().then((loaded) => {
      if (active) setOptions(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  return options;
};

/** Names only — for screens that render a plain string dropdown. */
export const useDepartmentNames = (): string[] => useDepartmentOptions().map((option) => option.value);
