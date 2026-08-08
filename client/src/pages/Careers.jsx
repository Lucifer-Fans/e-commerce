import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

import { careerApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import useSettings from '../settings/useSettings';
import Seo from '../components/common/Seo';
import Icon from '../components/common/Icon';
import Spinner from '../components/common/Spinner';
import SuccessDialog from '../components/common/SuccessDialog';

const EMPTY = {
  name: '',
  email: '',
  phone: '',
  position: '',
  experience: '',
  location: '',
  coverLetter: '',
};

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const RESUME_PATTERN = /\.(pdf|doc|docx)$/i;

const PERKS = [
  { icon: 'trendingUp', key: 'growth' },
  { icon: 'users', key: 'culture' },
  { icon: 'award', key: 'learning' },
];

function validate(values, resume, t) {
  const errors = {};
  if (values.name.trim().length < 2) errors.name = t('common:validation.nameRequired');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = t('common:validation.emailInvalid');
  }
  if (!/^[6-9]\d{9}$/.test(values.phone)) errors.phone = t('common:validation.phoneInvalid');
  if (!values.position) errors.position = t('careers.errors.position');
  if (!values.experience) errors.experience = t('careers.errors.experience');
  if (!resume) errors.resume = t('careers.errors.resume');
  return errors;
}

export default function Careers() {
  const { t } = useTranslation(['pages', 'common']);
  const { siteName } = useSettings();
  const [values, setValues] = useState(EMPTY);
  const [resume, setResume] = useState(null);
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const fileInput = useRef(null);

  // Positions, experience options and the HR card are all managed from the admin panel.
  const configQuery = useFetch(useCallback(() => careerApi.config(), []), []);
  const config = configQuery.data?.data || {};
  const positions = config.positions || [];
  const experienceLevels = config.experienceLevels || [];
  const hr = config.hr || {};

  const set = (field) => (e) => {
    const value = field === 'phone' ? e.target.value.replace(/\D/g, '').slice(0, 10) : e.target.value;
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const pickResume = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!RESUME_PATTERN.test(file.name)) {
      setErrors((prev) => ({ ...prev, resume: t('careers.errors.resumeType') }));
      return;
    }
    if (file.size > MAX_RESUME_BYTES) {
      setErrors((prev) => ({ ...prev, resume: t('careers.errors.resumeSize') }));
      return;
    }

    setResume(file);
    setErrors((prev) => ({ ...prev, resume: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const found = validate(values, resume, t);
    if (Object.keys(found).length) return setErrors(found);

    setSending(true);
    setProgress(0);
    try {
      await careerApi.apply(
        {
          name: values.name.trim(),
          email: values.email.trim(),
          phone: values.phone,
          position: values.position,
          experience: values.experience,
          location: values.location.trim(),
          coverLetter: values.coverLetter.trim(),
          resume,
        },
        { onProgress: setProgress }
      );

      setValues(EMPTY);
      setResume(null);
      if (fileInput.current) fileInput.current.value = '';
      setDone(true);
    } catch (err) {
      if (err.errors?.length) {
        setErrors(Object.fromEntries(err.errors.map((e2) => [e2.field, e2.message])));
      }
      toast.error(err.message || t('careers.submitFailed'));
    } finally {
      setSending(false);
      setProgress(0);
    }
  };

  /** `name` doubles as the translation key: careers.fields.<name>{,Placeholder}. */
  const field = (name, { type = 'input', options, ...props } = {}) => (
    <div className={props.wide ? 'sm:col-span-2' : ''}>
      <label htmlFor={name} className="label">
        {t(`careers.fields.${name}`)}
        {props.optional && (
          <span className="ml-1 font-normal text-ink-400">{t('careers.optional')}</span>
        )}
      </label>

      {type === 'select' ? (
        <select
          id={name}
          value={values[name]}
          onChange={set(name)}
          className={`input ${errors[name] ? 'input-error' : ''}`}
          aria-invalid={Boolean(errors[name])}
          {...props.input}
        >
          <option value="">{props.placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : type === 'textarea' ? (
        <textarea
          id={name}
          rows={5}
          value={values[name]}
          onChange={set(name)}
          className={`input resize-y ${errors[name] ? 'input-error' : ''}`}
          placeholder={t(`careers.fields.${name}Placeholder`, '')}
          {...props.input}
        />
      ) : (
        <input
          id={name}
          value={values[name]}
          onChange={set(name)}
          className={`input ${errors[name] ? 'input-error' : ''}`}
          aria-invalid={Boolean(errors[name])}
          placeholder={t(`careers.fields.${name}Placeholder`, '')}
          {...props.input}
        />
      )}

      {errors[name] && <p className="error-text">{errors[name]}</p>}
    </div>
  );

  return (
    <>
      <Seo
        title={t('careers.seoTitle')}
        description={t('careers.seoDescription', { app: siteName })}
        path="/careers"
      />

      <div className="container-page py-8 lg:py-12">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* ---------------- Application form ---------------- */}
          <section className="card p-5 sm:p-7 lg:col-span-2">
            <h1 className="mb-6 text-xl font-bold text-ink-900">{t('careers.heading')}</h1>

            <form onSubmit={submit} noValidate className="grid gap-5 sm:grid-cols-2">
              {field('name', { input: { autoComplete: 'name' } })}
              {field('email', { input: { type: 'email', autoComplete: 'email' } })}

              <div>
                <label htmlFor="phone" className="label">
                  {t('careers.fields.phone')}
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
                    placeholder={t('careers.fields.phonePlaceholder')}
                    aria-invalid={Boolean(errors.phone)}
                    className="w-full bg-transparent px-3.5 py-2.5 text-sm text-ink-800 outline-none placeholder:text-ink-400"
                  />
                </div>
                {errors.phone && <p className="error-text">{errors.phone}</p>}
              </div>

              {field('position', {
                type: 'select',
                placeholder: t(positions.length ? 'careers.selectPosition' : 'careers.noOpenings'),
                // Position titles and experience labels are admin-authored.
                options: positions.map((position) => ({ value: position.title, label: position.title })),
                input: { disabled: !positions.length },
              })}
              {field('experience', {
                type: 'select',
                placeholder: t('careers.selectExperience'),
                options: experienceLevels,
              })}
              {field('location', { optional: true, input: { maxLength: 80 } })}

              {/* Résumé picker — a styled dropzone over a hidden native input. */}
              <div>
                <span className="label">{t('careers.uploadResume')}</span>
                <div
                  className={`rounded-lg border border-dashed px-4 py-3.5 ${
                    errors.resume ? 'border-danger bg-red-50/40' : 'border-ink-300 bg-ink-50/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      className="btn-outline shrink-0 px-3 py-2 text-xs"
                    >
                      <Icon name="upload" size={14} />
                      {t('careers.chooseFile')}
                    </button>
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-500" title={resume?.name}>
                      {resume ? resume.name : t('careers.noFile')}
                    </span>
                    {resume && (
                      <button
                        type="button"
                        onClick={() => {
                          setResume(null);
                          if (fileInput.current) fileInput.current.value = '';
                        }}
                        className="shrink-0 rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-danger"
                        aria-label={t('careers.removeFile')}
                      >
                        <Icon name="close" size={14} />
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-center text-[11px] text-ink-400">{t('careers.resumeHint')}</p>

                  <input
                    ref={fileInput}
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={pickResume}
                    className="sr-only"
                  />
                </div>
                {errors.resume && <p className="error-text">{errors.resume}</p>}
              </div>

              {field('coverLetter', { type: 'textarea', input: { maxLength: 3000 } })}

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={sending || !positions.length}
                  className="btn-primary w-full py-3"
                >
                  {sending && <Spinner size={15} />}
                  {sending
                    ? progress > 0 && progress < 100
                      ? t('careers.uploading', { percent: progress })
                      : t('careers.submitting')
                    : t('careers.submit')}
                </button>
                {!configQuery.loading && !positions.length && (
                  <p className="mt-2 text-center text-xs text-ink-500">
                    {t('careers.noOpeningsNote')}
                  </p>
                )}
              </div>
            </form>
          </section>

          {/* ---------------- Why join us + HR contact ---------------- */}
          <aside className="space-y-6">
            <section className="card p-5 sm:p-6">
              <h2 className="mb-5 text-lg font-bold text-ink-900">{t('careers.whyJoin')}</h2>
              <ul className="space-y-5">
                {PERKS.map((perk) => (
                  <li key={perk.key} className="flex gap-3.5">
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
                      <Icon name={perk.icon} size={17} />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-ink-900">
                        {t(`careers.perks.${perk.key}Title`)}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
                        {t(`careers.perks.${perk.key}Text`)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {(hr.email || hr.phone) && (
              <section className="card p-5 sm:p-6">
                <h2 className="mb-5 text-lg font-bold text-ink-900">{t('careers.contactHr')}</h2>
                <ul className="space-y-4">
                  {hr.email && (
                    <li className="flex items-center gap-3">
                      <Icon name="mail" size={17} className="shrink-0 text-ink-400" />
                      <a href={`mailto:${hr.email}`} className="break-all text-sm text-brand-600 hover:underline">
                        {hr.email}
                      </a>
                    </li>
                  )}
                  {hr.phone && (
                    <li className="flex items-center gap-3">
                      <Icon name="phone" size={17} className="shrink-0 text-ink-400" />
                      <a href={`tel:${hr.phone}`} className="text-sm text-brand-600 hover:underline">
                        {hr.phone}
                      </a>
                    </li>
                  )}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </div>

      <SuccessDialog
        open={done}
        onClose={() => setDone(false)}
        message={t('careers.successMessage')}
      />
    </>
  );
}
