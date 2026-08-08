import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { formatPrice, optimisedImage } from '../../utils/format';
import { inputTypeOf, optionState } from '../../utils/variants';
import Icon from '../common/Icon';

/**
 * The buy-box variant picker.
 *
 * One block per attribute, rendered from whatever the admin defined — colours as image or
 * colour swatches, everything else as chips. Choosing a value narrows the others live:
 * combinations that don't exist stay on screen but go disabled with a diagonal strike, and
 * ones that exist yet are sold out stay selectable so the buy box can say so. Nothing is
 * ever hidden, because a shopper needs to see that the size exists before they ask why they
 * can't have it.
 *
 * Each block is a real radiogroup: arrow keys move between values, Space/Enter picks one,
 * and the selected value is announced rather than only shown by colour.
 */
export default function VariantSelector({
  attributes = [],
  variants = [],
  selection = {},
  onSelect,
  showPriceHint = false,
  className = '',
}) {
  if (!attributes.length) return null;

  return (
    <div className={`space-y-5 ${className}`}>
      {attributes.map((attribute) => (
        <AttributeBlock
          key={attribute.slug}
          attribute={attribute}
          variants={variants}
          selection={selection}
          onSelect={onSelect}
          showPriceHint={showPriceHint}
        />
      ))}
    </div>
  );
}

function AttributeBlock({ attribute, variants, selection, onSelect, showPriceHint }) {
  const { t } = useTranslation('shop');
  const listRef = useRef(null);
  const type = inputTypeOf(attribute);
  const selected = selection[attribute.slug];
  const selectedValue = attribute.values.find((v) => v.slug === selected);

  /** Arrow keys walk the selectable values, skipping the ones that can't be chosen. */
  const onKeyDown = (event) => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const step = keys[event.key];
    if (!step) return;

    const selectable = attribute.values.filter(
      (value) => optionState(variants, attribute.slug, value.slug, selection).exists
    );
    if (selectable.length < 2) return;

    event.preventDefault();
    const at = selectable.findIndex((value) => value.slug === selected);
    const next = selectable[(at + step + selectable.length) % selectable.length];
    onSelect(attribute.slug, next.slug);

    // Keep focus with the value the shopper just moved to.
    requestAnimationFrame(() => {
      listRef.current?.querySelector(`[data-value="${next.slug}"]`)?.focus();
    });
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-medium text-ink-700" id={`variant-${attribute.slug}-label`}>
          {attribute.name}:
        </span>
        <span className="text-sm font-bold text-ink-900">
          {selectedValue?.label || t('variants.selectPrompt')}
        </span>
        {attribute.helpText && (
          <span className="text-xs text-ink-400">{attribute.helpText}</span>
        )}
      </div>

      <div
        ref={listRef}
        role="radiogroup"
        aria-labelledby={`variant-${attribute.slug}-label`}
        onKeyDown={onKeyDown}
        className={`flex flex-wrap gap-2.5 ${type === 'image' ? 'gap-3' : ''}`}
      >
        {attribute.values.map((value) => {
          const state = optionState(variants, attribute.slug, value.slug, selection);
          const isSelected = value.slug === selected;

          return (
            <VariantOption
              key={value.slug}
              type={type}
              value={value}
              attributeName={attribute.name}
              selected={isSelected}
              state={state}
              showPriceHint={showPriceHint}
              onSelect={() => onSelect(attribute.slug, value.slug)}
            />
          );
        })}
      </div>
    </div>
  );
}

function VariantOption({ type, value, attributeName, selected, state, showPriceHint, onSelect }) {
  const { t } = useTranslation('shop');

  // A combination that simply doesn't exist can't be picked. One that exists but is sold
  // out stays clickable, so choosing it tells the shopper exactly that.
  const disabled = !state.exists;
  const unavailable = disabled || !state.inStock;

  // Colour alone never carries the strike-through, so the state is spelled out for
  // screen readers and repeated in the tooltip for sighted pointer users.
  const status = disabled
    ? t('variants.stateUnavailable')
    : state.inStock
      ? ''
      : t('variants.stateOutOfStock');
  const aria = t('variants.optionAria', {
    attribute: attributeName,
    value: value.label,
    status: status ? `, ${status}` : '',
  });

  const shared = {
    type: 'button',
    role: 'radio',
    'aria-checked': selected,
    'aria-disabled': unavailable,
    'aria-label': aria,
    'data-value': value.slug,
    tabIndex: selected ? 0 : -1,
    disabled,
    onClick: disabled ? undefined : onSelect,
    title: unavailable
      ? t('variants.optionTitle', {
          value: value.label,
          reason: disabled ? t('variants.reasonCombination') : t('variants.stateOutOfStock'),
        })
      : value.label,
  };

  if (type === 'image') {
    return (
      <button
        {...shared}
        className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-white transition
                    ${selected ? 'border-brand-600 ring-2 ring-brand-100' : 'border-ink-200 hover:border-ink-400'}
                    ${unavailable ? 'variant-unavailable' : ''}
                    ${disabled ? 'cursor-not-allowed' : ''}`}
      >
        {value.image?.url ? (
          <img
            src={optimisedImage(value.image.url, { width: 128, height: 128 })}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="grid h-full w-full place-items-center px-1 text-[10px] font-semibold text-ink-600">
            {value.label}
          </span>
        )}
        {selected && (
          <span className="absolute bottom-0 right-0 grid h-4 w-4 place-items-center rounded-tl-md bg-brand-600 text-white">
            <Icon name="check" size={10} />
          </span>
        )}
      </button>
    );
  }

  if (type === 'swatch') {
    return (
      <button
        {...shared}
        className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full transition
                    ${selected ? 'ring-2 ring-brand-600 ring-offset-2' : 'ring-1 ring-ink-300 hover:ring-ink-400'}
                    ${unavailable ? 'variant-unavailable' : ''}
                    ${disabled ? 'cursor-not-allowed' : ''}`}
      >
        <span
          className="h-8 w-8 rounded-full border border-black/10"
          style={{ backgroundColor: value.hex || '#e2e8f0' }}
        />
        {selected && (
          // Tick colour follows the swatch so it stays legible on both black and white.
          <Icon
            name="check"
            size={14}
            className={`absolute ${isLight(value.hex) ? 'text-ink-900' : 'text-white'}`}
          />
        )}
      </button>
    );
  }

  return (
    <button
      {...shared}
      className={`relative min-w-[52px] rounded-md border px-3.5 py-2 text-sm font-semibold transition
                  ${
                    selected
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-ink-300 bg-white text-ink-700 hover:border-brand-500 hover:text-brand-600'
                  }
                  ${unavailable ? 'variant-unavailable' : ''}
                  ${disabled ? 'cursor-not-allowed' : ''}`}
    >
      {value.label}
      {showPriceHint && state.minPrice != null && (
        <span className="mt-0.5 block text-[10px] font-medium text-ink-400">
          {formatPrice(state.minPrice)}
        </span>
      )}
    </button>
  );
}

/** Rough luminance test — decides whether a tick on a swatch should be dark or light. */
function isLight(hex) {
  if (!hex) return true;
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  if (full.length !== 6) return true;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}
