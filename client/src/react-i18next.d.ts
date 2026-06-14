declare module 'react-i18next' {
  import type { ReactNode } from 'react';
  export function useTranslation(ns?: string): {
    t: (key: string, options?: Record<string, unknown>) => string;
    i18n: { language: string; changeLanguage: (lng: string) => Promise<void> };
    ready: boolean;
  };
  export const I18nextProvider: import('react').ComponentType<{ i18n: unknown; children: import('react').ReactNode }>;
  export function initReactI18next(instance: unknown): void;
  export const Trans: import('react').FC<{
    i18nKey?: string;
    components?: Record<string, ReactNode>;
    children?: ReactNode;
  }>;
}
