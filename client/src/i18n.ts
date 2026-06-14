/**
 * i18n configuration for Colabora app.
 * Loads translations from public/locales/{{lng}}/{{ns}}.json.
 * Persists locale in localStorage (colabora-locale).
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';

const STORAGE_KEY = 'colabora-locale';

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'nav', 'auth', 'documents', 'organization', 'governance', 'activity', 'errors', 'admin', 'onboarding', 'guest', 'profile', 'legal'],
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: STORAGE_KEY,
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
    saveMissing: import.meta.env.DEV,
    missingKeyHandler: import.meta.env.DEV
      ? (lngs, ns, key) => {
          console.warn(`[i18n] missing key: ${key} (ns: ${ns}, lng: ${lngs})`);
        }
      : undefined,
  });

export default i18n;
