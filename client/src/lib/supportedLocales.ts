/**
 * Supported locales and RTL list for i18n.
 * Used by UserMenu (language switcher) and RTL/dir effect.
 */
export const SUPPORTED_LOCALES: readonly { code: string; nameKey: string }[] = [
  { code: 'en', nameKey: 'languageNames.en' },
  { code: 'es', nameKey: 'languageNames.es' },
  { code: 'fr', nameKey: 'languageNames.fr' },
  { code: 'de', nameKey: 'languageNames.de' },
  { code: 'ar', nameKey: 'languageNames.ar' },
  { code: 'ru', nameKey: 'languageNames.ru' },
  { code: 'zh', nameKey: 'languageNames.zh' },
  { code: 'pt', nameKey: 'languageNames.pt' },
  { code: 'hi', nameKey: 'languageNames.hi' },
  { code: 'ja', nameKey: 'languageNames.ja' },
  { code: 'id', nameKey: 'languageNames.id' },
  { code: 'tr', nameKey: 'languageNames.tr' },
  { code: 'vi', nameKey: 'languageNames.vi' },
  { code: 'ko', nameKey: 'languageNames.ko' },
  { code: 'it', nameKey: 'languageNames.it' },
  { code: 'pl', nameKey: 'languageNames.pl' },
  { code: 'nl', nameKey: 'languageNames.nl' },
  { code: 'fa', nameKey: 'languageNames.fa' },
  { code: 'ur', nameKey: 'languageNames.ur' },
] as const;

export const RTL_LOCALES: readonly string[] = ['ar', 'fa', 'ur'];
export const RTL_LOCALES_SET = new Set(RTL_LOCALES);
