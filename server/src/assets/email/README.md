# Email artwork

Every mark an email draws lives here and travels **with** the message as an
inline `cid:` attachment — `mail.service.js` scans the composed HTML for
`src="cid:…"` and attaches only the files that message actually uses.

## Why PNG, and why `cid:` rather than a URL

Emails cannot use the storefront's `<Icon>` component, and the two obvious
substitutes both fail:

- **Inline `<svg>`** — Gmail, Outlook.com and most webmail strip it from the
  body, leaving a blank hole exactly where the padlock or the social chip was.
- **`data:` URIs** — blocked by the same clients, for the same reason.

That leaves a PNG. Hosting it and linking by URL looks simpler but breaks the
moment the server is not publicly reachable: Gmail fetches every image through
its own proxy, and in development `env.serverUrl` is `http://localhost:5000`,
which that proxy can never resolve — so every mark arrives as a broken frame.
Attaching the bytes sidesteps the round trip entirely and renders in dev and
production alike.

Images still sit behind the recipient's "display images" prompt, so every one is
decorative: each has `alt=""` and a coloured cell behind it, and the email reads
correctly if none of them ever load.

## Files

| File                     | Used by                                        |
| ------------------------ | ---------------------------------------------- |
| `brand-shield-lock.png`  | `logoMark()` — dark-bar stand-in until a company logo is uploaded |
| `shield-check-light.png` | `header()` — beside the "Secure & Trusted" line |
| `secure-mail.png`        | `resetBanner()` and `verifyBanner()` — the password reset and email verification panels. **Supplied artwork, not drawn here** — see "The one supplied mark" below |
| `account-locked.png`     | `lockedBanner()` — the lock-out panel: a padlock with a clock, the one account mail whose subject is a wait rather than an inbox |
| `lock-white.png`         | `button()` — the reset mail's call to action   |
| `link-brand.png`         | `linkBox()` — the "copy and paste this link" box |
| `parcel.png`             | `parcelHero` — order confirmation / status     |
| `shield-check.png`       | source cut only — recoloured into `shield-check-brand.png` |
| `shield-check-brand.png` | `noteCard()` — the reset mail's security note; order placed, benefits row |
| `application-mail.png`   | `applicationHero` — careers acknowledgement    |
| `job-*.png`              | careers acknowledgement: details rows, "what happens next?" and the HR card |
| `inquiry-hero.png`       | `inquiryHeroPanel` — enquiry acknowledgement    |
| `inquiry-bag.png`        | unused — the enquiry mails' own white masthead, which shared `header()` replaced |
| `inquiry-headset-ink.png`| unused — the support line that masthead carried |
| `inquiry-user/mail/phone/calendar/subject/message.png` | enquiry acknowledgement: details rows |
| `inquiry-step-*.png`     | enquiry acknowledgement: "what happens next?"   |
| `inquiry-reply.png`      | `inquiryResponseCard` — the enquiry reply's "Our Response" heading |
| `inquiry-response.png`   | `inquiryResponseCard` — the headset-and-bubble illustration beside the reply |
| `order-hero.png`         | `placedHero` — order placed: two bags on a periwinkle blob, success badge included |
| `order-return.png`       | order placed, benefits row — the circular arrow the folder had no cut of |
| `social-color-*.png`     | footer chips, one per network in `SOCIAL_ICONS`, each in its own brand colour |
| `social-*.png`           | the same chips as flat white-on-dark discs — kept for a footer that needs a single-colour row |
| `step-*.png`             | order tracker, and the section icons on the order mails. Three tints per glyph: plain for a step the order is past, `-muted` for one still ahead, `-white` for the step it is sitting on (a filled disc) |
| `step-cancel-white.png`  | order tracker — the terminal step on a cancelled order |
| `step-return-white.png`  | order tracker — the terminal step on a returned order  |
| `inquiry-calendar-white.png` | invoice — the date row of the meta card, on a navy disc |
| `inquiry-user-accent.png`| invoice — the "billed & shipped to" avatar, in gold on a gold tint |
| `lock-brand.png`         | invoice — "secure payments" in the trust row           |

## Also read by the invoice

`invoice.service.js` draws from this folder too — a PDF has no more use for an
SVG than an email does, and re-cutting the same marks a second time would give
the storefront two shields and two padlocks that drift apart. The three tints
above are the only ones the invoice needed and the mails do not use; everything
else it draws (`step-clipboard-white`, `step-package-white`, `step-location`,
`inquiry-bag`, `inquiry-mail`, `inquiry-phone`, `shield-check-brand`,
`order-return`, `job-headset`, `social-color-*`, `brand-shield-lock`) is a file
an email already asks for.

The `.svg` beside a PNG is its source, kept so a mark can be recut. Nothing
references the SVGs at runtime.

For most of the folder the SVG is the original and the PNG is cut from it. For
the seven the `email-art.js` script draws — `order-hero`, `order-return`,
`inquiry-reply`, `inquiry-response`, `account-locked`, `lock-white`,
`link-brand` — the direction is reversed: the script is the source. Edit the
script, not the SVG, when one of those seven changes; nothing here rasterises an
SVG back into a PNG.

## The one supplied mark

`secure-mail.png` is the exception to everything above: it is finished artwork
handed to us, not a shape this repo can regenerate. The script used to draw it
and no longer does — `secureMail()` is gone, because leaving code that overwrites
a file it cannot reproduce is a `node scripts/email-art.js` away from destroying
the original.

It arrived as a 1254px RGB render on a white background, and two things had to
change before an email could carry it:

- **Scaled to 420.** The folder's standard: cut at 2x, drawn at 210 by the
  `width`/`height` pair. The full-size file was 1.1MB, and this mark ships as an
  attachment on every reset and every verification mail.
- **Background lifted to transparency.** The banner behind it is `brand50`, so a
  white square would have shown as a card under the artwork. The white could not
  be keyed by luminance — the letter inside the envelope is the same white as the
  page behind it, and a luminance key erases it. It is flooded inward from the
  border instead, at a tolerance of 3, which only takes white actually connected
  to the edge and leaves an enclosed white alone.

Neither step repaints a pixel of the artwork. If it is ever replaced, run the
same two steps; a raw drop-in will render as a white box at four times the weight.

## Regenerating

Each PNG is rendered at 2x and scaled down by the `width`/`height` attributes in
`mail.service.js`, which Outlook needs stated explicitly anyway. The social and
tracker glyphs are cut from the paths in
`client/src/components/common/Icon.jsx`, so an email chip and a footer chip stay
the identical mark — if a path changes there, recut the PNG here.

The script-drawn set is regenerated in place from the `server` package with:

```
node scripts/email-art.js
```

It draws the order hero, the returns arrow, the reply arrow, the response
headset, the lock-out padlock, the button padlock and the chain link as
coverage-sampled shapes, and re-cuts `shield-check.png` in brand blue so the four
benefit glyphs share one weight. It does **not** touch `secure-mail.png`.

`order-hero.png`, `secure-mail.png` and `account-locked.png` have no `.svg`
beside them. The first two did, and the transcriptions went stale the moment the
marks changed — a vector file nothing reads and nothing checks is a second source
of truth that quietly stops being true. For the two the script still draws, the
script is the source; for `secure-mail.png` the supplied render is.

A new mark can simply overwrite the old file — nothing is cached, because each
message carries its own copy of the artwork. `app.js` still serves this folder
at `/assets/email` (`immutable`, 30-day max-age) so that emails delivered before
the switch to `cid:` keep resolving their images.
