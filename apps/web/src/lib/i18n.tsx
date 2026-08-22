import { createContext, useContext, useEffect, useState } from 'react';
import { en, type Translations } from '../locales/en.js';
import { ar } from '../locales/ar.js';

type Locale = 'en' | 'ar';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: keyof Translations, ...args: (string | number)[]) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem('rw.locale');
    if (stored === 'en' || stored === 'ar') return stored;
  } catch {
    // ignore
  }

  // No stored choice: follow the device. A phone set to Arabic opens in Arabic
  // — which for this market is most of them — and everyone else gets English.
  // A choice made with the toggle is stored above and always wins afterwards.
  try {
    const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
    if (languages.some((tag) => typeof tag === 'string' && tag.toLowerCase().startsWith('ar'))) {
      return 'ar';
    }
  } catch {
    // ignore
  }

  return 'en';
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem('rw.locale', newLocale);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);

  const t = (key: keyof Translations, ...args: (string | number)[]): string => {
    const dict = locale === 'ar' ? ar : en;
    let text = dict[key] ?? en[key] ?? key;
    args.forEach((arg, i) => {
      text = text.replace(`{${i}}`, String(arg));
    });
    return text;
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within an I18nProvider');
  return context;
}
