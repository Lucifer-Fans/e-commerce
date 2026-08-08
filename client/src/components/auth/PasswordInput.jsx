import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../common/Icon';

const RULES = [
  { key: 'length', test: (v) => v.length >= 8 },
  { key: 'lowercase', test: (v) => /[a-z]/.test(v) },
  { key: 'uppercase', test: (v) => /[A-Z]/.test(v) },
  { key: 'number', test: (v) => /\d/.test(v) },
];

/** Password field with a reveal toggle and (optionally) a live strength checklist. */
export default function PasswordInput({
  id,
  label,
  value,
  onChange,
  error,
  showRules = false,
  autoComplete = 'current-password',
  placeholder = '••••••••',
}) {
  const { t } = useTranslation('account');
  const [visible, setVisible] = useState(false);
  const passed = RULES.filter((rule) => rule.test(value)).length;

  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className={`input pr-11 ${error ? 'input-error' : ''}`}
          aria-invalid={Boolean(error)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-ink-400 hover:text-ink-700"
          aria-label={t(visible ? 'auth.hidePasswordAria' : 'auth.showPasswordAria')}
        >
          {t(visible ? 'auth.hide' : 'auth.show')}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {showRules && value.length > 0 && (
        <div className="mt-2.5">
          <div className="mb-2 flex gap-1">
            {RULES.map((_, i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i < passed
                    ? passed <= 2
                      ? 'bg-danger'
                      : passed === 3
                        ? 'bg-accent'
                        : 'bg-success'
                    : 'bg-ink-200'
                }`}
              />
            ))}
          </div>
          <ul className="grid grid-cols-2 gap-1">
            {RULES.map((rule) => {
              const ok = rule.test(value);
              return (
                <li
                  key={rule.key}
                  className={`flex items-center gap-1.5 text-[11px] ${
                    ok ? 'text-success' : 'text-ink-400'
                  }`}
                >
                  <Icon name={ok ? 'check' : 'close'} size={11} />
                  {t(`auth.rules.${rule.key}`)}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
