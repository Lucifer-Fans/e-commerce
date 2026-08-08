import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { formatPrice } from '../../utils/format';
import { DISCOUNT_FILTERS, RATING_FILTERS } from '../../utils/constants';
import Icon from '../common/Icon';
import Rating from '../common/Rating';

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-ink-100 py-4 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mb-2 flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-bold text-ink-900">{title}</span>
        <Icon
          name="chevronDown"
          size={16}
          className={`text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="space-y-1.5 pt-1">{children}</div>}
    </div>
  );
}

function CheckRow({ checked, onChange, label, count }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded px-1 py-1 text-sm text-ink-600 hover:text-ink-900">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
      />
      <span className="flex-1">{label}</span>
      {count !== undefined && <span className="text-xs text-ink-400">({count})</span>}
    </label>
  );
}

/**
 * Filter panel driven by the live `/products/filters` metadata, so brands and
 * price bounds always reflect what is actually in the catalogue.
 */
export default function FilterSidebar({ filters, onChange, onReset, meta, className = '' }) {
  const { t } = useTranslation('shop');
  const categories = useSelector((s) => s.catalog.categories);

  const bounds = meta?.priceRange || { min: 0, max: 100000 };
  const [priceDraft, setPriceDraft] = useState({
    min: filters.minPrice ?? '',
    max: filters.maxPrice ?? '',
  });

  // Keep the local draft in sync when filters are reset or restored from the URL.
  useEffect(() => {
    setPriceDraft({ min: filters.minPrice ?? '', max: filters.maxPrice ?? '' });
  }, [filters.minPrice, filters.maxPrice]);

  const activeCategory = categories.find((c) => c.slug === filters.category);
  const activeCount = [
    filters.category, filters.subCategory, filters.brand, filters.minPrice,
    filters.maxPrice, filters.minDiscount, filters.minRating, filters.availability,
  ].filter(Boolean).length;

  const applyPrice = () => {
    onChange({
      minPrice: priceDraft.min === '' ? undefined : Number(priceDraft.min),
      maxPrice: priceDraft.max === '' ? undefined : Number(priceDraft.max),
    });
  };

  return (
    <aside className={className} aria-label={t('filters.aria')}>
      <div className="flex items-center justify-between border-b border-ink-200 pb-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-ink-900">
          <Icon name="filter" size={17} />
          {t('filters.title')}
          {activeCount > 0 && (
            <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </h2>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            {t('filters.resetAll')}
          </button>
        )}
      </div>

      <Section title={t('filters.category')}>
        {categories.map((category) => (
          <CheckRow
            key={category._id}
            checked={filters.category === category.slug}
            // Switching category invalidates the sub-category selection.
            onChange={() =>
              onChange({
                category: filters.category === category.slug ? undefined : category.slug,
                subCategory: undefined,
              })
            }
            label={category.name}
          />
        ))}
      </Section>

      {activeCategory?.subCategories?.length > 0 && (
        <Section title={t('filters.subCategory')}>
          {activeCategory.subCategories.map((sub) => (
            <CheckRow
              key={sub._id}
              checked={filters.subCategory === sub.slug}
              onChange={() =>
                onChange({ subCategory: filters.subCategory === sub.slug ? undefined : sub.slug })
              }
              label={sub.name}
              count={meta?.subCategories?.find((s) => s.slug === sub.slug)?.count}
            />
          ))}
        </Section>
      )}

      <Section title={t('filters.price')}>
        <div className="mb-2 flex items-center gap-2">
          <input
            type="number"
            value={priceDraft.min}
            min={bounds.min}
            onChange={(e) => setPriceDraft((p) => ({ ...p, min: e.target.value }))}
            placeholder={String(bounds.min)}
            className="input !py-1.5 text-sm"
            aria-label={t('filters.minPrice')}
          />
          <span className="text-ink-400">–</span>
          <input
            type="number"
            value={priceDraft.max}
            max={bounds.max}
            onChange={(e) => setPriceDraft((p) => ({ ...p, max: e.target.value }))}
            placeholder={String(bounds.max)}
            className="input !py-1.5 text-sm"
            aria-label={t('filters.maxPrice')}
          />
        </div>
        <button type="button" onClick={applyPrice} className="btn-outline w-full !py-1.5 text-xs">
          {t('filters.applyPrice')}
        </button>
        <p className="pt-1 text-[11px] text-ink-400">
          {t('filters.catalogueRange', {
            min: formatPrice(bounds.min),
            max: formatPrice(bounds.max),
          })}
        </p>
      </Section>

      {meta?.brands?.length > 0 && (
        <Section title={t('filters.brand')}>
          <div className="max-h-52 overflow-y-auto pr-1">
            {meta.brands.map((brand) => (
              <CheckRow
                key={brand.name}
                checked={filters.brand === brand.name}
                onChange={() =>
                  onChange({ brand: filters.brand === brand.name ? undefined : brand.name })
                }
                label={brand.name}
                count={brand.count}
              />
            ))}
          </div>
        </Section>
      )}

      <Section title={t('filters.discount')}>
        {DISCOUNT_FILTERS.map((value) => (
          <CheckRow
            key={value}
            checked={Number(filters.minDiscount) === value}
            onChange={() =>
              onChange({ minDiscount: Number(filters.minDiscount) === value ? undefined : value })
            }
            label={t('filters.discountAndAbove', { value })}
          />
        ))}
      </Section>

      <Section title={t('filters.customerRating')}>
        {RATING_FILTERS.map((value) => (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-2.5 rounded px-1 py-1 text-sm text-ink-600 hover:text-ink-900"
          >
            <input
              type="checkbox"
              checked={Number(filters.minRating) === value}
              onChange={() =>
                onChange({ minRating: Number(filters.minRating) === value ? undefined : value })
              }
              className="h-4 w-4 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
            />
            <Rating value={value} size={13} showValue={false} />
            <span>{t('filters.andUp')}</span>
          </label>
        ))}
      </Section>

      <Section title={t('filters.availabilityTitle')}>
        <CheckRow
          checked={filters.availability === 'in_stock'}
          onChange={() =>
            onChange({ availability: filters.availability === 'in_stock' ? undefined : 'in_stock' })
          }
          label={t('filters.availability.in_stock')}
        />
        <CheckRow
          checked={filters.availability === 'out_of_stock'}
          onChange={() =>
            onChange({
              availability: filters.availability === 'out_of_stock' ? undefined : 'out_of_stock',
            })
          }
          label={t('filters.availability.out_of_stock')}
        />
      </Section>
    </aside>
  );
}
