/**
 * Bakes the admin's Organization → SEO settings into index.html at build time.
 *
 * Why this exists: the storefront is a client-rendered SPA, so every meta tag
 * react-helmet-async produces arrives only after the bundle has executed. Google
 * renders JavaScript and sees them; the crawlers behind WhatsApp, Facebook,
 * Twitter and LinkedIn link previews do not, and they read the shipped index.html
 * verbatim. Without this the admin can change the meta title all they like and
 * every shared link still previews as whatever was hardcoded at commit time.
 *
 * The tags are written with `data-rh="true"` — react-helmet-async's own marker —
 * so the moment the app hydrates, helmet claims and replaces them with the
 * per-route copy instead of leaving two competing sets in the head.
 *
 * Scope: one snapshot for the whole site, refreshed on each build. Per-product
 * previews need the request-time injection the server does (see
 * server/src/middleware/htmlMeta.js); this covers the site-wide default and any
 * deploy where the build is served as plain static files.
 *
 * The API being unreachable is a warning, never a failed build — a deploy must
 * not hinge on the settings endpoint being up at that moment.
 */

const MARKER = /(<!--seo-->)[\s\S]*?(<!--\/seo-->)/;

const escapeAttr = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** Absolute URLs only: a preview crawler has no page context to resolve against. */
const absolute = (url, siteUrl) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${siteUrl.replace(/\/+$/, '')}/${String(url).replace(/^\/+/, '')}`;
};

const warnOrConsole = (ctx, message) => {
  if (ctx?.warn) ctx.warn(message);
  else console.warn(message);
};

async function fetchSettings(apiUrl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiUrl.replace(/\/+$/, '')}/settings`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    return body?.data?.settings || null;
  } finally {
    clearTimeout(timer);
  }
}

function renderTags({ title, description, keywords, image, siteName, siteUrl }) {
  const tag = (markup) => `    ${markup}`;
  const lines = [tag(`<title data-rh="true">${escapeAttr(title)}</title>`)];

  if (description) {
    lines.push(tag(`<meta data-rh="true" name="description" content="${escapeAttr(description)}" />`));
  }
  if (keywords?.length) {
    lines.push(
      tag(`<meta data-rh="true" name="keywords" content="${escapeAttr(keywords.join(', '))}" />`)
    );
  }

  lines.push(tag(`<meta data-rh="true" property="og:type" content="website" />`));
  lines.push(tag(`<meta data-rh="true" property="og:site_name" content="${escapeAttr(siteName)}" />`));
  lines.push(tag(`<meta data-rh="true" property="og:title" content="${escapeAttr(title)}" />`));
  if (description) {
    lines.push(
      tag(`<meta data-rh="true" property="og:description" content="${escapeAttr(description)}" />`)
    );
  }
  lines.push(tag(`<meta data-rh="true" property="og:url" content="${escapeAttr(siteUrl)}" />`));
  if (image) {
    lines.push(tag(`<meta data-rh="true" property="og:image" content="${escapeAttr(image)}" />`));
  }

  lines.push(
    tag(`<meta data-rh="true" name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`)
  );
  lines.push(tag(`<meta data-rh="true" name="twitter:title" content="${escapeAttr(title)}" />`));
  if (description) {
    lines.push(
      tag(`<meta data-rh="true" name="twitter:description" content="${escapeAttr(description)}" />`)
    );
  }
  if (image) {
    lines.push(tag(`<meta data-rh="true" name="twitter:image" content="${escapeAttr(image)}" />`));
  }

  return lines.join('\n');
}

/**
 * @param {object} env  The resolved VITE_* environment for this mode.
 */
export default function seoHtml(env = {}) {
  const apiUrl = env.VITE_API_URL || 'http://localhost:5000/api/v1';
  const siteUrl = (env.VITE_SITE_URL || 'http://localhost:5173').replace(/\/+$/, '');
  const appName = env.VITE_APP_NAME || 'Premium Store';
  const timeoutMs = Number(env.VITE_SEO_BUILD_TIMEOUT_MS || 8000);

  return {
    name: 'seo-html',
    // `apply: 'build'` on purpose: in dev the placeholder is fine, and a cold API
    // must not add seconds to every index.html the dev server hands out.
    apply: 'build',

    async transformIndexHtml(html) {
      if (!MARKER.test(html)) {
        warnOrConsole(this, 'index.html has no <!--seo--> block — meta tags were left untouched.');
        return html;
      }

      let settings = null;
      try {
        settings = await fetchSettings(apiUrl, timeoutMs);
      } catch (err) {
        warnOrConsole(
          this,
          `Could not read SEO settings from ${apiUrl}/settings (${err.message}). ` +
            'index.html keeps its placeholder meta tags — rebuild once the API is reachable.'
        );
        return html;
      }

      const siteName = settings?.general?.siteName?.trim() || appName;
      const seo = settings?.seo || {};
      const block = renderTags({
        title: seo.metaTitle?.trim() || siteName,
        description: seo.metaDescription?.trim() || '',
        keywords: seo.metaKeywords || [],
        image: absolute(settings?.branding?.logo?.url, siteUrl),
        siteName,
        siteUrl,
      });

      return html.replace(MARKER, `$1\n${block}\n    $2`);
    },
  };
}
