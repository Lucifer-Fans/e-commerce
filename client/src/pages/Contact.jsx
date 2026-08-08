import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

import { contactApi } from '../api/endpoints';
import useSettings from '../settings/useSettings';
import { mapEmbedSrc, mapPlaceUrl } from '../utils/maps';
import Seo from '../components/common/Seo';
import Icon from '../components/common/Icon';
import Spinner from '../components/common/Spinner';
import SuccessDialog from '../components/common/SuccessDialog';

const EMPTY = { name: '', email: '', phone: '', subject: '', message: '' };

/** Client-side mirror of the server validators — instant feedback, server still wins. */
function validate(values, t) {
  const errors = {};
  if (values.name.trim().length < 2) errors.name = t('common:validation.nameRequired');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = t('common:validation.emailInvalid');
  }
  if (!/^[6-9]\d{9}$/.test(values.phone)) errors.phone = t('common:validation.phoneInvalid');
  if (values.message.trim().length < 5) errors.message = t('contact.errors.message');
  return errors;
}

/** One row of the "Contact Details" card. */
function DetailRow({ icon, label, children }) {
  return (
    <li className="flex gap-3.5">
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
        <Icon name={icon} size={17} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-ink-900">{label}</p>
        <div className="mt-0.5 break-words text-sm text-brand-600">{children}</div>
      </div>
    </li>
  );
}

export default function Contact() {
  const { t } = useTranslation(['pages', 'common']);
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  // Address, phone and email are admin-managed, so the page never hardcodes them.
  const { general, siteName, loading: settingsLoading } = useSettings();

  const address = general.companyAddress || '';
  // Admin-pasted embed wins; otherwise the map falls back to a lookup of the address.
  const embedSrc = mapEmbedSrc(general);
  const placeUrl = mapPlaceUrl(general);

  const set = (field) => (e) => {
    const value = field === 'phone' ? e.target.value.replace(/\D/g, '').slice(0, 10) : e.target.value;
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const found = validate(values, t);
    if (Object.keys(found).length) return setErrors(found);

    setSending(true);
    try {
      await contactApi.submit({
        name: values.name.trim(),
        email: values.email.trim(),
        phone: values.phone,
        subject: values.subject.trim(),
        message: values.message.trim(),
      });
      setValues(EMPTY);
      setDone(true);
    } catch (err) {
      // Surface field-level errors returned by express-validator.
      if (err.errors?.length) {
        setErrors(Object.fromEntries(err.errors.map((e2) => [e2.field, e2.message])));
      }
      toast.error(err.message || t('contact.sendFailed'));
    } finally {
      setSending(false);
    }
  };

  /** `name` doubles as the translation key: contact.fields.<name>{,Placeholder}. */
  const field = (name, { type = 'input', ...props } = {}) => (
    <div className={props.wide ? 'sm:col-span-2' : ''}>
      <label htmlFor={name} className="label">
        {t(`contact.fields.${name}`)}
        {props.optional && (
          <span className="ml-1 font-normal text-ink-400">{t('contact.optional')}</span>
        )}
      </label>

      {type === 'textarea' ? (
        <textarea
          id={name}
          rows={5}
          value={values[name]}
          onChange={set(name)}
          className={`input resize-y ${errors[name] ? 'input-error' : ''}`}
          aria-invalid={Boolean(errors[name])}
          placeholder={t(`contact.fields.${name}Placeholder`, '')}
          {...props.input}
        />
      ) : (
        <input
          id={name}
          value={values[name]}
          onChange={set(name)}
          className={`input ${errors[name] ? 'input-error' : ''}`}
          aria-invalid={Boolean(errors[name])}
          placeholder={t(`contact.fields.${name}Placeholder`, '')}
          {...props.input}
        />
      )}

      {errors[name] && <p className="error-text">{errors[name]}</p>}
    </div>
  );

  return (
    <>
      <Seo
        title={t('contact.seoTitle')}
        description={t('contact.seoDescription', { app: siteName })}
        path="/contact"
      />

      <div className="container-page py-8 lg:py-12">
        <header className="mb-8">
          <h1 className="text-3xl font-black text-ink-900 sm:text-4xl">{t('contact.heading')}</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-500">
            <Trans
              i18nKey="pages:contact.intro"
              components={[
                <span key="0" />,
                <span key="1" className="font-semibold text-accent" />,
                <span key="2" className="text-brand-600" />,
              ]}
            />
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* ---------------- Message form ---------------- */}
          <section className="card p-5 sm:p-7 lg:col-span-2">
            <h2 className="mb-6 text-lg font-bold text-ink-900">{t('contact.formTitle')}</h2>

            <form onSubmit={submit} noValidate className="grid gap-5 sm:grid-cols-2">
              {field('name', { input: { autoComplete: 'name' } })}
              {field('email', { input: { type: 'email', autoComplete: 'email' } })}

              <div>
                <label htmlFor="phone" className="label">
                  {t('contact.fields.phone')}
                </label>
                <div
                  className={`flex overflow-hidden rounded-lg border bg-white transition
                              focus-within:ring-2 focus-within:ring-brand-100 ${
                                errors.phone
                                  ? 'border-danger focus-within:border-danger focus-within:ring-red-100'
                                  : 'border-ink-300 focus-within:border-brand-500'
                              }`}
                >
                  <span className="grid place-items-center border-r border-ink-200 bg-ink-50 px-3 text-sm font-semibold text-ink-600">
                    +91
                  </span>
                  <input
                    id="phone"
                    value={values.phone}
                    onChange={set('phone')}
                    inputMode="numeric"
                    maxLength={10}
                    autoComplete="tel"
                    placeholder={t('contact.fields.phonePlaceholder')}
                    aria-invalid={Boolean(errors.phone)}
                    className="w-full bg-transparent px-3.5 py-2.5 text-sm text-ink-800 outline-none placeholder:text-ink-400"
                  />
                </div>
                {errors.phone && <p className="error-text">{errors.phone}</p>}
              </div>

              {field('subject', { optional: true, input: { maxLength: 150 } })}
              {field('message', { type: 'textarea', wide: true, input: { maxLength: 3000 } })}

              <div className="sm:col-span-2">
                <button type="submit" disabled={sending} className="btn-primary w-full py-3">
                  {sending && <Spinner size={15} />}
                  {t(sending ? 'contact.sending' : 'contact.submit')}
                </button>
              </div>
            </form>
          </section>

          {/* ---------------- Contact details + map ---------------- */}
          <aside className="space-y-6">
            <section className="card p-5 sm:p-6">
              <h2 className="mb-5 text-lg font-bold text-ink-900">{t('contact.detailsTitle')}</h2>

              {settingsLoading ? (
                <div className="space-y-4">
                  {[0, 1, 2].map((row) => (
                    <div key={row} className="skeleton h-12 rounded-lg" />
                  ))}
                </div>
              ) : (
                <ul className="space-y-5">
                  <DetailRow icon="location" label={t('contact.officeAddress')}>
                    {address || t('contact.addressSoon')}
                  </DetailRow>

                  {general.contactNumber && (
                    <DetailRow icon="phone" label={t('contact.fields.phone')}>
                      <a href={`tel:${general.contactNumber}`} className="hover:underline">
                        {general.contactNumber}
                      </a>
                    </DetailRow>
                  )}

                  {general.contactEmail && (
                    <DetailRow icon="mail" label={t('contact.fields.email')}>
                      <a href={`mailto:${general.contactEmail}`} className="hover:underline">
                        {general.contactEmail}
                      </a>
                    </DetailRow>
                  )}
                </ul>
              )}
            </section>

            {embedSrc && (
              <section className="card relative overflow-hidden">
                {placeUrl && (
                  <a
                    href={placeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-lg bg-white/95
                               px-3 py-1.5 text-xs font-semibold text-brand-600 shadow-card backdrop-blur"
                  >
                    {t('contact.openInMaps')}
                    <Icon name="externalLink" size={13} />
                  </a>
                )}

                {/* Embed URL needs no API key, so the map works out of the box. */}
                <iframe
                  title={t('contact.mapTitle')}
                  src={embedSrc}
                  className="h-[240px] w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
              </section>
            )}
          </aside>
        </div>
      </div>

      <SuccessDialog
        open={done}
        onClose={() => setDone(false)}
        message={t('contact.successMessage')}
      />
    </>
  );
}
