import Icon from '../common/Icon';
import LandmarkArt from './LandmarkArt';

/**
 * One selectable language, laid out as a card: radio, native name, English name
 * and a regional landmark.
 *
 * A real `<input type="radio">` does the work and is only visually hidden — that
 * buys native arrow-key navigation inside the group, the correct "radio, 3 of 12,
 * selected" screen-reader announcement, and form semantics, none of which a div
 * with role="radio" gets for free. The visible ring is driven off `peer-focus-visible`
 * so keyboard users see focus without every mouse click lighting up, matching the
 * global `:focus-visible` rule in styles/index.css.
 */
export default function LanguageCard({ language, selected, busy = false, onSelect, name }) {
  return (
    <label
      className={`group relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-xl border p-3.5
                  transition-all duration-200 active:scale-[.99]
                  ${
                    selected
                      ? 'border-brand-500 bg-brand-50 shadow-card'
                      : 'border-ink-200 bg-white hover:border-brand-300 hover:shadow-card'
                  }
                  ${busy ? 'pointer-events-none opacity-60' : ''}`}
    >
      <input
        type="radio"
        name={name}
        value={language.code}
        checked={selected}
        onChange={() => onSelect(language.code)}
        disabled={busy}
        className="peer sr-only"
      />

      {/* Ring lives on the card, not the hidden input, so focus is actually visible. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-brand-500 ring-offset-2 opacity-0 peer-focus-visible:opacity-100"
      />

      <span
        aria-hidden="true"
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors
                    ${selected ? 'border-brand-600 bg-brand-600' : 'border-ink-300 group-hover:border-brand-400'}`}
      >
        {selected && <Icon name="check" size={11} className="text-white" strokeWidth="3" />}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-sm font-bold ${selected ? 'text-brand-800' : 'text-ink-900'}`}
        >
          {language.native}
        </span>
        <span className="mt-0.5 block truncate text-xs text-ink-500">{language.english}</span>
      </span>

      <LandmarkArt
        name={language.landmark}
        className={`h-10 w-16 shrink-0 transition-colors
                    ${selected ? 'text-brand-400' : 'text-ink-300 group-hover:text-ink-400'}`}
      />
    </label>
  );
}
