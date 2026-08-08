import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import FeatureTable from './FeatureTable';
import ProductReviews from './ProductReviews';
import Icon from '../common/Icon';
import EmptyState from '../common/EmptyState';

function FaqList({ faqs = [] }) {
  const { t } = useTranslation('shop');
  const [openIndex, setOpenIndex] = useState(0);

  if (!faqs.length) {
    return (
      <EmptyState icon="info" title={t('faq.emptyTitle')} message={t('faq.emptyMessage')} />
    );
  }

  return (
    <div className="divide-y divide-ink-100">
      {faqs.map((faq, index) => {
        const open = openIndex === index;
        return (
          <div key={index}>
            <button
              type="button"
              onClick={() => setOpenIndex(open ? -1 : index)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-4 py-4 text-left"
            >
              <span className="text-sm font-semibold text-ink-800">{faq.question}</span>
              <Icon
                name="chevronDown"
                size={18}
                className={`shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </button>
            {open && <p className="pb-4 text-sm leading-relaxed text-ink-600">{faq.answer}</p>}
          </div>
        );
      })}
    </div>
  );
}

/** Tabbed detail panel: Description · Product Details · Features · Reviews · FAQs. */
export default function ProductTabs({ product }) {
  const { t } = useTranslation(['shop', 'common']);
  const [active, setActive] = useState('description');

  // The count suffix is part of the translated label so a language can place it
  // wherever it reads naturally.
  const withCount = (key, count) =>
    count ? t(`tabs.${key}WithCount`, { count }) : t(`tabs.${key}`);

  const tabs = [
    { key: 'description', label: t('tabs.description') },
    { key: 'details', label: t('tabs.details') },
    { key: 'features', label: withCount('features', product.features?.length) },
    { key: 'reviews', label: withCount('reviews', product.ratings?.count) },
    { key: 'faqs', label: withCount('faqs', product.faqs?.length) },
  ];

  const detailRows = [
    [t('details.rows.brand'), product.brand],
    [t('details.rows.category'), product.category?.name],
    [t('details.rows.subCategory'), product.subCategory?.name],
    [t('details.rows.sku'), product.sku],
    [
      t('details.rows.availability'),
      product.stock > 0
        ? t('details.inStockUnits', { count: product.stock })
        : t('common:product.outOfStock'),
    ],
    [t('details.rows.tags'), product.tags?.length ? product.tags.join(', ') : null],
  ].filter(([, value]) => Boolean(value));

  return (
    <section className="card mt-8 overflow-hidden">
      <div className="hide-scrollbar flex overflow-x-auto border-b border-ink-200 bg-ink-50" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => setActive(tab.key)}
            className={`whitespace-nowrap border-b-2 px-5 py-3.5 text-sm font-semibold transition ${
              active === tab.key
                ? 'border-brand-600 bg-white text-brand-600'
                : 'border-transparent text-ink-500 hover:text-ink-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-5 sm:p-6" role="tabpanel">
        {active === 'description' && (
          <>
            {product.highlights?.length > 0 && (
              <ul className="mb-6 grid gap-2.5 sm:grid-cols-2">
                {product.highlights.map((highlight, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-ink-700">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-50 text-success">
                      <Icon name="check" size={12} />
                    </span>
                    {highlight}
                  </li>
                ))}
              </ul>
            )}
            {/* Sanitised server-side by the XSS middleware before it is stored. */}
            <div
              className="rich-text max-w-3xl"
              dangerouslySetInnerHTML={{ __html: product.description }}
            />
          </>
        )}

        {active === 'details' && (
          <div className="max-w-2xl">
            {detailRows.map(([label, value]) => (
              <dl key={label} className="flex border-b border-ink-100 py-3 last:border-0">
                <dt className="w-2/5 shrink-0 text-sm font-medium text-ink-500">{label}</dt>
                <dd className="flex-1 text-sm font-semibold text-ink-800">{value}</dd>
              </dl>
            ))}
          </div>
        )}

        {active === 'features' && <FeatureTable features={product.features} />}
        {active === 'reviews' && <ProductReviews product={product} />}
        {active === 'faqs' && <FaqList faqs={product.faqs} />}
      </div>
    </section>
  );
}
