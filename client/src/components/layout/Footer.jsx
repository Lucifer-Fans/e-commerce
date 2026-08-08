import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

import { newsletterApi } from '../../api/endpoints';
import useSettings from '../../settings/useSettings';
import { mapPlaceUrl } from '../../utils/maps';
import BrandMark from '../common/BrandMark';
import Icon from '../common/Icon';

/*
 * These lists carry translation *keys*, not copy — the labels are resolved inside
 * the component so a language switch re-renders them like everything else.
 */
const TRUST_POINTS = [
  { icon: 'truck', key: 'shipping' },
  { icon: 'shield', key: 'payments' },
  { icon: 'refresh', key: 'returns' },
  { icon: 'package', key: 'genuine' },
];

const COMPANY_LINKS = [
  { to: '/about', key: 'about' },
  { to: '/careers', key: 'careers' },
  { to: '/blog', key: 'blog' },
];

/**
 * Support + legal live together, so the bottom bar can carry payment marks instead.
 * Ordered the way a shopper needs them: reach us → track it → shipping → returns →
 * general questions, then the policies.
 */
const SERVICE_LINKS = [
  { to: '/contact', key: 'contact' },
  { to: '/account/orders', key: 'trackOrder' },
  { to: '/shipping-policy', key: 'shippingPolicy' },
  { to: '/returns', key: 'returns' },
  { to: '/faq', key: 'faq' },
  { to: '/terms', key: 'terms' },
  { to: '/privacy', key: 'privacy' },
  { to: '/refund-policy', key: 'refundPolicy' },
];

const NEWSLETTER_PERKS = [
  { icon: 'tag', key: 'offers' },
  { icon: 'gift', key: 'early' },
  { icon: 'mail', key: 'updates' },
];

/** Mirrors what checkout actually accepts: Razorpay (cards / UPI / net banking) and COD. */
const PAYMENT_METHODS = ['visa', 'mastercard', 'rupay', 'upi', 'netbanking', 'cod'];

/** Each network fills with its own brand colour on hover; resting state stays neutral. */
const SOCIALS = [
  { key: 'facebook', label: 'Facebook', hover: 'hover:bg-[#1877f2]', href: (v) => v },
  {
    key: 'instagram',
    label: 'Instagram',
    hover: 'hover:bg-gradient-to-br hover:from-[#feda75] hover:via-[#d62976] hover:to-[#4f5bd5]',
    href: (v) => v,
  },
  { key: 'twitter', label: 'Twitter (X)', hover: 'hover:bg-ink-900', solid: true, href: (v) => v },
  { key: 'linkedin', label: 'LinkedIn', hover: 'hover:bg-[#0a66c2]', href: (v) => v },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    hover: 'hover:bg-[#25d366]',
    solid: true,
    // Admins may store either a wa.me link or a bare number.
    href: (v) => (/^https?:/i.test(v) ? v : `https://wa.me/${v.replace(/\D/g, '')}`),
  },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Column heading with the small brand rule used across the footer. */
function ColumnTitle({ children }) {
  return (
    <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-ink-900">
      {children}
      <span className="mt-2 block h-0.5 w-8 rounded-full bg-brand-600" />
    </h3>
  );
}

/**
 * Footer link with the slide-in chevron: the arrow's own width animates from 0,
 * which nudges the label to the right instead of fighting it with a transform.
 */
function FooterLink({ to, label }) {
  return (
    <Link
      to={to}
      className="group inline-flex items-center text-sm text-ink-500 transition-colors duration-200 hover:text-brand-600"
    >
      <span
        className="grid w-0 shrink-0 place-items-center overflow-hidden opacity-0 transition-all
                   duration-300 ease-out group-hover:w-[18px] group-hover:opacity-100"
      >
        <Icon name="chevronRight" size={14} />
      </span>
      <span>{label}</span>
    </Link>
  );
}

/**
 * Card-brand marks drawn inline so the footer stays asset-free. Brand names
 * (Visa, RuPay, UPI) are proper nouns and stay as-is in every language; only the
 * two descriptive marks — net banking and cash on delivery — are translated.
 */
function PaymentMark({ type, t }) {
  const shell =
    'flex h-7 min-w-[46px] items-center justify-center gap-1 rounded border border-ink-200 bg-white px-2';

  if (type === 'visa') {
    return (
      <span className={shell} title="Visa">
        <span className="text-[13px] font-black italic tracking-tight text-[#1a1f71]">VISA</span>
      </span>
    );
  }
  if (type === 'mastercard') {
    return (
      <span className={shell} title="Mastercard">
        <span className="relative flex h-4 w-6 items-center">
          <span className="absolute left-0 h-4 w-4 rounded-full bg-[#eb001b]" />
          <span className="absolute right-0 h-4 w-4 rounded-full bg-[#f79e1b] mix-blend-multiply" />
        </span>
      </span>
    );
  }
  if (type === 'rupay') {
    return (
      <span className={shell} title="RuPay">
        <span className="text-[12px] font-extrabold tracking-tight">
          <span className="text-[#097dc6]">Ru</span>
          <span className="text-[#f58220]">Pay</span>
        </span>
      </span>
    );
  }
  if (type === 'upi') {
    return (
      <span className={shell} title="UPI">
        <span className="flex h-3.5 w-1.5 flex-col overflow-hidden rounded-[1px]">
          <span className="h-1/2 bg-[#f7941d]" />
          <span className="h-1/2 bg-[#1a9c4b]" />
        </span>
        <span className="text-[11px] font-extrabold text-ink-700">UPI</span>
      </span>
    );
  }
  if (type === 'netbanking') {
    return (
      <span className={shell} title={t('footer.netBanking')}>
        <Icon name="creditCard" size={13} className="text-ink-500" />
        <span className="text-[10px] font-bold uppercase text-ink-600">{t('footer.netBanking')}</span>
      </span>
    );
  }
  return (
    <span className={shell} title={t('footer.cashOnDelivery')}>
      <Icon name="truck" size={13} className="text-ink-500" />
      <span className="text-[10px] font-bold uppercase text-ink-600">COD</span>
    </span>
  );
}

export default function Footer() {
  const { t } = useTranslation();

  // Brand, address, phone, email and social profiles are all admin-managed.
  const { general, social, siteName, loading: settingsLoading } = useSettings();

  const [email, setEmail] = useState('');
  const [subscribing, setSubscribing] = useState(false);

  const subscribe = async (e) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) return toast.error(t('footer.invalidEmail'));

    setSubscribing(true);
    try {
      const res = await newsletterApi.subscribe(email.trim());

      if (res.data?.alreadySubscribed) {
        // Left in the box on purpose: seeing the address is what tells someone they
        // typed the wrong one, rather than an empty field and a message they ignore.
        toast(res.message, { icon: 'ℹ️' });
      } else {
        setEmail('');
        toast.success(res.message || t('footer.subscribed'));
      }
    } catch (err) {
      toast.error(err.message || t('footer.subscribeFailed'));
    } finally {
      setSubscribing(false);
    }
  };

  const activeSocials = SOCIALS.filter((s) => social[s.key]);
  // Same pin the Contact page embeds, derived from the admin's map settings.
  const placeUrl = mapPlaceUrl(general);

  return (
    <footer className="mt-12 border-t border-ink-200 bg-white">
      <div className="border-b border-ink-200 bg-ink-50">
        <div className="container-page grid grid-cols-2 gap-6 py-8 lg:grid-cols-4">
          {TRUST_POINTS.map((point) => (
            <div key={point.key} className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
                <Icon name={point.icon} size={19} />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink-900">
                  {t(`footer.trust.${point.key}Title`)}
                </p>
                <p className="text-xs text-ink-500">{t(`footer.trust.${point.key}Text`)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-12">
        {/* ---------------- Brand + contact + social ---------------- */}
        <div className="lg:col-span-4">
          <Link to="/" className="mb-6 inline-flex">
            <BrandMark tileClassName="text-white" nameClassName="text-ink-900" />
          </Link>
          {settingsLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((row) => (
                <div key={row} className="skeleton h-5 w-56 rounded" />
              ))}
            </div>
          ) : (
            <ul className="space-y-3">
              {general.companyAddress && (
                <li>
                  {/* Opens the same pin the Contact page embeds. */}
                  <a
                    href={placeUrl || undefined}
                    target={placeUrl ? '_blank' : undefined}
                    rel="noreferrer noopener"
                    title={placeUrl ? t('footer.viewOnMaps') : undefined}
                    className="group flex gap-3"
                  >
                    <span
                      className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600
                                 transition-all duration-200 group-hover:bg-brand-600 group-hover:text-white"
                    >
                      <Icon name="location" size={14} />
                    </span>
                    <span className="text-sm leading-relaxed text-ink-500 transition-colors group-hover:text-brand-600">
                      {general.companyAddress}
                    </span>
                  </a>
                </li>
              )}

              {general.contactNumber && (
                <li className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-success">
                    <Icon name="phone" size={14} />
                  </span>
                  <a
                    href={`tel:${general.contactNumber}`}
                    className="text-sm text-ink-500 transition hover:text-brand-600"
                  >
                    {general.contactNumber}
                  </a>
                </li>
              )}

              {general.contactEmail && (
                <li className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-danger">
                    <Icon name="mail" size={14} />
                  </span>
                  <a
                    href={`mailto:${general.contactEmail}`}
                    className="break-all text-sm text-ink-500 transition hover:text-brand-600"
                  >
                    {general.contactEmail}
                  </a>
                </li>
              )}
            </ul>
          )}

          {activeSocials.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2.5">
              {activeSocials.map((s) => (
                <a
                  key={s.key}
                  href={s.href(social[s.key])}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={s.label}
                  title={s.label}
                  className={`grid h-10 w-10 place-items-center rounded-full border border-ink-200 bg-ink-50 text-ink-500
                              transition-all duration-200 hover:-translate-y-1 hover:border-transparent
                              hover:text-white hover:shadow-card-hover ${s.hover}`}
                >
                  <Icon name={s.key} size={s.solid ? 16 : 17} filled={s.solid} strokeWidth={s.solid ? 0 : 2} />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* ---------------- Company ---------------- */}
        <div className="lg:col-span-2">
          <ColumnTitle>{t('footer.company')}</ColumnTitle>
          <ul className="space-y-2.5">
            {COMPANY_LINKS.map((link) => (
              <li key={link.to}>
                <FooterLink to={link.to} label={t(`footer.links.${link.key}`)} />
              </li>
            ))}
          </ul>
        </div>

        {/* ---------------- Customer Service ---------------- */}
        <div className="lg:col-span-3">
          <ColumnTitle>{t('footer.customerService')}</ColumnTitle>
          <ul className="space-y-2.5">
            {SERVICE_LINKS.map((link) => (
              <li key={link.to}>
                <FooterLink to={link.to} label={t(`footer.links.${link.key}`)} />
              </li>
            ))}
          </ul>
        </div>

        {/* ---------------- Newsletter ---------------- */}
        <div className="lg:col-span-3">
          <ColumnTitle>{t('footer.newsletter')}</ColumnTitle>
          <p className="mb-4 text-sm leading-relaxed text-ink-500">{t('footer.newsletterBlurb')}</p>

          <form onSubmit={subscribe} noValidate className="mb-5 flex gap-2">
            <label htmlFor="footer-newsletter" className="sr-only">
              {t('footer.emailAddress')}
            </label>
            <input
              id="footer-newsletter"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('footer.emailPlaceholder')}
              autoComplete="email"
              disabled={subscribing}
              className="input py-2"
            />
            <button
              type="submit"
              aria-label={t('footer.subscribe')}
              disabled={subscribing}
              className="btn-primary shrink-0 px-3.5 py-2"
            >
              <Icon name={subscribing ? 'refresh' : 'send'} size={16} />
            </button>
          </form>

          <ul className="space-y-3">
            {NEWSLETTER_PERKS.map((perk) => (
              <li key={perk.key} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
                  <Icon name={perk.icon} size={14} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    {t(`footer.perks.${perk.key}Title`)}
                  </p>
                  <p className="text-xs text-ink-500">{t(`footer.perks.${perk.key}Text`)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-ink-200">
        <div className="container-page flex flex-col items-center justify-between gap-3 py-5 sm:flex-row">
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-ink-500">
            <span>
              © {new Date().getFullYear()}{' '}
              <span className="font-semibold text-ink-700">{siteName}</span>.{' '}
              {t('footer.rights')}
            </span>
            <span aria-hidden="true" className="hidden h-3 w-px bg-ink-200 sm:block" />
            <span className="inline-flex items-center gap-1">
              <Trans
                i18nKey="footer.madeIn"
                components={[<span key="0" />, <span key="1" className="text-danger" />]}
              />
            </span>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="mr-1 text-xs font-semibold text-ink-500">{t('footer.weAccept')}</span>
            {PAYMENT_METHODS.map((method) => (
              <PaymentMark key={method} type={method} t={t} />
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
