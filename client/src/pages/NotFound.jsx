import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Seo from '../components/common/Seo';
import Icon from '../components/common/Icon';

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <>
      <Seo title={t('errors.notFoundTitle')} noIndex />

      <div className="container-page flex min-h-[60vh] flex-col items-center justify-center text-center">
        <p className="mb-2 text-7xl font-black text-brand-600">404</p>
        <h1 className="mb-2 text-2xl font-bold text-ink-900">{t('errors.notFoundHeading')}</h1>
        <p className="mb-7 max-w-md text-sm text-ink-500">{t('errors.notFoundMessage')}</p>

        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/" className="btn-primary">
            {t('actions.goHome')}
          </Link>
          <Link to="/products" className="btn-outline">
            <Icon name="grid" size={16} />
            {t('errors.browseProducts')}
          </Link>
        </div>
      </div>
    </>
  );
}
