import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BrandMark from '../common/BrandMark';
import Icon from '../common/Icon';

const HIGHLIGHTS = ['genuine', 'delivery', 'payments'];

/** Split layout shared by login, register, forgot and reset password. */
export default function AuthShell({ title, subtitle, children, footer }) {
  const { t } = useTranslation('account');

  return (
    <div className="grid min-h-[calc(100vh-64px)] lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-ink-900 via-ink-800 to-brand-800 p-12 lg:flex lg:flex-col lg:justify-center">
        <Link to="/" className="mb-8 flex text-white">
          <BrandMark size="md" />
        </Link>

        <h2 className="mb-4 max-w-md text-3xl font-extrabold leading-tight text-white">
          {t('shell.title')}
        </h2>
        <p className="mb-8 max-w-md text-sm leading-relaxed text-ink-300">{t('shell.blurb')}</p>

        <ul className="space-y-3">
          {HIGHLIGHTS.map((key) => (
            <li key={key} className="flex items-center gap-3 text-sm text-ink-200">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/10">
                <Icon name="check" size={13} />
              </span>
              {t(`shell.highlights.${key}`)}
            </li>
          ))}
        </ul>
      </aside>

      <main className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-8 flex lg:hidden">
            <BrandMark tileClassName="text-white" nameClassName="text-ink-900" />
          </Link>

          <h1 className="mb-1.5 text-2xl font-extrabold text-ink-900">{title}</h1>
          {subtitle && <p className="mb-7 text-sm text-ink-500">{subtitle}</p>}

          {children}

          {footer && <div className="mt-6 text-center text-sm text-ink-500">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
