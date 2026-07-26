import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/en/common.json';
import uz from '@/locales/uz/common.json';
import { readStorage, writeStorage } from '@/utils/storage';

export const SUPPORTED_LANGUAGES = ['en', 'uz'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const STORAGE_KEY = 'ems-lang';

function isSupported(value: string | null): value is SupportedLanguage {
  return value !== null && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

function detectInitialLanguage(): SupportedLanguage {
  const stored = readStorage(STORAGE_KEY);
  if (isSupported(stored)) return stored;

  const browserLang = navigator.language.slice(0, 2);
  return isSupported(browserLang) ? browserLang : 'en';
}

export function setLanguage(lang: SupportedLanguage): void {
  writeStorage(STORAGE_KEY, lang);
  void i18next.changeLanguage(lang);
  document.documentElement.lang = lang;
}

void i18next.use(initReactI18next).init({
  resources: {
    en: { common: en },
    uz: { common: uz },
  },
  lng: detectInitialLanguage(),
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
});

document.documentElement.lang = i18next.language;

export default i18next;
