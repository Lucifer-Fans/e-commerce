import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { SITE_URL } from '../../utils/constants';
import { LANGUAGES, getLanguage } from '../../i18n/languages';
import useSettings from '../../settings/useSettings';

/**
 * Per-route meta tags. Also emits Open Graph, Twitter and optional JSON-LD so
 * product pages are shareable and indexable.
 *
 * Language handling for SEO:
 *   • <html lang> is set here (and in i18n/index.js on every switch) so crawlers
 *     and screen readers agree on what language the page is in;
 *   • `og:locale` names the current one and `og:locale:alternate` the rest;
 *   • hreflang alternates point at `?lang=<code>` of the same canonical path, so
 *     a Tamil result can outrank the English one for a Tamil query without the
 *     two competing as duplicate content — x-default falls back to English.
 */
export default function Seo({
  title,
  description,
  image,
  path = '',
  type = 'website',
  keywords,
  jsonLd,
  noIndex = false,
}) {
  const { i18n } = useTranslation();
  const language = getLanguage(i18n.language);
  const { siteName, seo } = useSettings();

  // The admin's own meta copy is the site-wide default; a page that passes its own
  // keeps it. Both are translated server-side, so they follow the active language.
  const fullTitle = title ? `${title} | ${siteName}` : seo.metaTitle || siteName;
  const metaDescription = description || seo.metaDescription || '';
  const metaKeywords = keywords?.length ? keywords : seo.metaKeywords;
  // Alternates hang off the canonical path, never off its query string.
  const canonicalPath = path.split('?')[0];
  const url = `${SITE_URL}${path}`;

  return (
    <Helmet htmlAttributes={{ lang: language.code, dir: language.dir }}>
      <title>{fullTitle}</title>
      {metaDescription && <meta name="description" content={metaDescription} />}
      {metaKeywords?.length ? <meta name="keywords" content={metaKeywords.join(', ')} /> : null}
      <link rel="canonical" href={url} />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}

      {!noIndex &&
        LANGUAGES.map((item) => (
          <link
            key={item.code}
            rel="alternate"
            hrefLang={item.code}
            href={`${SITE_URL}${canonicalPath}?lang=${item.code}`}
          />
        ))}
      {!noIndex && (
        <link rel="alternate" hrefLang="x-default" href={`${SITE_URL}${canonicalPath}`} />
      )}

      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      {metaDescription && <meta property="og:description" content={metaDescription} />}
      <meta property="og:url" content={url} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:locale" content={language.locale.replace('-', '_')} />
      {LANGUAGES.filter((item) => item.code !== language.code).map((item) => (
        <meta
          key={item.code}
          property="og:locale:alternate"
          content={item.locale.replace('-', '_')}
        />
      ))}
      {image && <meta property="og:image" content={image} />}

      <meta name="twitter:card" content={image ? 'summary_large_image' : 'summary'} />
      <meta name="twitter:title" content={fullTitle} />
      {metaDescription && <meta name="twitter:description" content={metaDescription} />}
      {image && <meta name="twitter:image" content={image} />}

      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify({ inLanguage: language.code, ...jsonLd })}
        </script>
      )}
    </Helmet>
  );
}
