import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { addressApi } from '../../api/endpoints';
import { lookupPincode } from '../../api/pincode';
import { INDIAN_STATES, citiesForState } from '../../data/indiaLocations';
import useDebounce from '../../hooks/useDebounce';
import Spinner from '../common/Spinner';
import PhoneInput from '../common/PhoneInput';

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

/** Sentinel option that swaps the city dropdown for a free-text box. */
const OTHER_CITY = '__other__';

export default function AddressForm({ address, onSaved, onCancel }) {
  const { t } = useTranslation(['checkout', 'common']);
  const [values, setValues] = useState({ ...EMPTY, ...address });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  // An address saved before this dropdown existed (or in a town we don't list)
  // has to open in free-text mode, otherwise editing it would blank the city.
  const [customCity, setCustomCity] = useState(
    () => Boolean(address?.city) && !citiesForState(address.state).includes(address.city),
  );
  const [lookup, setLookup] = useState('idle');

  const debouncedPincode = useDebounce(values.pincode, 500);
  // The pincode the dropdowns already reflect. Seeded from the address being
  // edited so opening the form doesn't re-answer a question already answered.
  const answeredFor = useRef(address?.pincode || '');

  /* India Post fills state and city from the pincode; both stay editable after. */
  useEffect(() => {
    if (!/^\d{6}$/.test(debouncedPincode) || debouncedPincode === answeredFor.current) {
      setLookup('idle');
      return () => {};
    }

    const controller = new AbortController();
    setLookup('searching');

    lookupPincode(debouncedPincode, { signal: controller.signal }).then((found) => {
      if (controller.signal.aborted) return;
      answeredFor.current = debouncedPincode;

      if (!found?.state) {
        setLookup('notFound');
        return;
      }

      setLookup('idle');
      setCustomCity(!found.listed);
      setValues((v) => ({ ...v, state: found.state, city: found.city }));
      setErrors((prev) => ({ ...prev, state: undefined, city: undefined }));
    });

    return () => controller.abort();
  }, [debouncedPincode]);

  const stateOptions = INDIAN_STATES.map((name) => ({ value: name, label: name }));
  // The "Other" escape hatch only makes sense once a state narrows the list down.
  const cityOptions = citiesForState(values.state).map((name) => ({ value: name, label: name }));
  if (values.state) {
    cityOptions.push({ value: OTHER_CITY, label: t('address.fields.cityOther') });
  }

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  /** Changing state invalidates whatever city was picked for the old one. */
  const setStateValue = (e) => {
    const state = e.target.value;
    setValues((v) => ({ ...v, state, city: '' }));
    setCustomCity(false);
    setErrors((prev) => ({ ...prev, state: undefined, city: undefined }));
  };

  const setCity = (e) => {
    const value = e.target.value;
    if (value === OTHER_CITY) {
      setCustomCity(true);
      setValues((v) => ({ ...v, city: '' }));
      return;
    }
    setValues((v) => ({ ...v, city: value }));
    if (errors.city) setErrors((prev) => ({ ...prev, city: undefined }));
  };

  const pickCityFromList = () => {
    setCustomCity(false);
    setValues((v) => ({ ...v, city: '' }));
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
  const field = (name, { type = 'input', options, placeholder, onChange, after, ...props } = {}) => (
    <div className={props.wide ? 'sm:col-span-2' : ''}>
      <label htmlFor={name} className="label">
        {t(`address.fields.${name}`)}
        {props.optional && (
          <span className="ml-1 font-normal text-ink-400">{t('address.optional')}</span>
        )}
      </label>

      {type === 'select' ? (
        <select
          id={name}
          value={values[name]}
          onChange={onChange || set(name)}
          className={`input ${errors[name] ? 'input-error' : ''}`}
          aria-invalid={Boolean(errors[name])}
          {...props.input}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : type === 'phone' ? (
        <PhoneInput
          id={name}
          value={values[name]}
          onChange={set(name)}
          error={errors[name]}
          placeholder={placeholder ?? t(`address.fields.${name}Placeholder`, '')}
          {...props.input}
        />
      ) : (
        <input
          id={name}
          value={values[name]}
          onChange={set(name)}
          className={`input ${errors[name] ? 'input-error' : ''}`}
          aria-invalid={Boolean(errors[name])}
          placeholder={placeholder ?? t(`address.fields.${name}Placeholder`, '')}
          {...props.input}
        />
      )}

      {after}
      {errors[name] && <p className="error-text">{errors[name]}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      {field('fullName', { input: { autoComplete: 'name' } })}
      {field('phone', { type: 'phone' })}
      {field('addressLine1', { wide: true, input: { autoComplete: 'address-line1' } })}
      {field('addressLine2', { wide: true, optional: true, input: { autoComplete: 'address-line2' } })}
      {field('landmark', { optional: true })}
      {field('pincode', {
        input: { inputMode: 'numeric', maxLength: 6, autoComplete: 'postal-code' },
        after: lookup !== 'idle' && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-500">
            {lookup === 'searching' && <Spinner size={12} />}
            {t(lookup === 'searching' ? 'address.pincodeSearching' : 'address.pincodeNotFound')}
          </p>
        ),
      })}
      {field('state', {
        type: 'select',
        placeholder: t('address.fields.statePlaceholder'),
        options: stateOptions,
        onChange: setStateValue,
        input: { autoComplete: 'address-level1' },
      })}
      {customCity
        ? field('city', {
            placeholder: t('address.fields.cityCustomPlaceholder'),
            input: { autoComplete: 'address-level2' },
            after: values.state && (
              <button
                type="button"
                onClick={pickCityFromList}
                className="mt-2 text-xs font-semibold text-brand-600 hover:underline"
              >
                {t('address.fields.cityFromList')}
              </button>
            ),
          })
        : field('city', {
            type: 'select',
            placeholder: values.state
              ? t('address.fields.cityPlaceholder')
              : t('address.fields.selectStateFirst'),
            options: cityOptions,
            onChange: setCity,
            input: { autoComplete: 'address-level2', disabled: !values.state },
          })}
      {field('alternatePhone', {
        type: 'phone',
        optional: true,
        placeholder: t('address.fields.phonePlaceholder'),
        input: { autoComplete: 'tel' },
      })}

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
