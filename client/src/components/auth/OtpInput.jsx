import { useRef } from 'react';

/**
 * The one-time code, one box per digit.
 *
 * A single text field would be simpler, but the code arrives by mail and is
 * almost always *pasted* or typed while glancing between two windows — the boxes
 * are what make "how many digits have I got in" answerable at a glance. The value
 * is still one plain string; the boxes are presentation, and the parent never
 * deals with an array.
 *
 * Every way a code actually gets entered is handled: typing (auto-advance),
 * pasting the whole thing anywhere in the row, backspace over an empty box
 * (steps back and clears), arrow keys, and the browser's own SMS/email
 * autofill via `autoComplete="one-time-code"` on the first box.
 */
export default function OtpInput({
  value = '',
  onChange,
  onComplete,
  length = 6,
  disabled = false,
  invalid = false,
  autoFocus = true,
  label,
}) {
  const boxes = useRef([]);

  const digits = value.split('').slice(0, length);
  // The box the caret belongs in: the first empty one, or the last if it is full.
  const activeIndex = Math.min(digits.length, length - 1);

  const commit = (next) => {
    const clean = next.replace(/\D/g, '').slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
    return clean;
  };

  const focusBox = (index) => boxes.current[Math.max(0, Math.min(index, length - 1))]?.focus();

  const handleInput = (index) => (e) => {
    const typed = e.target.value.replace(/\D/g, '');
    if (!typed) return;

    // Overwriting a box mid-code replaces from there rather than appending, so
    // correcting the third digit does not silently add a seventh.
    const next = commit(value.slice(0, index) + typed + value.slice(index + typed.length));
    focusBox(Math.min(index + typed.length, next.length));
  };

  const handleKeyDown = (index) => (e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      // An empty box steps back and clears the digit behind it — one press, one
      // digit gone, which is what a row of boxes has to do to feel like a field.
      const target = value[index] ? index : index - 1;
      if (target < 0) return;
      commit(value.slice(0, target) + value.slice(target + 1));
      focusBox(target);
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusBox(index - 1);
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusBox(index + 1);
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const next = commit(e.clipboardData.getData('text'));
    focusBox(next.length);
  };

  return (
    <div>
      {label && <span className="label mb-2 block">{label}</span>}
      <div className="flex justify-between gap-2" onPaste={handlePaste}>
        {Array.from({ length }, (_, index) => (
          <input
            key={index}
            ref={(el) => {
              boxes.current[index] = el;
            }}
            // `text` with a numeric inputMode, not `number`: a number input brings
            // spinners and lets "e" and "-" through, neither of which is a digit.
            type="text"
            inputMode="numeric"
            // Only the first box claims autofill. Chrome and Safari fill the whole
            // code into whichever box carries it, and our paste handling spreads it.
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={length}
            value={digits[index] || ''}
            onChange={handleInput(index)}
            onKeyDown={handleKeyDown(index)}
            onFocus={(e) => e.target.select()}
            disabled={disabled}
            autoFocus={autoFocus && index === 0}
            aria-label={`Digit ${index + 1}`}
            aria-invalid={invalid}
            className={`h-14 w-full min-w-0 rounded-xl border bg-white text-center text-2xl font-bold
              text-ink-900 transition focus:outline-none focus:ring-2 disabled:bg-ink-50
              disabled:text-ink-400 ${
                invalid
                  ? 'border-danger focus:border-danger focus:ring-red-100'
                  : 'border-ink-200 focus:border-brand-500 focus:ring-brand-100'
              } ${index === activeIndex && !invalid ? 'border-brand-400' : ''}`}
          />
        ))}
      </div>
    </div>
  );
}
