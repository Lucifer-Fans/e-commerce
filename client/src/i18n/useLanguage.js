import { useContext } from 'react';
import LanguageContext from './LanguageContext';

/**
 * The active language plus the means to change it.
 *
 * @returns {{
 *   language: string,
 *   current: object,
 *   languages: object[],
 *   changeLanguage: (code: string) => Promise<string>,
 *   switching: boolean,
 *   welcomeOpen: boolean,
 *   dismissWelcome: () => void,
 *   suggested: string | null,
 * }}
 */
export default function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside <LanguageProvider>');
  return ctx;
}
