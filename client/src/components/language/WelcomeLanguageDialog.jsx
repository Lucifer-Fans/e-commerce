import { useTranslation } from 'react-i18next';
import LanguageDialog from './LanguageDialog';
import useLanguage from '../../i18n/useLanguage';

/**
 * Shown once, to a visitor whose language we had to guess. Choosing a language or
 * closing the dialog both count as answering it, so it never appears again.
 *
 * It is deliberately not a blocker: the site behind it is already rendered in the
 * detected language, so dismissing costs the visitor nothing.
 */
export default function WelcomeLanguageDialog() {
  const { t } = useTranslation();
  const { welcomeOpen, dismissWelcome } = useLanguage();

  if (!welcomeOpen) return null;

  return (
    <LanguageDialog
      open
      onClose={dismissWelcome}
      title={t('language.welcomeTitle')}
      description={t('language.welcomeSubtitle')}
    />
  );
}
