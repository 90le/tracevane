import { computed, ref } from 'vue';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'openclaw-studio.theme-mode';

const themeMode = ref<ThemeMode>('system');
const systemTheme = ref<ResolvedTheme>('dark');

let initialized = false;
let mediaQueryList: MediaQueryList | null = null;

function readStoredThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    // ignore storage issues
  }
  return 'system';
}

function persistThemeMode(value: ThemeMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, value);
  } catch {
    // ignore storage issues
  }
}

function getResolvedTheme(mode: ThemeMode, systemValue: ResolvedTheme): ResolvedTheme {
  return mode === 'system' ? systemValue : mode;
}

function applyThemeAttributes(): void {
  if (typeof document === 'undefined') return;
  const resolved = getResolvedTheme(themeMode.value, systemTheme.value);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeMode = themeMode.value;
  document.documentElement.style.colorScheme = resolved;
}

function bindSystemThemeListener(): void {
  if (typeof window === 'undefined') return;
  mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
  systemTheme.value = mediaQueryList.matches ? 'dark' : 'light';

  const handleChange = (event: MediaQueryListEvent) => {
    systemTheme.value = event.matches ? 'dark' : 'light';
    if (themeMode.value === 'system') applyThemeAttributes();
  };

  if (typeof mediaQueryList.addEventListener === 'function') {
    mediaQueryList.addEventListener('change', handleChange);
  } else {
    mediaQueryList.addListener(handleChange);
  }
}

export function initializeTheme(): void {
  if (initialized) return;
  initialized = true;
  bindSystemThemeListener();
  themeMode.value = readStoredThemeMode();
  applyThemeAttributes();
}

export function setThemeMode(nextMode: ThemeMode): void {
  themeMode.value = nextMode;
  persistThemeMode(nextMode);
  applyThemeAttributes();
}

export function useThemePreference() {
  initializeTheme();

  return {
    themeMode,
    resolvedTheme: computed<ResolvedTheme>(() => getResolvedTheme(themeMode.value, systemTheme.value)),
    setThemeMode,
  };
}
