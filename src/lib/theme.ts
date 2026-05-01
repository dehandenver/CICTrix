/**
 * Professional Theme Manager
 * 
 * Implements a strict design system with:
 * - CSS custom properties for all colors
 * - Pro Dark & Pro Light palettes (WCAG AA compliant)
 * - Smart Auto mode with live OS preference tracking
 * - Persistence via localStorage
 */

export type ThemeMode = 'Light' | 'Dark' | 'Auto';
export type AccentColor = 'Blue' | 'Green' | 'Purple' | 'Orange';

const THEME_KEY = 'cictrix_theme';
const ACCENT_KEY = 'cictrix_accent';

let currentThemeMode: ThemeMode = 'Light';
let mediaQueryListener: ((e: MediaQueryListEvent) => void) | null = null;

const isThemeMode = (v: unknown): v is ThemeMode =>
  v === 'Light' || v === 'Dark' || v === 'Auto';

const isAccentColor = (v: unknown): v is AccentColor =>
  v === 'Blue' || v === 'Green' || v === 'Purple' || v === 'Orange';

export const getStoredTheme = (): ThemeMode => {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (isThemeMode(v)) return v;
  } catch {
    // ignore
  }
  return 'Light';
};

export const getStoredAccent = (): AccentColor => {
  try {
    const v = localStorage.getItem(ACCENT_KEY);
    if (isAccentColor(v)) return v;
  } catch {
    // ignore
  }
  return 'Blue';
};

/**
 * Resolve ThemeMode to actual 'light' or 'dark' string
 */
const resolveTheme = (mode: ThemeMode): 'light' | 'dark' => {
  if (mode === 'Auto') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }
  return mode === 'Dark' ? 'dark' : 'light';
};

/**
 * Apply theme to document root as class name
 * Uses .theme-light or .theme-dark for CSS variable switching
 */
export const applyTheme = (mode: ThemeMode): void => {
  if (typeof document === 'undefined') return;
  
  const resolved = resolveTheme(mode);
  const themeClass = resolved === 'dark' ? 'theme-dark' : 'theme-light';
  
  // Remove both classes first
  document.documentElement.classList.remove('theme-light', 'theme-dark');
  document.documentElement.classList.add(themeClass);
  document.documentElement.setAttribute('data-theme', resolved);
};

export const applyAccent = (color: AccentColor): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-accent', color.toLowerCase());
};

/**
 * Returns true when the current location is part of the RSP module
 * (the only area where the appearance settings should take effect).
 */
const isThemeScopedRoute = (): boolean => {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname;
  if (path.startsWith('/admin/rsp')) return true;
  if (path.startsWith('/admin')) {
    const moduleParam = new URLSearchParams(window.location.search).get('module');
    return moduleParam === 'rsp' || moduleParam === 'settings';
  }
  return false;
};

/**
 * Set theme mode and persist to localStorage.
 * Only applies the theme to <html> if the current route is in scope (RSP).
 */
export const setTheme = (mode: ThemeMode): void => {
  try { localStorage.setItem(THEME_KEY, mode); } catch {
    // ignore quota errors
  }
  currentThemeMode = mode;
  if (isThemeScopedRoute()) {
    applyTheme(mode);
  }

  // Clean up old listener if switching away from Auto
  if (mode !== 'Auto' && mediaQueryListener) {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      if (mql.removeEventListener) {
        mql.removeEventListener('change', mediaQueryListener);
      }
    }
    mediaQueryListener = null;
  }
};

/**
 * Force the document into light mode regardless of stored preference.
 * Used when leaving the scoped (RSP) area.
 */
export const clearScopedTheme = (): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.remove('theme-dark');
  document.documentElement.classList.add('theme-light');
  document.documentElement.setAttribute('data-theme', 'light');
};

/**
 * Reconcile the document theme with the current route. Call on route changes.
 */
export const syncThemeWithRoute = (): void => {
  if (isThemeScopedRoute()) {
    applyTheme(getStoredTheme());
  } else {
    clearScopedTheme();
  }
};

export const setAccent = (color: AccentColor): void => {
  try { localStorage.setItem(ACCENT_KEY, color); } catch {
    // ignore quota errors
  }
  applyAccent(color);
};

/**
 * Initialize theme on app boot
 * - Applies persisted theme & accent
 * - Sets up Auto mode listener if needed
 */
export const initTheme = (): void => {
  const storedMode = getStoredTheme();
  currentThemeMode = storedMode;

  // Theme only applies to the RSP scope; other areas stay light.
  if (isThemeScopedRoute()) {
    applyTheme(storedMode);
  } else {
    clearScopedTheme();
  }

  // Accent applies globally — it just tints primary buttons / highlights.
  applyAccent(getStoredAccent());

  if (storedMode === 'Auto') {
    setupAutoModeListener();
  }
};

/**
 * Set up listener for system color-scheme changes in Auto mode
 */
function setupAutoModeListener(): void {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  
  mediaQueryListener = (e: MediaQueryListEvent) => {
    // Only apply change if user is still in 'Auto' mode
    if (getStoredTheme() === 'Auto') {
      applyTheme('Auto');
    }
  };
  
  if (mql.addEventListener) {
    mql.addEventListener('change', mediaQueryListener);
  }
}
