import { Link } from 'react-router-dom';

import useSettings from '../../settings/useSettings';
import Icon from '../common/Icon';

/**
 * The "we're still here" card that closes every informational page.
 *
 * Phone and email are admin-managed and each row disappears when its setting is
 * blank, so a store that has only filled in one of them still gets a card that
 * reads as finished rather than one with an empty slot in it.
 */
export default function SupportCta({ t }) {
  const { general } = useSettings();

  return (
    <section className="card mt-8 overflow-hidden">
      <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="flex gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
            <Icon name="mail" size={20} />
          </span>
          <div>
            <h2 className="text-lg font-bold text-ink-900">{t('ui.helpTitle')}</h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-500">
              {t('ui.helpText')}
            </p>

            {(general.contactNumber || general.contactEmail) && (
              <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                {general.contactNumber && (
                  <li>
                    <a
                      href={`tel:${general.contactNumber}`}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:underline"
                    >
                      <Icon name="phone" size={15} />
                      {general.contactNumber}
                    </a>
                  </li>
                )}
                {general.contactEmail && (
                  <li>
                    <a
                      href={`mailto:${general.contactEmail}`}
                      className="inline-flex items-center gap-2 break-all text-sm font-semibold text-brand-600 hover:underline"
                    >
                      <Icon name="mail" size={15} />
                      {general.contactEmail}
                    </a>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 lg:justify-end">
          <Link to="/contact" className="btn-primary px-5 py-2.5">
            {t('ui.contactSupport')}
          </Link>
          <Link to="/account/orders" className="btn-outline px-5 py-2.5">
            <Icon name="package" size={16} />
            {t('ui.trackOrder')}
          </Link>
        </div>
      </div>
    </section>
  );
}
