// i18n.js
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

// Import your translation files
import en from './locales/translations/en.json';
import fr from './locales/translations/fr.json';

const resources = {
  en: en,
  fr: fr,
};

i18n
  .use(initReactI18next) // passes i18n down to react-i18next
  .init({
    resources,
    lng: Localization.getLocales()[0].languageCode, // Detect phone language
    fallbackLng: 'en', // Use English if the phone's language is not available
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  });

export default i18n;