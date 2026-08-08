# Internationalisation

The storefront speaks 12 languages. Nothing user-facing is hardcoded — every
string comes from `t()`, and the active language is decided in one place.

## Layout

```
i18n/
  languages.js          Registry: code, native + English name, locale, landmark.
  index.js              i18next init, detection order, <html lang> syncing.
  LanguageProvider.jsx  Policy: whose choice wins, when it is persisted.
  locales/<code>/<namespace>.json
```

Server side, `server/src/config/languages.js` holds the same code list — it is
the enum for `User.language` and nothing else on the server is language-aware.

## Namespaces

Bundles are split so a visitor downloads only what the page needs:

| Namespace  | Loaded by                                             |
|------------|-------------------------------------------------------|
| `common`   | Always. Header, footer, buttons, validation, toasts, errors, status labels. |
| `shop`     | Home, listing, product details, filters, search, reviews. |
| `checkout` | Cart, wishlist, checkout, payment, order confirmation. |
| `account`  | Profile, orders, addresses, settings, all auth screens. |
| `pages`    | Contact, Careers.                                      |

English `common` is bundled into the main chunk rather than fetched — it is the
fallback for every other language and backs the shell that renders before any
route resolves, so `t()` must work on the very first frame. Everything else is a
separate chunk fetched on demand.

## Resolution order

`?lang=xx` → saved choice (localStorage) → `navigator.languages` → English.

`?lang=` wins because the hreflang alternates emitted by `<Seo>` point at it: a
visitor arriving from a Tamil search result lands in Tamil regardless of their
browser. A signed-in user's saved language overrides all of the above on session
restore — that is the cross-device sync.

## Coverage

All 12 languages are complete across all 5 namespaces — every visible string on
every page is translated, with no English fallback in normal operation.

## Fallback

The fallback chain still exists as a safety net. Any key missing from a language
falls through to English, per-key. A language that has not translated a namespace
at all simply has no file for it; the loader resolves empty and English fills in.
This is what lets a *new* key ship before its translations land without ever
rendering a raw key path — and what lets a new language go live incrementally.

## Adding a language

1. Add an entry to `languages.js` (and its landmark to
   `components/language/LandmarkArt.jsx`, or leave `landmark` off for the globe).
2. Add its code to `server/src/config/languages.js`.
3. Copy the five `locales/en/*.json` files into `locales/<code>/` and translate
   the values. Start with `common.json` — it is what every page shows, and the
   route namespaces fall back to English until they land.
4. Run `npm run check:locales`.

No component changes are needed; the selector, detector, `<html lang>` and the
hreflang tags all read from the registry.

## Adding or changing a string

Add the key to `locales/en/<namespace>.json` first — English is the source of
truth and the fallback. Then run:

```
npm run check:locales
```

It fails on keys that exist in a translation but not in English, keys English has
that a translation has dropped, and — the one that bites hardest — a translated
string that lost or renamed a `{{placeholder}}`.

## Conventions

- Interpolate values, never concatenate: `t('cart.itemCount', { count })`, not
  `count + ' ' + t('cart.items')`. Word order differs between these languages.
- Use `<Trans>` when a sentence contains a link or emphasis, so each language can
  place the marked-up part where it reads naturally.
- Plurals use i18next's `_one` / `_other` suffixes. Languages that do not split
  on count still need both keys; give them the same string.
- Admin-authored catalogue data (product names, category names, banner copy,
  attribute labels) is **not** translated here — it is content, and it renders as
  the admin wrote it. Only the frame around it is translated.
