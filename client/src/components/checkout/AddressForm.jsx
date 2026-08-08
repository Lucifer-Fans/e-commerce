import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { addressApi } from '../../api/endpoints';
import Spinner from '../common/Spinner';

const EMPTY = {
  label: 'home',
  fullName: '',
  phone: '',
  alternatePhone: '',
  addressLine1: '',
  addressLine2: '',
  landmark: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
  isDefault: false,
};

/**
 * Client-side mirror of the server validators — fast feedback, server still
 * authoritative. Takes `t` so the messages it produces are in the shopper's
 * language rather than the server's default English.
 */
function validate(values, t) {
  const errors = {};
  if (!values.fullName.trim() || values.fullName.trim().length < 2) {
    errors.fullName = t('validation.nameRequired');
  }
  if (!/^[6-9]\d{9}$/.test(values.phone)) errors.phone = t('validation.phoneInvalid');
  if (values.alternatePhone && !/^[6-9]\d{9}$/.test(values.alternatePhone)) {
    errors.alternatePhone = t('validation.phoneInvalid');
  }
  if (values.addressLine1.trim().length < 5) {
    errors.addressLine1 = t('address.errors.line1');
  }
  if (!values.city.trim()) errors.city = t('address.errors.city');
  if (!values.state.trim()) errors.state = t('address.errors.state');
  if (!/^\d{6}$/.test(values.pincode)) errors.pincode = t('validation.pincodeInvalid');
  return errors;
}

export default function AddressForm({ address, onSaved, onCancel }) {
  const { t } = useTranslation(['checkout', 'common']);
  const [values, setValues] = useState({ ...EMPTY, ...address });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const found = validate(values, t);
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }

    setSaving(true);
    try {
      const res = address?._id
        ? await addressApi.update(address._id, values)
        : await addressApi.create(values);
      toast.success(t(address?._id ? 'address.updated' : 'address.added'));
      onSaved(res.data.address);
    } catch (err) {
      // Surface field-level errors returned by express-validator.
      if (err.errors?.length) {
        setErrors(Object.fromEntries(err.errors.map((e2) => [e2.field, e2.message])));
      }
      toast.error(err.message || t('address.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  /** `name` doubles as the translation key: address.fields.<name>{,Placeholder}. */
  const field = (name, props = {}) => (
    <div className={props.wide ? 'sm:col-span-2' : ''}>
      <label htmlFor={name} className="label">
        {t(`address.fields.${name}`)}
        {props.optional && (
          <span className="ml-1 font-normal text-ink-400">{t('address.optional')}</span>
        )}
      </label>
      <input
        id={name}
        value={values[name]}
        onChange={set(name)}
        className={`input ${errors[name] ? 'input-error' : ''}`}
        aria-invalid={Boolean(errors[name])}
        placeholder={t(`address.fields.${name}Placeholder`, '')}
        {...props.input}
      />
      {errors[name] && <p className="error-text">{errors[name]}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      {field('fullName', { input: { autoComplete: 'name' } })}
      {field('phone', { input: { inputMode: 'numeric', maxLength: 10, autoComplete: 'tel' } })}
      {field('addressLine1', { wide: true, input: { autoComplete: 'address-line1' } })}
      {field('addressLine2', { wide: true, optional: true, input: { autoComplete: 'address-line2' } })}
      {field('landmark', { optional: true })}
      {field('pincode', {
        input: { inputMode: 'numeric', maxLength: 6, autoComplete: 'postal-code' },
      })}
      {field('city', { input: { autoComplete: 'address-level2' } })}
      {field('state', { input: { autoComplete: 'address-level1' } })}
      {field('alternatePhone', { optional: true, input: { inputMode: 'numeric', maxLength: 10 } })}

      <div>
        <span className="label">{t('address.typeLabel')}</span>
        <div className="flex gap-2">
          {['home', 'work', 'other'].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setValues((v) => ({ ...v, label: option }))}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                values.label === option
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-ink-300 text-ink-600 hover:border-ink-400'
              }`}
            >
              {t(`address.labels.${option}`)}
            </button>
          ))}
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-600 sm:col-span-2">
        <input
          type="checkbox"
          checked={values.isDefault}
          onChange={set('isDefault')}
          className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
        />
        {t('address.makeDefault')}
      </label>

      <div className="flex gap-3 sm:col-span-2">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving && <Spinner size={14} />}
          {t(address?._id ? 'address.update' : 'address.save')}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-outline">
            {t('common:actions.cancel')}
          </button>
        )}
      </div>
    </form>
  );
}
