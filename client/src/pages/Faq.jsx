import { useEffect, useMemo, useState } from 'react';

import useDebounce from '../hooks/useDebounce';
import Seo from '../components/common/Seo';
import Icon from '../components/common/Icon';
import Breadcrumb from '../components/common/Breadcrumb';
import EmptyState from '../components/common/EmptyState';
import RelatedPolicies from '../components/legal/RelatedPolicies';
import SupportCta from '../components/legal/SupportCta';
import usePolicyVars from '../components/legal/usePolicyVars';

/** Case- and punctuation-insensitive, so "cod" finds "C.O.D." and "COD". */
const normalise = (value = '') => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const matches = (item, needle) =>
  normalise(item.q).includes(needle) || normalise(item.a).includes(needle);

const keyOf = (categoryId, index) => `${categoryId}:${index}`;

/**
 * One question. Kept uncontrolled-ish on purpose: the parent owns which keys are
 * open, so "expand all" and the auto-expand on search can both drive it.
 */
function Question({ id, question, answer, open, onToggle }) {
  return (
    <div className="border-b border-ink-100 last:border-b-0">
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`${id}-answer`}
          id={`${id}-button`}
          className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-ink-50/70"
        >
          <span className="text-sm font-semibold text-ink-800">{question}</span>
          <Icon
            name="chevronDown"
            size={18}
            className={`mt-0.5 shrink-0 text-ink-400 transition-transform duration-200 ${
              open ? 'rotate-180 text-brand-600' : ''
            }`}
          />
        </button>
      </h3>

      {open && (
        <div
          id={`${id}-answer`}
          role="region"
          aria-labelledby={`${id}-button`}
          className="animate-fade-in px-5 pb-5 pr-12"
        >
          <p className="text-sm leading-relaxed text-ink-600">{answer}</p>
        </div>
      )}
    </div>
  );
}

export default function Faq() {
  const { tx, list } = usePolicyVars();

  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('all');
  const [openKeys, setOpenKeys] = useState(() => new Set());

  const search = useDebounce(query, 250);
  const categories = list('faq.categories');

  // Filtering runs over the translated copy, so a Hindi shopper searches Hindi.
  const filtered = useMemo(() => {
    const needle = normalise(search);

    return categories
      .filter((category) => topic === 'all' || category.id === topic)
      .map((category) => ({
        ...category,
        /*
         * Each item carries its position in the *unfiltered* category, because
         * that is what its open/closed key is built from. Re-deriving the key from
         * the filtered list would make the third result inherit the third
         * question's state the moment a search narrowed the list.
         */
        items: category.items
          .map((item, index) => ({ ...item, index }))
          .filter((item) => !needle || matches(item, needle)),
      }))
      .filter((category) => category.items.length > 0);
  }, [categories, topic, search]);

  const matchCount = filtered.reduce((sum, category) => sum + category.items.length, 0);

  /*
   * A search is a question, so its answers open themselves — scanning collapsed
   * headings for a word you just typed is work the page should have done. Clearing
   * the search closes them again, which is what leaves a clean list behind.
   *
   * This seeds the same state a click writes to, rather than overriding it, so an
   * answer opened by the search can still be closed by hand.
   */
  useEffect(() => {
    const needle = normalise(search);
    if (!needle) {
      setOpenKeys(new Set());
      return;
    }

    const hits = categories.flatMap((category) =>
      category.items
        .map((item, index) => (matches(item, needle) ? keyOf(category.id, index) : null))
        .filter(Boolean)
    );
    setOpenKeys(new Set(hits));
  }, [search, categories]);

  const isOpen = (key) => openKeys.has(key);

  const toggle = (key) =>
    setOpenKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const allKeys = filtered.flatMap((category) =>
    category.items.map((item) => keyOf(category.id, item.index))
  );
  const allOpen = allKeys.length > 0 && allKeys.every((key) => isOpen(key));

  const reset = () => {
    setQuery('');
    setTopic('all');
  };

  return (
    <>
      <Seo
        title={tx('faq.seoTitle')}
        description={tx('faq.seoDescription')}
        path="/faq"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: categories.flatMap((category) =>
            category.items.map((item) => ({
              '@type': 'Question',
              name: item.q,
              acceptedAnswer: { '@type': 'Answer', text: item.a },
            }))
          ),
        }}
      />

      <div className="container-page py-8 lg:py-12">
        <Breadcrumb items={[{ label: tx('faq.breadcrumb') }]} className="mb-4" />

        <header className="mb-8">
          <h1 className="text-3xl font-black text-ink-900 sm:text-4xl">{tx('faq.heading')}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-500">{tx('faq.intro')}</p>
        </header>

        {/* ---------------- Search ---------------- */}
        <div className="relative mb-5 max-w-2xl">
          <label htmlFor="faq-search" className="sr-only">
            {tx('faq.searchLabel')}
          </label>
          <Icon
            name="search"
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            id="faq-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tx('faq.searchPlaceholder')}
            className="input py-3 pl-11 pr-11"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={tx('faq.clearSearch')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
            >
              <Icon name="close" size={15} />
            </button>
          )}
        </div>

        {/* ---------------- Topics ---------------- */}
        <div className="hide-scrollbar mb-6 flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setTopic('all')}
            aria-pressed={topic === 'all'}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              topic === 'all'
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-ink-200 bg-white text-ink-600 hover:border-brand-300 hover:text-brand-600'
            }`}
          >
            {tx('faq.allTopics')}
          </button>

          {categories.map((category) => {
            const active = topic === category.id;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setTopic(active ? 'all' : category.id)}
                aria-pressed={active}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                  active
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-ink-200 bg-white text-ink-600 hover:border-brand-300 hover:text-brand-600'
                }`}
              >
                <Icon name={category.icon} size={15} />
                {category.title}
              </button>
            );
          })}
        </div>

        {matchCount > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-500">{tx('faq.resultCount', { count: matchCount })}</p>
            <button
              type="button"
              onClick={() => setOpenKeys(allOpen ? new Set() : new Set(allKeys))}
              className="text-sm font-semibold text-brand-600 hover:underline"
            >
              {tx(allOpen ? 'faq.collapseAll' : 'faq.expandAll')}
            </button>
          </div>
        )}

        {/* ---------------- Questions ---------------- */}
        {matchCount === 0 ? (
          <div className="card">
            <EmptyState
              icon="search"
              title={tx('faq.noResultsTitle', { query })}
              message={tx('faq.noResultsText')}
              actionLabel={tx('ui.contactSupport')}
              actionTo="/contact"
            />
            <p className="pb-8 text-center">
              <button
                type="button"
                onClick={reset}
                className="text-sm font-semibold text-brand-600 hover:underline"
              >
                {tx('faq.clearSearch')}
              </button>
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {filtered.map((category) => (
              <section key={category.id} id={category.id} className="card scroll-mt-28 overflow-hidden">
                <h2 className="flex items-center gap-3 border-b border-ink-200 bg-ink-50 px-5 py-4 text-base font-bold text-ink-900">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-brand-600 shadow-card">
                    <Icon name={category.icon} size={16} />
                  </span>
                  {category.title}
                </h2>

                <div>
                  {category.items.map((item) => {
                    const key = keyOf(category.id, item.index);
                    return (
                      <Question
                        key={key}
                        id={`faq-${category.id}-${item.index}`}
                        question={item.q}
                        answer={item.a}
                        open={isOpen(key)}
                        onToggle={() => toggle(key)}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        <SupportCta t={tx} />
        <RelatedPolicies t={tx} />
      </div>
    </>
  );
}
