import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { productApi } from '../../api/endpoints';
import useDebounce from '../../hooks/useDebounce';
import useClickOutside from '../../hooks/useClickOutside';
import { formatPrice, optimisedImage, primaryImageOf } from '../../utils/format';
import Icon from '../common/Icon';
import Spinner from '../common/Spinner';

/** Live search with keyboard navigation. Queries only fire at 2+ characters. */
export default function SearchBar({ className = '', autoFocus = false, onNavigate }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState({ products: [], categories: [] });
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const debounced = useDebounce(term, 300);
  const inputRef = useRef(null);
  const containerRef = useClickOutside(useCallback(() => setOpen(false), []), open);

  useEffect(() => {
    let cancelled = false;

    if (debounced.trim().length < 2) {
      setResults({ products: [], categories: [] });
      setLoading(false);
      return () => {};
    }

    setLoading(true);
    productApi
      .search(debounced.trim())
      .then((res) => {
        if (cancelled) return;
        setResults(res.data);
        setOpen(true);
        setActiveIndex(-1);
      })
      .catch(() => !cancelled && setResults({ products: [], categories: [] }))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const flatResults = [...results.products, ...results.categories];

  const goToSearchPage = () => {
    if (!term.trim()) return;
    setOpen(false);
    onNavigate?.();
    navigate(`/products?search=${encodeURIComponent(term.trim())}`);
  };

  const select = (item) => {
    setOpen(false);
    setTerm('');
    onNavigate?.();
    // Categories have no price field — that's how we tell the two result types apart.
    navigate(item.finalPrice !== undefined ? `/product/${item.slug}` : `/products?category=${item.slug}`);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (activeIndex >= 0 && flatResults[activeIndex]) select(flatResults[activeIndex]);
      else goToSearchPage();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatResults.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    }
    if (e.key === 'Escape') setOpen(false);
  };

  const hasResults = flatResults.length > 0;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="flex items-center overflow-hidden rounded-lg bg-white ring-1 ring-ink-200 focus-within:ring-2 focus-within:ring-brand-500">
        <Icon name="search" size={18} className="ml-3 shrink-0 text-ink-400" />
        <input
          ref={inputRef}
          type="search"
          value={term}
          autoFocus={autoFocus}
          onChange={(e) => setTerm(e.target.value)}
          onFocus={() => term.trim().length >= 2 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t('nav.searchPlaceholder')}
          className="w-full bg-transparent px-3 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none"
          aria-label={t('a11y.searchProducts')}
          aria-expanded={open}
          aria-autocomplete="list"
          role="combobox"
        />
        {loading && <Spinner size={16} className="mr-3 text-brand-600" />}
        <button
          type="button"
          onClick={goToSearchPage}
          className="hidden h-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 sm:block"
        >
          {t('actions.search')}
        </button>
      </div>

      {open && term.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[70vh] animate-fade-in overflow-y-auto rounded-xl border border-ink-200 bg-white py-2 shadow-card-hover">
          {!hasResults && !loading && (
            <p className="px-4 py-6 text-center text-sm text-ink-500">
              {/* <Trans> keeps the emphasis on the search term where a language
                  puts it, rather than assuming English word order. */}
              <Trans
                i18nKey="nav.noMatchesRich"
                values={{ term }}
                components={[<span key="0" />, <span key="1" className="font-semibold text-ink-700" />]}
              />
            </p>
          )}

          {results.categories.length > 0 && (
            <div className="mb-1">
              <p className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-400">
                {t('nav.categories')}
              </p>
              {results.categories.map((cat, i) => {
                const index = results.products.length + i;
                return (
                  <button
                    key={cat._id}
                    type="button"
                    onClick={() => select(cat)}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-ink-50 ${
                      activeIndex === index ? 'bg-ink-50' : ''
                    }`}
                  >
                    <Icon name="grid" size={16} className="text-ink-400" />
                    <span className="font-medium text-ink-700">{cat.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {results.products.length > 0 && (
            <div>
              <p className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-400">
                {t('nav.products')}
              </p>
              {results.products.map((product, index) => (
                <button
                  key={product._id}
                  type="button"
                  onClick={() => select(product)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-ink-50 ${
                    activeIndex === index ? 'bg-ink-50' : ''
                  }`}
                >
                  <img
                    src={optimisedImage(primaryImageOf(product), { width: 80, height: 80 })}
                    alt=""
                    loading="lazy"
                    className="h-11 w-11 shrink-0 rounded-md border border-ink-200 object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 block text-sm font-medium text-ink-800">
                      {product.name}
                    </span>
                    <span className="text-xs font-semibold text-brand-600">
                      {formatPrice(product.finalPrice)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {hasResults && (
            <button
              type="button"
              onClick={goToSearchPage}
              className="mt-1 w-full border-t border-ink-100 px-4 py-2.5 text-center text-sm font-semibold text-brand-600 hover:bg-brand-50"
            >
              {t('nav.viewAllResults', { term })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
