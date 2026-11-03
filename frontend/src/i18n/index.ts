import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import id from './locales/id.json';
import en from './locales/en.json';

export const SUPPORTED_LANGUAGES = ['id', 'en'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const stored = localStorage.getItem('language');
const initial: AppLanguage = stored === 'en' || stored === 'id' ? stored : 'id';

i18n.use(initReactI18next).init({
  resources: {
    id: { translation: id },
    en: { translation: en },
  },
  lng: initial,
  fallbackLng: 'id',
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on('languageChanged', (lng) => {
  localStorage.setItem('language', lng);
});

export default i18n;
