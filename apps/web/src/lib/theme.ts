export const THEME_STORAGE_KEY = 'eq-theme';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export function systemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? systemTheme() : preference;
}

/**
 * Light is the product's designed default — an untouched install must not
 * silently follow the visitor's OS preference into dark. "System" stays
 * available as an explicit choice in the toggle; it just isn't where a
 * first-ever load lands.
 */
export function readStoredPreference(): ThemePreference {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'light';
}

export function persistPreference(preference: ThemePreference): void {
  window.localStorage.setItem(THEME_STORAGE_KEY, preference);
}

export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference);
  document.documentElement.setAttribute('data-theme', resolved);
  return resolved;
}

/**
 * Inlined into a <script> in the root layout so the theme is set before
 * first paint — before React hydrates and before the pre-script
 * prefers-color-scheme fallback in the generated stylesheet would
 * otherwise be the only thing deciding colours. Self-contained on purpose:
 * it runs outside any bundle, so it cannot import readStoredPreference or
 * resolveTheme above — the logic is duplicated in serialized form instead.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k='${THEME_STORAGE_KEY}';var s=localStorage.getItem(k);var pref=(s==='light'||s==='dark'||s==='system')?s:'light';var resolved=pref==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):pref;document.documentElement.setAttribute('data-theme',resolved);}catch(e){}})();`;
