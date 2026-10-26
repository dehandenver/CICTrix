import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * A portal's active in-page section, kept in `?module=` so a refresh returns
 * to it (L&D and PM switch sections in place rather than by route).
 *
 * The fallback section is written as no param at all. Switching sections
 * replaces the history entry and drops the previous section's own params.
 *
 * `enabled = false` (a super admin's view-only mount) ignores and never writes
 * the param: on /admin, `?module=` already names the division being viewed.
 */
export function useSectionParam<T extends string>(
  sections: readonly T[],
  fallback: T,
  enabled = true,
): [T, (next: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('module');
  const section = enabled && raw && (sections as readonly string[]).includes(raw) ? (raw as T) : fallback;

  const setSection = useCallback(
    (next: T) => {
      if (!enabled) return;
      setParams(next === fallback ? {} : { module: next }, { replace: true });
    },
    [enabled, fallback, setParams],
  );

  return [section, setSection];
}
