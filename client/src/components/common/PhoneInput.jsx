/**
 * The one mobile number box the storefront uses — a locked `+91` chip welded to
 * the left of an otherwise ordinary `.input`, so every phone field on the site
 * reads the same whether it sits in checkout, the contact form or the profile.
 *
 * The country code is presentation only: the value handed back is always the
 * bare ten digits the API and the `^[6-9]\d{9}$` validators expect. Anything
 * that cannot be part of one is dropped as it arrives — spaces, dashes and a
 * pasted "+91 98765 43210" — rather than refused on submit.
 */
const PhoneInput = ({ id, name, value, onChange, error, className = '', ...props }) => {
  const handleChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '');
    // A pasted number carrying its country code is the same number, not a twelve digit one.
    const local = digits.length > 10 && digits.startsWith('91') ? digits.slice(2) : digits;
    onChange({ target: { id, name: name ?? id, type: 'text', value: local.slice(0, 10) } });
  };

  return (
    <div
      className={`flex overflow-hidden rounded-lg border bg-white transition
                  focus-within:ring-2 focus-within:ring-brand-100 ${
                    error
                      ? 'border-danger focus-within:border-danger focus-within:ring-red-100'
                      : 'border-ink-300 focus-within:border-brand-500'
                  } ${className}`}
    >
      <span className="grid shrink-0 place-items-center border-r border-ink-200 bg-ink-50 px-3 text-sm font-semibold text-ink-600">
        +91
      </span>
      <input
        id={id}
        name={name ?? id}
        value={value}
        onChange={handleChange}
        inputMode="numeric"
        maxLength={10}
        autoComplete="tel"
        aria-invalid={Boolean(error)}
        className="w-full bg-transparent px-3.5 py-2.5 text-sm text-ink-800 outline-none placeholder:text-ink-400 disabled:bg-ink-100"
        {...props}
      />
    </div>
  );
};

export default PhoneInput;
