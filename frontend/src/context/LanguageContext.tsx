import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';

type Language = 'he' | 'en';

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const language = (i18n.language?.startsWith('he') ? 'he' : 'en') as Language;
  const isRTL = language === 'he';

  // Sync dir and lang attributes on <html>
  useEffect(() => {
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language, isRTL]);

  // On mount: try to load saved language from Supabase profile
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || cancelled) return;
        const { data } = await supabase
          .from('profiles')
          .select('preferred_language')
          .eq('id', session.user.id)
          .single();
        if (data?.preferred_language && !cancelled) {
          const savedLang = data.preferred_language as Language;
          const localLang = localStorage.getItem('triptomat-lang');
          // Supabase takes precedence only if localStorage wasn't explicitly set
          if (!localLang && savedLang !== language) {
            i18n.changeLanguage(savedLang);
          }
        }
      } catch {
        // profiles table might not have the column yet — ignore
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLanguage = async (lang: Language) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('triptomat-lang', lang);

    // Persist to Supabase (best-effort)
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase
          .from('profiles')
          .update({ preferred_language: lang })
          .eq('id', session.user.id);
      }
    } catch {
      // ignore — Supabase sync is best-effort
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
