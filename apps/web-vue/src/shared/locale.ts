import { computed, ref } from 'vue';

export type Locale = 'zh' | 'en';

const LOCALE_STORAGE_KEY = 'openclaw-studio.locale';
const locale = ref<Locale>('zh');
let initialized = false;

function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return 'zh';
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function readStoredLocale(): Locale {
  if (typeof window === 'undefined') return detectBrowserLocale();
  try {
    const value = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (value === 'zh' || value === 'en') return value;
  } catch {
    // ignore
  }
  return detectBrowserLocale();
}

function persistLocale(value: Locale): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, value);
  } catch {
    // ignore
  }
}

export function initializeLocale(): void {
  if (initialized) return;
  initialized = true;
  locale.value = readStoredLocale();
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale.value === 'zh' ? 'zh-CN' : 'en';
  }
}

export function setLocale(nextLocale: Locale): void {
  locale.value = nextLocale;
  persistLocale(nextLocale);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = nextLocale === 'zh' ? 'zh-CN' : 'en';
  }
}

export function useLocalePreference() {
  initializeLocale();

  const text = (zh: string, en: string): string => (locale.value === 'zh' ? zh : en);

  return {
    locale,
    setLocale,
    isEnglish: computed(() => locale.value === 'en'),
    text,
  };
}
