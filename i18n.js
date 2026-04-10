import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import it from './locales/it.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import pt from './locales/pt.json';

const LANGUAGE_KEY = 'soundscape_language';

const SUPPORTED_LANGUAGES = ['it', 'en', 'es', 'fr', 'de', 'pt'];

/**
 * Detects the best language to use:
 * 1. User-saved preference in AsyncStorage
 * 2. Device locale (if supported)
 * 3. Fallback: Italian
 */
async function detectLanguage() {
  try {
    // 1. Check saved preference
    const saved = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (saved && SUPPORTED_LANGUAGES.includes(saved)) {
      return saved;
    }

    // 2. Use device locale
    const locales = Localization.getLocales();
    if (locales && locales.length > 0) {
      const deviceLang = locales[0].languageCode;
      if (deviceLang && SUPPORTED_LANGUAGES.includes(deviceLang)) {
        return deviceLang;
      }
    }
  } catch (e) {
    // ignore errors and fall through to default
  }

  // 3. Default: Italian
  return 'it';
}

/**
 * Save the user's language preference to AsyncStorage
 */
export async function saveLanguagePreference(lang) {
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
  } catch (e) {
    console.warn('i18n: could not save language preference', e);
  }
}

/**
 * Change the active language and persist the preference
 */
export async function changeLanguage(lang) {
  await i18n.changeLanguage(lang);
  await saveLanguagePreference(lang);
}

/**
 * Initialise i18next.
 * Call (and await) this before rendering the app.
 */
export async function initI18n() {
  const language = await detectLanguage();

  await i18n
    .use(initReactI18next)
    .init({
      resources: {
        it: { translation: it },
        en: { translation: en },
        es: { translation: es },
        fr: { translation: fr },
        de: { translation: de },
        pt: { translation: pt },
      },
      lng: language,
      fallbackLng: 'it',
      interpolation: {
        escapeValue: false, // React already escapes by default
      },
      compatibilityJSON: 'v4',
    });

  return i18n;
}

export default i18n;
