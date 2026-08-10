const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../utils/logger');
const Setting = require('../models/Setting');
const { ORDER_STATUSES } = require('../models/Order');

let transporter = null;
if (env.mailEnabled) {
  transporter = nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.secure,
    auth: { user: env.mail.user, pass: env.mail.pass },
    // See config/env.js: the pool is what stops every message paying for a fresh
    // TLS handshake, and the timeouts are what stop a stalled provider holding a
    // socket — and the request behind it — open indefinitely.
    pool: env.mail.pool,
    maxConnections: env.mail.maxConnections,
    connectionTimeout: env.mail.connectionTimeoutMs,
    greetingTimeout: env.mail.greetingTimeoutMs,
    socketTimeout: env.mail.socketTimeoutMs,
  });
}

const ASSET_DIR = path.join(__dirname, '../assets/email');

/**
 * Content-ID for a piece of artwork. Every image travels *with* the message as
 * an inline attachment rather than as a link back to us: a hosted URL only
 * renders once the server is reachable from the recipient's mail client — and
 * in development `env.serverUrl` is localhost, which Gmail's image proxy can
 * never fetch, so every mark arrives as a broken frame. `cid:` bytes are in the
 * envelope and render everywhere, dev and production alike.
 */
const cidFor = (file) => `${file.replace(/[^a-z0-9]+/gi, '-')}@springwala.mail`;

/**
 * The artwork a composed message actually refers to. Only what the HTML uses is
 * attached, so a password-reset email does not carry the order tracker's glyphs.
 */
/**
 * The artwork folder, indexed by content id and read exactly once.
 *
 * It used to be scanned per message, which put a synchronous directory read —
 * the one flavour of I/O that stops the event loop dead rather than yielding —
 * on the path of every mail, and so on the path of every request that sends
 * one. The files ship with the deploy and cannot change under a running
 * process, so there is nothing to re-read for.
 */
let assetIndex = null;
function assetsByCid() {
  if (assetIndex) return assetIndex;

  assetIndex = new Map();
  try {
    for (const file of fs.readdirSync(ASSET_DIR)) {
      if (file.endsWith('.png')) assetIndex.set(cidFor(file), file);
    }
  } catch (err) {
    logger.warn(`Could not read email asset folder: ${err.message}`);
  }
  return assetIndex;
}

function inlineAttachments(html = '') {
  const wanted = new Set();
  for (const match of html.matchAll(/src="cid:([^"]+)"/g)) wanted.add(match[1]);
  if (!wanted.size) return [];

  const assets = assetsByCid();
  const attachments = [];
  for (const cid of wanted) {
    const file = assets.get(cid);
    if (!file) continue;
    attachments.push({
      filename: file,
      path: path.join(ASSET_DIR, file),
      cid,
      contentDisposition: 'inline',
    });
  }
  return attachments;
}

/**
 * Never throws — a mail outage must not fail the request that triggered it.
 * Returns false when the message could not be sent so callers can adjust copy.
 */
async function sendMail({ to, subject, html, text }) {
  if (!transporter) {
    logger.warn(`SMTP not configured — skipped "${subject}" to ${to}`);
    if (!env.isProd) logger.debug(text || html);
    return false;
  }
  try {
    await transporter.sendMail({
      from: env.mail.from,
      to,
      subject,
      html,
      text,
      attachments: inlineAttachments(html),
    });
    return true;
  } catch (err) {
    logger.error(`Mail send failed (${subject} → ${to}): ${err.message}`);
    return false;
  }
}

/** Escapes visitor-supplied text before it is interpolated into an HTML email. */
const escapeHtml = (value = '') =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );

/* ------------------------------------------------------------------ *
 * Formatting — mirrors client/src/utils/format.js so an email and the
 * order page it links to never disagree on a price or a date.
 * ------------------------------------------------------------------ */
const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** &#8377; rather than the literal glyph — some Windows clients mangle it. */
const money = (value) => `&#8377;${inr.format(Number(value) || 0)}`;
const moneyText = (value) => `₹${inr.format(Number(value) || 0)}`;

const dateTime = (value) =>
  new Date(value || Date.now()).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

/** Date only — the tracker has room for "12 May 2024", not the time as well. */
const shortDate = (value) =>
  new Date(value || Date.now()).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

/**
 * An appointment, spelled out — weekday included, because "12 Aug" alone makes
 * a reader open a calendar to find out whether they can make it. The time is
 * separated by a middot rather than a comma, which the date already uses.
 *
 * Formatted in the server's own timezone, as every other date in these mails is.
 */
const appointment = (value) => {
  const at = new Date(value);
  const day = at.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const time = at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return { day, time, full: `${day} at ${time}` };
};

const titleCase = (value = '') =>
  String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** Cloudinary on-the-fly resize, same as the storefront's optimisedImage(). */
const thumb = (url, size = 120) =>
  !url || !url.includes('/upload/')
    ? url
    : url.replace('/upload/', `/upload/w_${size},h_${size},c_fill,q_auto,f_auto/`);

/* ------------------------------------------------------------------ *
 * Brand palette — mirrors tailwind.config.js so mail and storefront
 * stay one design system. Emails cannot read CSS variables, so the
 * hex values are duplicated here on purpose.
 * ------------------------------------------------------------------ */
const C = {
  brand50: '#eff6ff',
  brand100: '#dbeafe',
  brand600: '#2563eb',
  brand700: '#1d4ed8',
  // The deep end of the same ramp. The order-placed mail leads with it — its
  // headline, its button and its total are one navy, the way the storefront's
  // own confirmation screen leads with a single dark accent.
  brand900: '#1e3a8a',
  // tailwind `success` (#16a34a) and the tints the storefront pairs with it
  green50: '#f0fdf4',
  green100: '#dcfce7',
  green600: '#16a34a',
  green700: '#15803d',
  ink50: '#f8fafc',
  ink100: '#f1f5f9',
  ink200: '#e2e8f0',
  ink400: '#94a3b8',
  ink500: '#64748b',
  ink600: '#475569',
  ink900: '#0f172a',
  // Periwinkle tints — the panel behind the enquiry artwork. They sit a step
  // cooler than `brand` on purpose: an illustration should read as artwork, not
  // as a second call to action.
  iris50: '#f4f5fe',
  iris100: '#e8eafc',
  iris300: '#c3c8f3',
  iris400: '#a8afe8',
  iris700: '#4c56b8',
};
const FONT = "Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/* ------------------------------------------------------------------ *
 * Branding
 * ------------------------------------------------------------------ */

/**
 * The networks the storefront footer offers, in the footer's own order. Each
 * chip is a pre-rendered disc in server/src/assets/email — cut from the very
 * paths client/src/components/common/Icon.jsx draws, so an email chip and a
 * footer chip are the identical mark.
 */
const SOCIAL_ICONS = {
  facebook: { label: 'Facebook', file: 'social-facebook.png' },
  instagram: { label: 'Instagram', file: 'social-instagram.png' },
  twitter: { label: 'Twitter (X)', file: 'social-twitter.png' },
  linkedin: { label: 'LinkedIn', file: 'social-linkedin.png' },
  whatsapp: {
    label: 'WhatsApp',
    file: 'social-whatsapp.png',
    // Admins may store either a wa.me link or a bare number — same rule as Footer.jsx.
    href: (value) => (/^https?:/i.test(value) ? value : `https://wa.me/${value.replace(/\D/g, '')}`),
  },
};

/**
 * Artwork lives in server/src/assets/email and rides along with the message as
 * an inline `cid:` attachment (see inlineAttachments above). It has to be a real
 * image file: inline SVG is stripped by Gmail and most webmail, and a data: URI
 * fares no better, so an <img> is the only mark that survives the trip. Every
 * PNG is cut at 2x and scaled down by the width/height attributes below, which
 * Outlook needs stated explicitly anyway.
 */
const asset = (file) => `cid:${cidFor(file)}`;

/**
 * Every image carries alt text and sits on a coloured cell, so a client that
 * blocks images still shows a labelled shape rather than a broken frame.
 */
const image = (file, { width, height, alt = '', style = '', cls = '' }) =>
  `<img src="${asset(file)}" width="${width}" height="${height}" alt="${escapeHtml(alt)}"
        ${cls ? `class="${cls}"` : ''}
        style="width:${width}px;height:${height}px;border:0;outline:none;display:block;${style}">`;

let brandCache = { value: null, at: 0 };
const BRAND_TTL = 5 * 60 * 1000;

/**
 * Header, support address and social chips come from the same admin-managed
 * Organization settings the storefront footer renders, so a rebrand needs no
 * redeploy. Cached briefly — a transactional email is not worth a DB round trip
 * every time — and degrades to env defaults if the lookup fails.
 */
async function getBranding() {
  if (brandCache.value && Date.now() - brandCache.at < BRAND_TTL) return brandCache.value;

  let general = {};
  let social = {};
  let branding = {};
  try {
    const doc = await Setting.findOne({ key: 'store' }).lean();
    general = doc?.general || {};
    social = doc?.social || {};
    branding = doc?.branding || {};
  } catch (err) {
    logger.warn(`Could not load store settings for email branding: ${err.message}`);
  }

  const value = {
    siteName: general.siteName || env.appName,
    // The same uploaded mark the Organization screen owns. It is a hosted
    // (Cloudinary) URL rather than a bundled PNG, so it cannot ride along as a
    // `cid:` attachment — it is linked directly, which is safe here because the
    // upload host is publicly reachable in every environment, unlike our own server.
    logoUrl: branding.logo?.url || '',
    supportEmail: general.contactEmail || '',
    supportPhone: general.contactNumber || '',
    address: general.companyAddress || '',
    socials: Object.keys(SOCIAL_ICONS)
      .filter((key) => social[key])
      .map((key) => {
        const icon = SOCIAL_ICONS[key];
        return {
          label: icon.label,
          file: icon.file,
          href: icon.href ? icon.href(String(social[key]).trim()) : social[key],
        };
      }),
  };

  brandCache = { value, at: Date.now() };
  return value;
}

/** Settings edits must show up in the next email, not five minutes later. */
const clearBrandingCache = () => {
  brandCache = { value: null, at: 0 };
};

/* ------------------------------------------------------------------ *
 * Layout primitives
 * ------------------------------------------------------------------ */

/**
 * Tables, not flexbox: Outlook renders the desktop Word engine, which drops
 * modern layout entirely. Every rule is inline for the same reason — Gmail
 * strips <style> from forwarded copies, so the block below only carries the
 * progressive-enhancement bits (mobile stacking) that are safe to lose.
 */
const head = `
  <style>
    /* Client resets. Every one of these is a bug in some mail client rather
       than a design choice: Outlook adds its own cell spacing, Windows Phone
       and iOS re-scale text on rotate, and IE downsamples a scaled image
       badly. They are the floor the breakpoints below stand on. */
    body{margin:0!important;padding:0!important;width:100%!important;
         -webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
    table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0}
    img{border:0;outline:none;line-height:100%;-ms-interpolation-mode:bicubic}

    /* Illustrations, as opposed to the fixed 16-40px glyphs. Only artwork gets
       to shrink: a step icon scaled to 94% is a blurry icon, but a 210px hero
       inside a 300px card has to give. */
    .p-art{max-width:100%!important;height:auto!important}

    /* --- Small windows and tablets ------------------------------------- *
       The card is already max-width:100%, so down to here nothing has to
       reflow — only the generous 32px insets need to give way, since they are
       what actually squeezes the copy once the card stops being 600px. */
    @media only screen and (max-width:640px){
      .p-shell{padding:20px 8px!important}
      .p-pad{padding:28px 24px!important}
      .p-headpad{padding:16px 24px!important}
      .p-inq-pad{padding-left:24px!important;padding-right:24px!important}
    }

    /* --- Phones --------------------------------------------------------- *
       Below this the two-column rows genuinely do not fit, so they stack. */
    @media only screen and (max-width:520px){
      /* The card goes edge to edge: 12px of grey either side of a 296px card
         is 8% of the screen spent on a margin nobody reads. Its corners and
         side borders go with it, or they frame a card that has no edges. */
      .p-shell{padding:14px 0!important}
      .p-card{border-radius:0!important;border-left:0!important;border-right:0!important}
      .p-pad{padding:26px 22px!important}
      .p-headpad{padding:16px 22px!important}
      .p-inq-pad{padding-left:22px!important;padding-right:22px!important}
      .p-hero{display:none!important}
      .p-h1{font-size:23px!important;line-height:1.25!important}
      .p-btn a{display:block!important;text-align:center!important}
      /* Stacked columns lose the hairline that divided them — a left border on
         a full-width block is a stray vertical line down the copy, not a
         divider between two things. */
      .p-col{display:block!important;width:100%!important;padding:0 0 20px!important;
             border-left:0!important}
      /* Two up rather than four stacked rows: the captions are three words
         each, and four full-width bands push the footer off a second screen.
         border-box, or the 8px of padding lands *outside* the 48% and the pair
         no longer fits on one line — which drops it straight back to four
         stacked rows. The 4% left over is the gutter: it is the whitespace
         between the two cells, which has to have somewhere to go. */
      .p-trust{display:inline-block!important;width:48%!important;
               box-sizing:border-box!important;padding:0 4px 16px!important;
               vertical-align:top!important}
      /* Cells of a call-to-action bar. These live inside a padded wrapper cell,
         so zeroing their own inset here cannot push the copy against the card
         edge — which is exactly what stacking them used to do. */
      .p-cta{display:block!important;width:100%!important;padding:0 0 14px!important;
             text-align:left!important}
      .p-cta .p-btn{float:none!important;margin:0!important}
      /* Tracker: five columns of tile-over-label. The tile is the only fixed
         width left in the row, so it gives before the type does. */
      .p-step,.p-stepdot{padding-left:2px!important;padding-right:2px!important}
      .p-step-tile{width:40px!important;height:40px!important}
      .p-step-num{font-size:14px!important}
      .p-step-label{font-size:11px!important}
      .p-step-note{font-size:10px!important}
      .p-inq-copy{padding:0 20px 22px!important}
      .p-inq-label,.p-row-label{width:120px!important}
      /* Masthead: the wordmark takes the width and whatever sits opposite it
         (the trust line, the order number, the careers strapline) drops
         underneath. Both are nowrap by design, so side by side the longer of
         the two simply widened the card past the screen. */
      .p-brand,.p-brandmeta{display:block!important;width:100%!important;
                            text-align:left!important}
      .p-brandmeta{padding:9px 0 0!important}
      .p-brandmeta table{float:none!important;margin:0!important}
      .p-brandmeta td{text-align:left!important}
    }

    /* --- Narrow phones (320-400px) -------------------------------------- *
       A 320px screen leaves ~280px of card. Anything still holding a fixed
       column at this width is what pushes a mail into horizontal scroll. */
    @media only screen and (max-width:400px){
      .p-pad{padding:22px 16px!important}
      .p-headpad{padding:14px 16px!important}
      .p-inq-pad{padding-left:16px!important;padding-right:16px!important}
      .p-inq-copy{padding:0 16px 20px!important}
      .p-h1{font-size:21px!important}
      /* "Label : value" rows go over two lines — a 120px label column cannot
         share 280px with a wrapped address or a pasted paragraph beside it.
         The glyph stays inline with the label; the colon has nothing left to
         separate, so it goes. */
      .p-row-icon{display:inline-block!important;width:26px!important;
                  padding:0 0 3px!important;vertical-align:middle!important}
      .p-row-label{display:inline-block!important;width:auto!important;
                   padding:0 0 3px!important;vertical-align:middle!important}
      .p-row-sep{display:none!important}
      .p-row-value{display:block!important;width:auto!important;padding:0 0 14px!important}
      /* ~53px of card per tracker column. The tile and the label survive that;
         the caption under it does not — "Out for Delivery" over "Arriving soon"
         at this width is four wrapped lines under a 34px square. The label is
         the one that names the step, so the caption is what goes. */
      .p-step-label{font-size:10px!important}
      .p-step-note{display:none!important}
      .p-step-tile{width:34px!important;height:34px!important}
      .p-step-num{font-size:13px!important}
      .p-step-glyph{width:18px!important;height:18px!important}
      .p-step,.p-stepdot{padding-left:1px!important;padding-right:1px!important}
      /* Rules either side of a centred heading, shortened rather than dropped:
         at 60px apiece they are what tips the row over the screen width. */
      .p-hrule{width:16px!important}
      .p-trust{padding:0 2px 14px!important}
      /* A card nested inside the body cell pays the outer inset twice. At this
         width its own 24px is the difference between a value that wraps once
         and one that wraps three times. */
      .p-cardpad{padding:18px 14px!important}
    }
  </style>`;

/**
 * Two-tone wordmark: the first word in white, whatever follows in the brand
 * blue — the storefront header's own split, applied to a name the admin owns.
 * A single-word name simply stays white rather than being cut mid-syllable.
 */
const wordmark = (siteName) => {
  const [first, ...rest] = String(siteName).trim().split(/\s+/);
  return rest.length
    ? `${escapeHtml(first)}<span style="color:${C.brand600}">&nbsp;${escapeHtml(rest.join(' '))}</span>`
    : escapeHtml(first || '');
};

/**
 * The masthead mark: the company logo the admin uploaded under Organization →
 * Branding, so every header carries the business's own identity rather than a
 * stock glyph. Height is pinned and the width left to the image, since an
 * uploaded logo can be square or a wide lockup and either must sit on one line;
 * `max-width` is what stops a very wide file from crowding out the wordmark.
 * Falls back to `fallback` artwork only while no logo has been uploaded yet.
 */
const logoMark = (brand, fallback, size = 34) =>
  brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" height="${size}" alt="${escapeHtml(brand.siteName)}"
            style="height:${size}px;width:auto;max-width:150px;border:0;outline:none;display:block">`
    : image(fallback, { width: size, height: size, alt: '' });

/**
 * Dark bar: the company logo + wordmark on the left, the trust line on the
 * right. `tag` names the context instead ("Order Update") for a mail that has
 * one; only the default trust line carries the shield-check beside it, since a
 * status label is not a security claim.
 */
const header = (brand, tag) => `
  <tr>
    <td class="p-headpad" style="background:${C.ink900};padding:18px 32px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="p-brand" align="left" style="vertical-align:middle">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-size:0;line-height:0;vertical-align:middle">
                  ${logoMark(brand, 'brand-shield-lock.png')}
                </td>
                <td style="padding-left:10px;font:800 19px/34px ${FONT};color:#fff;
                           white-space:nowrap;letter-spacing:-.3px">
                  ${wordmark(brand.siteName)}
                </td>
              </tr>
            </table>
          </td>
          <td class="p-brandmeta" align="right" style="vertical-align:middle">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right">
              <tr>
                ${
                  tag
                    ? ''
                    : `<td width="22" style="width:22px;padding-right:8px;font-size:0;line-height:0;
                           vertical-align:middle">
                         ${image('shield-check-light.png', { width: 22, height: 22, alt: '' })}
                       </td>`
                }
                <td align="right" style="font:600 13px/34px ${FONT};color:#ffffff;
                    ${tag ? '' : 'white-space:nowrap'}">
                  ${tag ? escapeHtml(tag) : 'Secure &amp; Trusted'}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;

/**
 * How to reach us, where else to find us, where we are, and the copyright — the
 * storefront footer, compressed, in that order. Support leads because it is the
 * only line anyone acts on; the address and the copyright close as the fine
 * print they are.
 *
 * `hideSupport` drops the contact line for a message that already carries its
 * own "have questions?" card, so the same address is not offered twice.
 */
const footer = (brand, hideSupport = false) => {
  const year = new Date().getFullYear();
  const address = brand.address
    ? `<p style="margin:0 0 8px;font:400 13px/1.6 ${FONT};color:${C.ink500}">
         ${escapeHtml(brand.address)}
       </p>`
    : '';
  const support = hideSupport
    ? ''
    : brand.supportEmail
    ? `<p style="margin:0 0 16px;font:400 13px/1.6 ${FONT};color:${C.ink500}">
         Need help? Contact our support team at
         <a href="mailto:${escapeHtml(brand.supportEmail)}"
            style="color:${C.brand600};text-decoration:none;font-weight:600">${escapeHtml(brand.supportEmail)}</a>
       </p>`
    : `<p style="margin:0 0 16px;font:400 13px/1.6 ${FONT};color:${C.ink500}">
         This is an automated message — please do not reply.
       </p>`;

  const socials = brand.socials.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 18px">
         <tr>
           ${brand.socials
             .map(
               // Each chip is the network's own colour — the `social-color-*` cut,
               // which draws its disc as part of the artwork. The link keeps a
               // brand-blue background underneath so a blocked image leaves a row
               // of solid discs rather than five empty gaps.
               (s) => `<td style="padding:0 4px">
                 <a href="${escapeHtml(s.href)}" title="${escapeHtml(s.label)}"
                    style="display:block;width:32px;height:32px;border-radius:16px;
                    background:${C.brand600};color:#ffffff;text-decoration:none;font-size:0"
                    >${image(s.file.replace('social-', 'social-color-'), {
                      width: 32,
                      height: 32,
                      alt: s.label,
                    })}</a></td>`
             )
             .join('')}
         </tr>
       </table>`
    : '';

  return `
  <tr>
    <td class="p-pad" style="background:${C.ink50};border-top:1px solid ${C.ink200};padding:26px 32px;text-align:center">
      ${support}
      ${socials}
      ${address}
      <p style="margin:0;font:400 12px/1.7 ${FONT};color:${C.ink400}">
        &copy; ${year} ${escapeHtml(brand.siteName)}. All rights reserved.
      </p>
    </td>
  </tr>`;
};

/**
 * @param {object} opts
 * @param {string} opts.title  Page heading (already escaped by the caller).
 * @param {string} opts.body   Inner HTML.
 * @param {string} [opts.hero] Optional decorative cell floated beside the copy.
 * @param {boolean} [opts.hideHeading] Drop the <h1>; for bodies (order emails)
 *        that carry their own heading inside a hero panel. `title` still drives
 *        the document title and the hidden preheader line.
 * @param {string} [opts.tag]  Context label in the header bar.
 * @param {string} [opts.banner] Edge-to-edge `<tr>` directly under the masthead,
 *        outside the body cell's padding — for a mail that opens on a tinted
 *        panel carrying its own artwork and heading rather than on plain copy.
 *        Pair it with `hideHeading`, or the title is printed twice.
 * @param {string} [opts.wide] Full-width HTML appended below the two-column
 *        intro — tracker, summary and trust blocks that must span the copy.
 * @param {string} [opts.band] Edge-to-edge `<tr>` between the body and the
 *        footer, outside the card's padding — for a closing note that should
 *        read as its own tinted strip rather than another block of copy.
 * @param {boolean} [opts.hideSupport] Drop the footer's contact line; for
 *        bodies that already carry their own support card.
 */
const layout = (
  brand,
  {
    title,
    body,
    hero = '',
    hideHeading = false,
    tag = '',
    banner = '',
    wide = '',
    band = '',
    hideSupport = false,
  }
) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>${head}</head>
<body style="margin:0;padding:0;background:${C.ink100}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${title}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="p-shell"
         style="background:${C.ink100};padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="p-card"
             style="width:600px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden;
                    border:1px solid ${C.ink200}">
        ${header(brand, tag)}
        ${banner}
        <tr>
          <td class="p-pad" style="padding:34px 32px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:top">
                  ${
                    hideHeading
                      ? ''
                      : `<h1 class="p-h1" style="margin:0 0 18px;font:800 27px/1.25 ${FONT};color:${C.ink900};
                             letter-spacing:-.5px">${title}</h1>`
                  }
                  ${body}
                </td>
                ${hero}
              </tr>
            </table>
            ${wide}
          </td>
        </tr>
        ${band}
        ${footer(brand, hideSupport)}
      </table>
    </td></tr>
  </table>
</body></html>`;

const paragraph = (html) =>
  `<p style="margin:0 0 12px;font:400 15px/1.7 ${FONT};color:${C.ink600}">${html}</p>`;

/**
 * `align` is only emitted for centring. `align="left"` floats the table, and
 * whatever follows the button then wraps into the gap beside it instead of
 * starting on its own line — which is how the reset email's "if the button
 * doesn't work" line ended up squeezed into a column next to the button. Left
 * alignment is the default for a block-level table anyway.
 *
 * `icon` sets a glyph before the label — an inline-block <img> rather than a
 * cell of its own, because a table nested inside the <a> is not reliably part of
 * the click target in Outlook, and half a button that does nothing is worse than
 * no glyph at all. The 20px line-height is what sits the label level with it.
 */
const button = (href, label, { align = 'left', icon = '' } = {}) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="p-btn"
         ${align === 'center' ? 'align="center"' : ''}
         style="margin:22px ${align === 'center' ? 'auto' : '0'}">
    <tr><td style="background:${C.brand600};border-radius:8px">
      <a href="${href}" style="display:inline-block;padding:14px 30px;color:#ffffff;text-decoration:none;
         font:600 15px/20px ${FONT};border-radius:8px">${
           icon
             ? image(icon, {
                 width: 20,
                 height: 20,
                 alt: '',
                 style: 'display:inline-block;vertical-align:middle;margin-right:10px',
               })
             : ''
         }<span style="vertical-align:middle">${label}</span></a>
    </td></tr>
  </table>`;

/**
 * Tinted card that closes the reset copy: a shield-with-a-tick beside a titled
 * note. It sits inside the body column rather than spanning the card, because
 * the reassurance answers the paragraph above it — the reader is meant to finish
 * the copy on it, not meet it as a separate section.
 */
const noteCard = (title, text) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:26px 0 0;background:${C.brand50};border-radius:10px">
    <tr>
      <td width="60" style="width:60px;padding:18px 0 18px 18px;vertical-align:top;
          font-size:0;line-height:0">
        ${image('shield-check-brand.png', { width: 30, height: 30, alt: '' })}
      </td>
      <td style="padding:18px 20px 18px 0;vertical-align:top">
        <p style="margin:0 0 4px;font:700 14px/1.5 ${FONT};color:${C.ink900}">${title}</p>
        <p style="margin:0;font:400 13px/1.7 ${FONT};color:${C.ink600}">${text}</p>
      </td>
    </tr>
  </table>`;

/**
 * The fallback URL, boxed: a chain-link disc, then the link itself. A raw line
 * of underlined text is what a phishing mail looks like, so the address the
 * reader is asked to paste is given a frame of its own — and `word-break` is
 * what keeps a token-length URL inside that frame rather than widening the card.
 */
const linkBox = (url) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:6px 0 0;background:${C.brand50};border-radius:10px">
    <tr>
      <td width="62" style="width:62px;padding:14px 0 14px 16px;vertical-align:middle">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"
               style="background:${C.brand100};border-radius:18px">
          <tr><td width="36" height="36" align="center"
                  style="width:36px;height:36px;font-size:0;line-height:0">
            ${image('link-brand.png', { width: 18, height: 18, alt: '', style: 'margin:0 auto' })}
          </td></tr>
        </table>
      </td>
      <td style="padding:14px 18px 14px 12px;vertical-align:middle;word-break:break-all">
        <a href="${url}" style="font:600 13px/1.7 ${FONT};color:${C.brand600};
           text-decoration:none">${escapeHtml(url)}</a>
      </td>
    </tr>
  </table>`;

/**
 * The panel the reset mail opens on: a padlocked note lifting out of an open
 * envelope, the heading, and the one line naming the account — centred on the
 * brand tint, edge to edge under the masthead. The artwork carries the subject
 * of the message, so it leads rather than sitting in a column beside the copy;
 * everything below it is instruction.
 *
 * The illustration is a real PNG from /assets/email rather than markup — inline
 * SVG is stripped by most webmail, and a shape assembled from divs cannot carry
 * this much detail. It is supplied artwork rather than one of the marks
 * scripts/email-art.js draws (see the folder's README), square at 420 and shown
 * at half that; the width/height pair is what actually draws the image in
 * Outlook, so an off-ratio pair would simply squash the envelope. Its alt text is
 * deliberately empty — the heading directly beneath already says everything, so
 * a recipient who blocks images sees the tinted panel, not a stray caption.
 *
 * Goes in `layout`'s `banner` slot with `hideHeading`, since the <h1> lives here.
 */
const resetBanner = (siteName) => `
  <tr>
    <td class="p-pad" style="background:${C.brand50};padding:34px 40px 32px;text-align:center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" style="padding-bottom:14px;font-size:0;line-height:0">
          ${image('secure-mail.png', { width: 210, height: 210, alt: '', style: 'margin:0 auto', cls: 'p-art' })}
        </td></tr>
        <tr><td align="center">
          <h1 class="p-h1" style="margin:0 0 10px;font:800 30px/1.25 ${FONT};color:${C.ink900};
                     letter-spacing:-.6px">Reset Your Password</h1>
          <p style="margin:0;font:400 15px/1.7 ${FONT};color:${C.ink600}">
            We received a request to reset your password for your
            <b style="color:${C.brand600}">${escapeHtml(siteName)}</b> account.
          </p>
        </td></tr>
      </table>
    </td>
  </tr>`;

/**
 * The panel the verification mail opens on. Same artwork and same shape as the
 * reset banner above — both messages are "prove this inbox is yours", and a
 * reader who has seen one should recognise the other on sight rather than wonder
 * which of the two they are looking at.
 *
 * Goes in `layout`'s `banner` slot with `hideHeading`, since the <h1> lives here.
 */
const verifyBanner = (siteName) => `
  <tr>
    <td class="p-pad" style="background:${C.brand50};padding:34px 40px 32px;text-align:center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" style="padding-bottom:14px;font-size:0;line-height:0">
          ${image('secure-mail.png', { width: 210, height: 210, alt: '', style: 'margin:0 auto', cls: 'p-art' })}
        </td></tr>
        <tr><td align="center">
          <h1 class="p-h1" style="margin:0 0 10px;font:800 30px/1.25 ${FONT};color:${C.ink900};
                     letter-spacing:-.6px">Verify Your Email</h1>
          <p style="margin:0;font:400 15px/1.7 ${FONT};color:${C.ink600}">
            One last step before your
            <b style="color:${C.brand600}">${escapeHtml(siteName)}</b> account is ready.
          </p>
        </td></tr>
      </table>
    </td></tr>`;

/**
 * The panel the lock-out mail opens on. Third of the set, and built to the same
 * measurements as the two above it: a reader who has met the reset mail should
 * recognise this one as the same kind of message before they have read a word of
 * it — the account mails are the only ones that ever arrive unasked-for, and
 * looking alike is most of how they prove they are ours.
 *
 * The artwork is a padlock with a clock rather than the shared envelope, because
 * this is the one of the three that is not about an inbox: the reader is being
 * told about a wait, and the wait is what the mark has to carry.
 *
 * Goes in `layout`'s `banner` slot with `hideHeading`, since the <h1> lives here.
 */
const lockedBanner = (siteName) => `
  <tr>
    <td class="p-pad" style="background:${C.brand50};padding:34px 40px 32px;text-align:center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" style="padding-bottom:14px;font-size:0;line-height:0">
          ${image('account-locked.png', { width: 210, height: 210, alt: '', style: 'margin:0 auto', cls: 'p-art' })}
        </td></tr>
        <tr><td align="center">
          <h1 class="p-h1" style="margin:0 0 10px;font:800 30px/1.25 ${FONT};color:${C.ink900};
                     letter-spacing:-.6px">Sign-in Paused</h1>
          <p style="margin:0;font:400 15px/1.7 ${FONT};color:${C.ink600}">
            We&rsquo;ve temporarily paused sign-in on your
            <b style="color:${C.brand600}">${escapeHtml(siteName)}</b> account.
          </p>
        </td></tr>
      </table>
    </td>
  </tr>`;

/**
 * How long the wait is, given the same treatment the verification code gets:
 * the one fact the reader opened this mail for, on its own line and at a size
 * they can read from the notification shade. Everything else in the message is
 * either reassurance or the way out.
 *
 * The number and its unit are two elements rather than one string so the unit
 * can sit at reading size beneath a figure set large — and `mso-line-height-rule`
 * keeps Outlook from collapsing the tall line box that figure needs, exactly as
 * it does in `codeBox`.
 */
const waitBox = (minutes) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:24px 0 6px;background:${C.brand50};border:1px solid ${C.brand100};
                border-radius:12px;border-collapse:separate">
    <tr>
      <td align="center" style="padding:22px 16px">
        <p style="margin:0 0 8px;font:600 12px/1.4 ${FONT};color:${C.ink500};
                  letter-spacing:1.4px;text-transform:uppercase">You can try again in</p>
        <p style="margin:0;mso-line-height-rule:exactly;font:800 38px/1.2 ${FONT};
                  color:${C.brand700};letter-spacing:-1px">${minutes}
          <span style="font:700 17px/1.2 ${FONT};color:${C.ink600}">${
            minutes === 1 ? 'minute' : 'minutes'
          }</span>
        </p>
      </td>
    </tr>
  </table>`;

/**
 * The code itself, given the whole width and nothing to compete with.
 *
 * The digits are spaced by `letter-spacing` on a monospace stack rather than split
 * into cells, so selecting the code copies six digits and not six table cells with
 * whitespace between them — the copy-and-paste is the whole point of the block.
 * `mso-line-height-rule` is what stops Outlook from collapsing the tall line box
 * this needs; without it the digits sit hard against the border above them.
 */
const codeBox = (code) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:24px 0 6px;background:${C.brand50};border:1px solid ${C.brand100};
                border-radius:12px;border-collapse:separate">
    <tr>
      <td align="center" style="padding:22px 16px">
        <p style="margin:0 0 10px;font:600 12px/1.4 ${FONT};color:${C.ink500};
                  letter-spacing:1.4px;text-transform:uppercase">Your verification code</p>
        <p style="margin:0;mso-line-height-rule:exactly;
                  font:800 34px/1.2 'SFMono-Regular',Menlo,Consolas,'Courier New',monospace;
                  color:${C.brand700};letter-spacing:10px;text-indent:10px">${escapeHtml(code)}</p>
      </td>
    </tr>
  </table>`;

/** Composes the branded shell around a message and hands it to the transport. */
async function send({
  to,
  subject,
  text,
  title,
  body,
  hero,
  hideHeading,
  tag,
  banner,
  wide,
  band,
  hideSupport,
}) {
  const brand = await getBranding();
  return sendMail({
    to,
    subject,
    text,
    html: layout(brand, { title, body, hero, hideHeading, tag, banner, wide, band, hideSupport }),
  });
}

/* ------------------------------------------------------------------ *
 * Order email blocks
 *
 * Shared by the confirmation and the status-update mails so an order
 * looks the same whichever event produced the message — the mail
 * equivalent of the account order page.
 * ------------------------------------------------------------------ */

const orderUrl = (order) => `${env.clientUrl}/account/orders/${order._id}`;

/** Rank inside the model's own status list — no second source of truth here. */
const statusRank = (status) => ORDER_STATUSES.indexOf(status);

/**
 * When the order *first* entered a status — the admin's own audit trail. A
 * status can be recorded twice (an admin correcting a mis-click, say), and the
 * tracker is drawing when the step was reached, not when it was last touched.
 */
const statusReachedAt = (order, status) =>
  (order.statusHistory || []).find((row) => row.status === status)?.changedAt;

/**
 * Step glyphs, pre-rendered in the 24×24 stroked style Icon.jsx uses —
 * `package`, `truck` and `location` are its paths verbatim; `clipboard` and
 * `home` are drawn to match, since the storefront has no icon for them yet.
 *
 * This is the *filled-disc* cut, used where a glyph sits on a solid accent: the
 * current-status card below the tracker. `-white` is the only tint such a disc
 * can carry; the tracker's own tiles are tinted rather than filled and take
 * `tileIcon` instead.
 */
const stepIcon = (name, state) =>
  `step-${name}${state === 'todo' ? '-muted' : state === 'done' ? '' : '-white'}.png`;

/**
 * The tracker's cut: a glyph in its step's own accent, for a tile tinted with
 * the same hue. Brand blue is the folder's default cut, so it takes no suffix;
 * `-red` is cut by scripts/email-art.js for the terminal step of a cancelled or
 * returned order, the one accent the default set had no version of. A step
 * still ahead of the order is grey whatever colour it would eventually wear.
 */
const TILE_TINT = { brand: '', red: '-red' };
const tileIcon = ({ icon, state, tint }) =>
  `step-${icon}${state === 'todo' ? '-muted' : TILE_TINT[tint]}.png`;

/** The red the terminal step and its status card are painted in — tailwind `danger`. */
const RED = { base: '#dc2626', tint: '#fef2f2', line: '#fecaca' };

/**
 * The panel each tracker glyph sits on — the lightest step of its own ramp.
 * Declared below `RED` rather than beside `tileIcon`, since it reads it.
 */
const TILE_BG = { brand: C.brand50, red: RED.tint };

const isClosed = (order) => order.orderStatus === 'cancelled' || order.orderStatus === 'returned';

/**
 * The five milestones the tracker draws — Order.STATUS_FLOW's fulfilment path,
 * one column per status. `out_for_delivery` used to be folded into the shipped
 * column to keep the row to four; it has its own now, because the tile-over-
 * label layout carries a fifth column at every width the mail supports and a
 * shopper watching for a parcel wants to see the van step named on the track,
 * not only in the status card underneath it.
 *
 * Labels match ORDER_STATUS_STEPS in client/src/utils/constants.js so the email
 * and the order page never name the same step differently. `note` is the line
 * under the label: what the step means, in the reader's own words rather than
 * the fulfilment system's. "pending" is absent — no status mail is sent for it,
 * and by the time one goes out the order has already left it.
 */
const TRACK_STEPS = [
  { key: 'confirmed', label: 'Confirmed', icon: 'clipboard', note: 'Order accepted' },
  { key: 'packed', label: 'Packed', icon: 'package', note: 'Ready to ship' },
  { key: 'shipped', label: 'Shipped', icon: 'truck', note: 'On its way' },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: 'location', note: 'Arriving soon' },
  { key: 'delivered', label: 'Delivered', icon: 'home', note: 'Handed over' },
];

/** The step that replaces the flow's tail once an order can no longer move. */
const CLOSING_STEP = {
  cancelled: { label: 'Cancelled', icon: 'cancel', note: 'Order closed' },
  returned: { label: 'Returned', icon: 'return', note: 'Sent back' },
};

/**
 * How a status is named to the reader. `titleCase` alone capitalises every word
 * and turns `out_for_delivery` into "Out For Delivery", which is not what the
 * order page calls it — the tracker's own labels are the single source, so the
 * subject line, the status card and the column all say the same three words.
 */
const statusLabel = (status) =>
  TRACK_STEPS.find((step) => step.key === status)?.label ||
  CLOSING_STEP[status]?.label ||
  titleCase(status);

/**
 * The glyph a status wears, looked up from the status itself.
 *
 * The status card used to find its mark by scanning the tracker for the column
 * that was neither done nor still ahead. That only held while every status the
 * card can describe left an unfinished column behind it — no longer true now
 * that a delivered order fills its last bead in, which would have dropped the
 * card back to its carton fallback. The status already knows its own glyph;
 * asking the tracker for it was the indirection.
 */
const statusIcon = (status) =>
  TRACK_STEPS.find((step) => step.key === status)?.icon || CLOSING_STEP[status]?.icon || 'package';

/**
 * The tracker's columns for one order: label, caption, glyph, accent and state.
 *
 * A closed order is read from `statusHistory` rather than from the rank ladder —
 * it stopped somewhere along the path, so "is this step behind us" is a question
 * about what actually happened, not about where `cancelled` sorts. Its tail is
 * replaced by the red terminal column: a cancelled order loses `delivered`
 * outright (it never got there and a grey tile beside the red one only invites
 * the question), while a returned one keeps it, since a return is only possible
 * after a delivery.
 */
const trackerColumns = (order) => {
  const closed = isClosed(order);
  const rank = statusRank(order.orderStatus);

  const columns = TRACK_STEPS.filter(
    (step) => !(order.orderStatus === 'cancelled' && step.key === 'delivered')
  ).map((step) => {
    const reachedAt = statusReachedAt(order, step.key);
    const delivery = step.key === 'delivered';

    return {
      label: step.label,
      note: step.note,
      icon: step.icon,
      // Every fulfilment step is brand blue, delivery included. The rail draws
      // one journey and colours it once; the success green belongs to the
      // status card underneath, which is what actually announces the arrival.
      // A green tail on the rail said the same thing a second time, in a hue
      // nothing else on the track wore.
      tint: 'brand',
      accent: C.brand600,
      state: closed
        ? reachedAt
          ? 'done'
          : 'todo'
        : rank > statusRank(step.key)
        ? 'done'
        : step.key === order.orderStatus
        ? // Delivery is where the journey ends rather than somewhere the order
          // is passing through, so it is recorded as done. `current` is only
          // "reached, and there is still road ahead" — which is what the
          // connector leaving the bead reads from.
          delivery
          ? 'done'
          : 'current'
        : 'todo',
    };
  });

  if (!closed) return columns;

  const closing = CLOSING_STEP[order.orderStatus];
  return [
    ...columns,
    {
      label: closing.label,
      note: closing.note,
      icon: closing.icon,
      tint: 'red',
      accent: RED.base,
      state: 'closed',
    },
  ];
};

/**
 * Rounded tile, step name, one-line caption, and a rail of dots joined by a
 * progress line underneath. Built from nested tables because Outlook has no
 * flexbox and a blocked sprite would erase the whole thing — the tracker has to
 * survive as plain HTML.
 *
 * The tile carries the state and the dot rail carries the progress, which is
 * why the dots sit *below* the labels rather than above them: read top down,
 * the row says what each step is before it says how far along the order is, and
 * the rail then draws that single answer across the whole width in one line.
 *
 * The connectors are 2px <div>s, not cell backgrounds: a background on the <td>
 * paints the full row height, which is a band of solid colour beside every dot
 * rather than a line between them.
 */
const orderTracker = (order) => {
  const steps = trackerColumns(order);
  const width = `${(100 / steps.length).toFixed(2)}%`;

  /** Solid accent line behind completed work, flat grey ahead of it. */
  const connector = (index) => {
    if (index < 0 || index >= steps.length - 1) {
      return '<div style="height:2px;font-size:0;line-height:0">&nbsp;</div>';
    }
    // The segment takes the colour of the step it runs *into*, so the line
    // arriving at delivery is green and the one arriving at a cancellation is
    // red. Ahead of the order it is flat grey, whatever comes next.
    const color =
      steps[index].state !== 'done'
        ? C.ink200
        : steps[index + 1].state === 'todo'
        ? steps[index].accent
        : steps[index + 1].accent;
    return `<div style="height:2px;font-size:0;line-height:0;background:${color}">&nbsp;</div>`;
  };

  /**
   * The tinted square the glyph sits in. A table rather than a styled <div>:
   * the glyph is an <img>, and only a cell can centre one both ways in Outlook.
   *
   * The corner radius is painted on the *cell*, and the table opts back out of
   * the `border-collapse:collapse` the head style sets on every table in the
   * document. A collapsed table's `border-radius` is ignored outright — the
   * spec hands its borders to the cells — so the tile would render as a hard
   * square wherever that rule reached it.
   *
   * Two looks only, which is the point of a tile: the step's own accent on a
   * tint of the same hue once the order has reached it, flat grey before that.
   */
  const tile = (step) => `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"
             style="margin:0 auto;border-collapse:separate;border-spacing:0">
        <tr><td class="p-step-tile" width="46" height="46" align="center" valign="middle"
                style="width:46px;height:46px;font-size:0;line-height:0;border-radius:14px;
                       background:${step.state === 'todo' ? C.ink100 : TILE_BG[step.tint]}">
          ${image(tileIcon(step), {
            width: 22,
            height: 22,
            alt: '',
            style: 'margin:0 auto',
            cls: 'p-step-glyph',
          })}
        </td></tr>
      </table>`;

  /**
   * One bead of the rail, in one of two looks: solid in the step's own accent
   * once the order has reached it, flat grey outline while it has not.
   *
   * There is deliberately no third look for the step the order is standing on.
   * A hollow "you are here" ring made the current step the one bead on the rail
   * that read as unfinished — the eye stopped on a gap exactly where the order
   * had got to. Reached is reached; how far along it is, is what the connector
   * behind it says, and which step it is, is what the status card says.
   */
  const dot = (step) => {
    const ring =
      step.state === 'todo'
        ? `background:#ffffff;border:2px solid ${C.ink200}`
        : `background:${step.accent};border:2px solid ${step.accent}`;

    return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"
             style="margin:0 auto;border-collapse:separate;border-spacing:0">
        <tr><td width="20" height="20"
                style="width:20px;height:20px;font-size:0;line-height:0;
                       ${ring};border-radius:12px">&nbsp;</td></tr>
      </table>`;
  };

  const heads = steps
    .map(
      (step) => `
      <td class="p-step" width="${width}" align="center"
          style="width:${width};padding:0 3px;vertical-align:top">
        ${tile(step)}
        <p class="p-step-label" style="margin:12px 0 0;font:700 12px/1.4 ${FONT};
           color:${step.state === 'todo' ? C.ink400 : C.ink900}">${step.label}</p>
        <p class="p-step-note" style="margin:4px 0 0;font:400 11px/1.4 ${FONT};
           color:${step.state === 'todo' ? C.ink400 : C.ink500}">${step.note}</p>
      </td>`
    )
    .join('');

  const rail = steps
    .map(
      (step, index) => `
      <td class="p-stepdot" width="${width}" style="width:${width};padding:14px 0 0;
          vertical-align:middle">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="vertical-align:middle">${connector(index - 1)}</td>
            <td width="24" style="width:24px;font-size:0;line-height:0">${dot(step)}</td>
            <td style="vertical-align:middle">${connector(index)}</td>
          </tr>
        </table>
      </td>`
    )
    .join('');

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:26px 0 0">
    <tr>
      <td style="padding:0 4px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>${heads}</tr>
          <tr>${rail}</tr>
        </table>
      </td>
    </tr>
  </table>`;
};

/**
 * Two-line headline over the greeting — left aligned so it sits beside the
 * parcel panel, the way the storefront pairs copy with art. The lead is the
 * quiet line and the second is the news, which is why only the second grows.
 *
 * No button here: the call to action closes the summary at the foot of the
 * mail, where the reader has the whole picture. One tracking link, not two.
 */
const orderIntro = ({ name, lead, highlight, message, follow }) => `
  <h1 class="p-h1" style="margin:0 0 2px;font:800 22px/1.3 ${FONT};color:${C.brand900};
             letter-spacing:-.4px">${lead}</h1>
  <h1 class="p-h1" style="margin:0 0 16px;font:800 25px/1.3 ${FONT};color:${C.brand900};
             letter-spacing:-.5px">${highlight}</h1>
  ${paragraph(
    `<span style="font-size:14px">Hi <b style="color:${C.ink900}">${escapeHtml(name)}</b>,
     ${message}</span>`
  )}
  ${paragraph(`<span style="font-size:14px">${follow}</span>`)}`;

/**
 * The one line that says where the order is right now, boxed and tinted — the
 * tracker above it draws the whole journey, and this names the point on it.
 *
 * It takes its colour from the state rather than from the brand: delivered is
 * the storefront's success green, a cancelled or returned order is red, and
 * everything in between stays brand blue. The glyph is the current step's own,
 * so the card and the circle it refers to carry the same mark.
 */
const currentStatusCard = (order, message) => {
  const closed = isClosed(order);
  const done = order.orderStatus === 'delivered';

  const [tint, line, accent] = closed
    ? [RED.tint, RED.line, RED.base]
    : done
    ? [C.green50, C.green100, C.green700]
    : [C.brand50, C.brand100, C.brand600];

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:24px 0 0;background:${tint};border:1px solid ${line};border-radius:12px">
    <tr>
      <td style="padding:16px 18px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="46" style="width:46px;padding-right:14px;vertical-align:middle">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                     style="background:${accent};border-radius:10px">
                <tr><td width="38" height="38" align="center"
                        style="width:38px;height:38px;font-size:0;line-height:0">
                  ${image(stepIcon(statusIcon(order.orderStatus), 'current'), {
                    width: 19,
                    height: 19,
                    alt: '',
                    style: 'margin:0 auto',
                  })}
                </td></tr>
              </table>
            </td>
            <td style="vertical-align:middle">
              <p style="margin:0 0 3px;font:700 14px/1.4 ${FONT};color:${C.ink900}">
                Current Status:
                <span style="color:${accent}">${statusLabel(order.orderStatus)}</span>
              </p>
              <p style="margin:0;font:400 13px/1.6 ${FONT};color:${C.ink600}">${message}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
};

/**
 * Parcel-in-transit illustration beside the intro: a taped carton on a tinted
 * disc, speed lines behind it and a dropped pin on a dashed route.
 *
 * A hosted PNG from /assets/email, cut at 2x from the SVG kept beside it.
 * Inline vector was the nicer idea — no "display images" prompt to clear — but
 * Gmail and most webmail strip <svg> outright, so the artwork simply vanished.
 * The disc stays a table background rather than part of the drawing, so a
 * recipient who blocks images still sees a deliberate panel, not a gap.
 * Hidden below 520px, where the copy needs the full width.
 */
const parcelHero = () => `
  <td class="p-hero" width="176" style="width:176px;vertical-align:middle;padding-left:14px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${C.brand50};border-radius:88px">
      <tr><td align="center" style="padding:16px 6px;font-size:0;line-height:0">
        ${image('parcel.png', { width: 164, height: 132, alt: '', style: 'margin:0 auto', cls: 'p-art' })}
      </td></tr>
    </table>
  </td>`;

const shippingLines = (address) =>
  [
    `<b style="color:${C.ink900}">${escapeHtml(address.fullName)}</b>`,
    escapeHtml([address.addressLine1, address.addressLine2, address.landmark].filter(Boolean).join(', ')),
    escapeHtml(`${address.city}, ${address.state} — ${address.pincode}`),
    escapeHtml(address.country || 'India'),
    escapeHtml(address.phone),
  ]
    .filter(Boolean)
    .join('<br>');

/**
 * Same lines, order and wording as the Price Details card on the order page.
 *
 * `subtotal` is already net of the product discount — the discounted selling
 * price is what each line was billed at — so the coupon is the only deduction
 * here. The product discount is stated below the total as a saving instead;
 * as a row it would read as a second subtraction and the column would stop
 * adding up to `total`.
 */
const priceRows = (pricing) =>
  [
    ['Subtotal', money(pricing.subtotal)],
    pricing.couponDiscount > 0 && [
      `Coupon (${escapeHtml(pricing.couponCode || '')})`,
      `- ${money(pricing.couponDiscount)}`,
      true,
    ],
    ['Shipping', pricing.shipping ? money(pricing.shipping) : 'FREE', !pricing.shipping],
  ]
    .filter(Boolean)
    .map(
      ([label, value, positive]) => `
      <tr>
        <td style="padding:0 0 7px;font:400 13px/1.5 ${FONT};color:${C.ink500}">${label}</td>
        <td align="right" style="padding:0 0 7px;font:600 13px/1.5 ${FONT};
            color:${positive ? C.green700 : C.ink900}">${value}</td>
      </tr>`
    )
    .join('');

/**
 * The MRP and both discounts, stated once, below the sum they are not rows in —
 * the same green "you saved" line the storefront's Price Details card closes on.
 */
const savingsNote = (pricing) => {
  const savings = (pricing.discount || 0) + (pricing.couponDiscount || 0);
  if (savings <= 0) return '';

  const mrpTotal = pricing.mrpTotal || pricing.subtotal + (pricing.discount || 0);
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:9px 0 0">
    <tr><td style="padding:9px 12px;background:${C.green50};border-radius:7px;
        font:600 12px/1.5 ${FONT};color:${C.green700}">
      You saved ${money(savings)} on this order &middot; MRP ${money(mrpTotal)}
    </td></tr>
  </table>`;
};

/**
 * Tracking/delivery facts an admin filled in, shown only once they exist.
 *
 * A cancelled or returned order keeps both fields on the document — the courier
 * really did have the parcel — but nothing here is still true of it, and an
 * "expected delivery" line under a red "Order Cancelled" banner reads as a
 * contradiction. The whole block drops for those two states.
 */
const orderLogistics = (order) => {
  if (order.orderStatus === 'cancelled' || order.orderStatus === 'returned') return '';

  const inFlight = order.orderStatus !== 'delivered';
  const rows = [
    order.trackingNumber && [
      'Tracking',
      escapeHtml([order.trackingNumber, order.courierPartner].filter(Boolean).join(' · ')),
    ],
    order.expectedDeliveryDate &&
      inFlight && ['Expected delivery', dateTime(order.expectedDeliveryDate)],
    order.deliveredAt && ['Delivered on', dateTime(order.deliveredAt)],
  ].filter(Boolean);

  if (!rows.length) return '';

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:16px 0 0;background:${C.brand50};border-radius:12px">
    <tr>
      <td style="padding:16px 18px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${rows
            .map(
              ([label, value]) => `
            <tr>
              <td style="padding:2px 0;font:400 13px/1.6 ${FONT};color:${C.ink500}">${label}</td>
              <td align="right" style="padding:2px 0;font:700 13px/1.6 ${FONT};color:${C.ink900}">${value}</td>
            </tr>`
            )
            .join('')}
        </table>
      </td>
    </tr>
  </table>`;
};

/** Vertical air between two blocks that must not be separated by a rule. */
const spacer = (height) =>
  `<div style="height:${height}px;font-size:0;line-height:0">&nbsp;</div>`;

/**
 * The status mail, end to end: the headline beside the parcel panel, then the
 * full-width tracker → current status → logistics → details → summary → call to
 * action → trust stack. Returns the slots `layout` takes, so a caller only
 * supplies the copy.
 *
 * Everything from the details card down is the confirmation mail's own blocks —
 * `placedDetails`, `placedSummary`, `wideButton`, `benefitsPanel` — rather than
 * a second set drawn to match. A shopper who opens the confirmation and then a
 * status update should be reading one document twice, not two designs of it.
 *
 * A cancelled or returned order keeps the whole shape; what changes is the
 * tracker's tail and the colour of the status card, both handled where they are
 * drawn. The parcel is the one thing dropped — a winged carton beside "Your
 * order has been cancelled" is the wrong picture.
 */
const orderBody = ({ order, name, lead, highlight, message, status }) => {
  const closed = isClosed(order);

  return {
    hideHeading: true,
    hero: closed ? '' : parcelHero(),
    body: orderIntro({
      name,
      lead,
      highlight,
      message,
      // An order that has stopped has no progress left to follow, and inviting
      // the reader to track one is the sort of line that produces a support
      // ticket. It is sent to the record instead.
      follow: closed
        ? 'The full details of your order are below for your records.'
        : 'You can track your order progress below.',
    }),
    wide: `
      ${orderTracker(order)}
      ${currentStatusCard(order, status)}
      ${orderLogistics(order)}
      ${spacer(26)}
      ${placedDetails(order)}
      ${rule()}
      ${placedSummary(order)}
      ${wideButton(orderUrl(order), closed ? 'View Order' : 'Track Your Order')}
      ${benefitsPanel()}`,
  };
};

/* ------------------------------------------------------------------ *
 * Order placed
 *
 * The confirmation mail is the one order email a shopper always gets, and
 * it is read minutes after checkout — so it answers "did it work, what did
 * I buy, where is it going, what did it cost" and stops. No tracker: there
 * is nothing to track yet, and the status mails that follow carry one.
 *
 * It reuses the shared shell (dark masthead, footer with the coloured
 * social chips) and the shared price rows, so it reads as the same suite
 * as the status and reset mails despite its own body.
 * ------------------------------------------------------------------ */

/**
 * Hairline between the body's sections. A bordered cell rather than a filled
 * <div>: Outlook collapses an empty div, and a 1px background on a table cell
 * is the one rule that survives every client.
 */
const rule = (space = 22) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:${space}px 0">
    <tr><td style="border-top:1px solid ${C.ink200};font-size:0;line-height:0">&nbsp;</td></tr>
  </table>`;

/** Tinted rounded square + title — opens each section of the body. */
const sectionHead = (icon, title) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px">
    <tr>
      <td width="30" style="width:30px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"
               style="background:${C.brand50};border-radius:8px">
          <tr><td width="28" height="28" align="center"
                  style="width:28px;height:28px;font-size:0;line-height:0">
            ${image(icon, { width: 16, height: 16, alt: '', style: 'margin:0 auto' })}
          </td></tr>
        </table>
      </td>
      <td style="padding-left:10px;font:800 15px/28px ${FONT};color:${C.ink900}">${title}</td>
    </tr>
  </table>`;

/** Label left, value right — the shape of every row in the details column. */
const detailRow = (label, value) => `
  <tr>
    <td style="padding:0 0 11px;font:400 13px/1.5 ${FONT};color:${C.ink500};white-space:nowrap">${label}</td>
    <td align="right" style="padding:0 0 11px 12px;font:600 13px/1.5 ${FONT};color:${C.ink900}">${value}</td>
  </tr>`;

/**
 * Payment status as a pill. Paid is the storefront's success green; anything
 * else (pending on a COD order, failed, refunded) stays neutral rather than
 * borrowing a colour it has not earned.
 */
const paymentPill = (status) => {
  const paid = status === 'paid';
  return `<span style="display:inline-block;padding:3px 10px;border-radius:11px;
     background:${paid ? C.green100 : C.ink100};color:${paid ? C.green700 : C.ink600};
     font:700 11px/1.5 ${FONT}">${titleCase(status)}</span>`;
};

/**
 * Order facts on the left, where the parcel is going on the right — the two
 * questions a confirmation has to answer side by side. Stacks under 520px.
 */
const placedDetails = (order) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td class="p-col" width="58%" style="width:58%;vertical-align:top;padding-right:22px">
        ${sectionHead('step-clipboard.png', 'Order Details')}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${detailRow('Order ID', escapeHtml(order.orderNumber))}
          ${detailRow('Order Date', dateTime(order.createdAt))}
          ${detailRow('Payment Method', order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online (Razorpay)')}
          ${detailRow('Payment Status', paymentPill(order.paymentStatus))}
        </table>
      </td>
      <td class="p-col" width="42%" style="width:42%;vertical-align:top">
        ${sectionHead('step-location.png', 'Shipping Address')}
        <p style="margin:0;font:400 13px/1.75 ${FONT};color:${C.ink500}">
          ${shippingLines(order.shippingAddress)}
        </p>
      </td>
    </tr>
  </table>`;

/** One purchased line: thumbnail, name over quantity, line total on the right. */
const placedItemRow = (item) => `
  <tr>
    <td width="60" style="width:60px;padding:0 0 14px;vertical-align:middle">
      ${
        item.image
          ? `<img src="${escapeHtml(thumb(item.image))}" width="48" height="48" alt=""
                  style="width:48px;height:48px;border-radius:8px;border:1px solid ${C.ink200};
                         background:${C.ink100};display:block">`
          : `<div style="width:48px;height:48px;border-radius:8px;background:${C.ink100}"></div>`
      }
    </td>
    <td style="padding:0 10px 14px;vertical-align:middle">
      <p style="margin:0;font:600 13px/1.5 ${FONT};color:${C.ink900}">${escapeHtml(item.name)}</p>
      ${
        // The option that was bought, so the confirmation is checkable at a glance.
        item.variantLabel
          ? `<p style="margin:2px 0 0;font:500 12px/1.5 ${FONT};color:${C.ink600}">${escapeHtml(item.variantLabel)}</p>`
          : ''
      }
      <p style="margin:2px 0 0;font:400 12px/1.5 ${FONT};color:${C.ink500}">Qty: ${item.quantity}</p>
    </td>
    <td align="right" style="padding:0 0 14px;vertical-align:middle;white-space:nowrap;
        font:700 13px/1.5 ${FONT};color:${C.ink900}">${money(item.lineTotal)}</td>
  </tr>`;

/**
 * Items, then the same price lines the order page's Price Details card shows,
 * closed by the total between two rules — the one figure the reader is scanning
 * for, so it gets the navy and the extra weight.
 */
const placedSummary = (order) => `
  ${sectionHead('step-package.png', 'Order Summary')}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    ${order.items.map(placedItemRow).join('')}
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:6px 0 0;border-top:1px solid ${C.ink200}">
    <tr><td style="padding:14px 0 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${priceRows(order.pricing)}
      </table>
    </td></tr>
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:7px 0 0;border-top:1px solid ${C.ink200};border-bottom:1px solid ${C.ink200}">
    <tr>
      <td style="padding:13px 0;font:800 15px/1.4 ${FONT};color:${C.ink900}">Total</td>
      <td align="right" style="padding:13px 0;font:800 17px/1.4 ${FONT};color:${C.brand900}">
        ${money(order.pricing.total)}
      </td>
    </tr>
  </table>
  ${savingsNote(order.pricing)}`;

/**
 * Full-bleed navy call to action. The shared `button()` sizes itself to its
 * label; here the button closes the summary and spans it, so the eye lands on
 * it after the total rather than beside it.
 */
const wideButton = (href, label) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:22px 0 0">
    <tr><td align="center" style="background:${C.brand900};border-radius:8px">
      <a href="${href}" style="display:block;padding:15px 20px;color:#ffffff;text-decoration:none;
         font:700 15px/1 ${FONT};border-radius:8px">${label}</a>
    </td></tr>
  </table>`;

/**
 * The promises the storefront footer makes (TRUST_POINTS in Footer.jsx),
 * shortened to a caption apiece — an order mail is read far from the site, and
 * this is the moment a shopper wonders what happens if something is wrong.
 * Glyphs are the storefront's own marks; `order-return` and `shield-check-brand`
 * are cut by scripts/email-art.js because the folder had no blue version of
 * either — the shield is shared with the reset mail's security note.
 *
 * Closes every order mail, the confirmation and the status updates alike. There
 * used to be a second copy of this row that drew its four marks as emoji
 * codepoints; Outlook's desktop engine has no colour font, so it rendered them
 * as monochrome outlines beside these — same four promises, two visual
 * languages, in one suite of mail. The emoji version is gone.
 */
const PLACED_BENEFITS = [
  { icon: 'step-truck.png', title: 'Fast Delivery', text: 'On time, every time' },
  { icon: 'shield-check-brand.png', title: 'Secure Payment', text: '100% secure' },
  { icon: 'order-return.png', title: 'Easy Returns', text: 'Hassle free' },
  { icon: 'job-headset.png', title: 'Help &amp; Support', text: "We're here to help" },
];

const benefitsPanel = () => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:24px 0 0;background:${C.iris50};border:1px solid ${C.iris100};border-radius:12px">
    <tr>
      <td style="padding:20px 14px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            ${PLACED_BENEFITS.map(
              (point) => `
              <td class="p-trust" width="25%" align="center" style="width:25%;padding:0 6px;vertical-align:top">
                <div style="font-size:0;line-height:0;margin:0 0 8px">
                  ${image(point.icon, { width: 24, height: 24, alt: '', style: 'margin:0 auto' })}
                </div>
                <p style="margin:0 0 3px;font:700 12px/1.4 ${FONT};color:${C.ink900}">${point.title}</p>
                <p style="margin:0;font:400 11px/1.5 ${FONT};color:${C.ink500}">${point.text}</p>
              </td>`
            ).join('')}
          </tr>
        </table>
      </td>
    </tr>
  </table>`;

/**
 * Two bags on a periwinkle disc with the success badge tucked into them —
 * drawn as one PNG in scripts/email-art.js, badge included, because email has
 * no dependable way to overlap two images. Decorative, so `alt` is empty and
 * the copy beside it carries the message on its own; hidden below 520px.
 */
const placedHero = () => `
  <td class="p-hero" width="212" style="width:212px;vertical-align:top;padding-left:12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center" style="font-size:0;line-height:0">
        ${image('order-hero.png', { width: 200, height: 155, alt: '', style: 'margin:0 auto', cls: 'p-art' })}
      </td></tr>
    </table>
  </td>`;

const orderTextSummary = (order, lead) =>
  [
    lead,
    '',
    `Order: ${order.orderNumber}`,
    `Placed: ${dateTime(order.createdAt)}`,
    `Status: ${titleCase(order.orderStatus)}`,
    // The plain-text part is what a screen reader and a stripped-down client get,
    // so the one fact that explains a closed order travels with it.
    order.cancellationReason
      ? `Reason: ${CANCELLED_BY_LEAD[order.cancelledBy] || 'Cancelled'} — ${order.cancellationReason}`
      : null,
    `Payment: ${order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online (Razorpay)'} (${order.paymentStatus})`,
    '',
    ...order.items.map(
      (item) =>
        `${item.name}${item.variantLabel ? ` (${item.variantLabel})` : ''} x${item.quantity} — ${moneyText(item.lineTotal)}`
    ),
    '',
    `Total: ${moneyText(order.pricing.total)}`,
    '',
    `Track your order: ${orderUrl(order)}`,
    // Blank strings are deliberate spacing; only the rows that did not apply drop.
  ]
    .filter((line) => line !== null)
    .join('\n');

/* ------------------------------------------------------------------ *
 * Templates
 * ------------------------------------------------------------------ */

/** Token lifetime is set in User.createPasswordResetToken — keep the copy in step. */
const RESET_VALIDITY = '15 minutes';

const sendPasswordResetEmail = async ({ to, name, resetUrl }) => {
  // Named rather than "your account": the reader has to be able to tell which
  // account this is at a glance, since a reset mail is exactly what a phishing
  // attempt imitates. The address the reset was asked for is printed for the
  // same reason — it is how someone who did not start this tells whether the
  // request was even aimed at them.
  const { siteName } = await getBranding();

  return send({
    to,
    subject: 'Reset your password',
    text:
      `Hi ${name},\n\nSomeone (hopefully you) requested a password reset for ${to}. ` +
      `Open the link below to choose a new one — it expires in ${RESET_VALIDITY}.\n\n${resetUrl}\n\n` +
      `If you did not request a password reset you can safely ignore this email; your password will not change.`,
    title: 'Reset Your Password',
    // The heading and the artwork both live in the opening panel.
    hideHeading: true,
    banner: resetBanner(siteName),
    body: `
      <p style="margin:0 0 14px;font:700 16px/1.5 ${FONT};color:${C.ink900}">Hi ${escapeHtml(name)},</p>
      ${paragraph(
        `Someone (hopefully you) requested a password reset for the email
         <b style="color:${C.brand600}">${escapeHtml(to)}</b>.`
      )}
      ${paragraph(
        `Click the button below to reset your password. This link is secure and will expire in
         <b style="color:${C.ink900}">${RESET_VALIDITY}</b>.`
      )}
      ${button(resetUrl, 'Reset My Password', { align: 'center', icon: 'lock-white.png' })}
      ${paragraph(
        `<span style="font-size:14px">If the button above doesn't work, copy and paste this link
         into your browser:</span>`
      )}
      ${linkBox(resetUrl)}
      ${noteCard(
        'Security Note:',
        `If you didn't request a password reset, you can safely ignore this email.
         Your account is still secure.`
      )}`,
  });
};

/**
 * The code that finishes a sign-up. Sent the moment the registration form is
 * submitted, and again on request until the resend budget runs out.
 *
 * The address is printed in the copy for the same reason the reset mail prints
 * it: someone who did not sign up has to be able to tell, from the message alone,
 * that a stranger typed *their* address into our form — and the closing note
 * tells them the one thing they need to know about it, which is that ignoring it
 * is enough. There is no button and no link anywhere in this mail: a code that is
 * typed back into a tab the reader already has open cannot be phished by a
 * lookalike of this email, and adding a link would teach them to click one.
 */
const sendEmailVerificationEmail = async ({ to, name, code, minutes }) => {
  const { siteName } = await getBranding();
  const window = `${minutes} minute${minutes === 1 ? '' : 's'}`;

  return send({
    to,
    // The code rides in the subject as well: on a phone the notification alone is
    // often enough, and it saves opening the mail at all.
    subject: `${code} is your ${siteName} verification code`,
    text:
      `Hi ${name},\n\nYour ${siteName} verification code is ${code}.\n\n` +
      `Enter it on the verification screen to finish creating your account. ` +
      `The code expires in ${window}.\n\n` +
      `If you did not sign up for ${siteName}, you can safely ignore this email — ` +
      `the account cannot be used until this code is entered.`,
    title: 'Verify your email address',
    hideHeading: true,
    banner: verifyBanner(siteName),
    body: `
      <p style="margin:0 0 14px;font:700 16px/1.5 ${FONT};color:${C.ink900}">Hi ${escapeHtml(name)},</p>
      ${paragraph(
        `Use the code below to verify <b style="color:${C.brand600}">${escapeHtml(to)}</b> and
         finish creating your account.`
      )}
      ${codeBox(code)}
      ${paragraph(
        `<span style="font-size:14px">This code expires in
         <b style="color:${C.ink900}">${window}</b> and can only be used once.</span>`
      )}
      ${noteCard(
        'Didn&rsquo;t sign up?',
        `Someone may have typed your address by mistake. You can safely ignore this email &mdash;
         no account can be used until this code is entered, and we will not email you again.`
      )}`,
  });
};

/**
 * Sent once, at the moment repeated wrong passwords close an account to sign-in.
 *
 * This mail is the only place the lock is ever announced. The login endpoint
 * answers a locked account exactly as it answers an unknown address, so that
 * someone guessing their way through a list of emails learns nothing from the
 * response — while the person who actually owns the inbox is told plainly what
 * happened, how long it lasts, and that a reset gets them straight back in.
 *
 * It is deliberately not a security alarm: far and away the most common cause is
 * the owner mistyping their own password, so the copy leads with the wait and
 * mentions the alternative only after.
 */
const sendAccountLockedEmail = async ({ to, name, minutes }) => {
  const { siteName } = await getBranding();
  const resetUrl = `${env.clientUrl}/forgot-password`;
  const window = `${minutes} minute${minutes === 1 ? '' : 's'}`;

  return send({
    to,
    subject: 'Your sign-in has been paused',
    text:
      `Hi ${name},\n\nThere were several failed sign-in attempts for ${to}, so we have paused ` +
      `sign-in on this account for ${window}. You can try again after that.\n\n` +
      `If it wasn't you, or you'd rather not wait, reset your password here: ${resetUrl}\n\n` +
      `Your password has not been changed and nobody has been signed in.`,
    title: 'Sign-in temporarily paused',
    // Same shape as the reset and verification mails: the heading and the
    // artwork live in the opening panel, and the column below it is instruction.
    hideHeading: true,
    banner: lockedBanner(siteName),
    body: `
      <p style="margin:0 0 14px;font:700 16px/1.5 ${FONT};color:${C.ink900}">Hi ${escapeHtml(name)},</p>
      ${paragraph(
        `We noticed several failed sign-in attempts for
         <b style="color:${C.brand600}">${escapeHtml(to)}</b>, so we&rsquo;ve paused sign-in on
         that account for a short while.`
      )}
      ${waitBox(minutes)}
      ${paragraph(
        `<span style="font-size:14px">If that was you mistyping your password, nothing else is
         needed &mdash; simply try again once the ${window} is up.</span>`
      )}
      ${paragraph(
        `If it wasn&rsquo;t you &mdash; or you&rsquo;d rather not wait &mdash; resetting your
         password lifts the pause straight away.`
      )}
      ${button(resetUrl, 'Reset My Password', { align: 'center', icon: 'lock-white.png' })}
      ${noteCard(
        'Security Note:',
        `Nobody signed in and your password has not changed. This pause exists so that
         repeated guesses cannot be used to work out your password.`
      )}`,
  });
};

/**
 * `async` for the same reason as every other sender here: the whole document is
 * built while the argument to `send()` is evaluated, so a malformed order threw
 * *synchronously* — before the caller's `.catch()` was ever attached. Callers
 * fire this and walk away (order.controller, payment.controller), so that throw
 * escaped into the request and failed a checkout whose order had already been
 * written. An async function returns the rejection instead, which is what the
 * "a mail outage must not fail the request that triggered it" rule on sendMail()
 * has always promised.
 */
const sendOrderConfirmationEmail = async ({ to, name, order }) =>
  send({
    to,
    subject: `Order ${order.orderNumber} placed successfully`,
    text: orderTextSummary(order, `Hi ${name}, thank you for shopping with us — your order is confirmed.`),
    title: `Order ${order.orderNumber} placed successfully`,
    // The masthead names the order rather than the email: it is the number the
    // reader quotes back to support, so it belongs where they will look first.
    tag: `Order #${order.orderNumber}`,
    hideHeading: true,
    hero: placedHero(),
    body: `
      <h1 class="p-h1" style="margin:0 0 2px;font:800 26px/1.3 ${FONT};color:${C.brand900};
                 letter-spacing:-.5px">Thank You!</h1>
      <h1 class="p-h1" style="margin:0 0 14px;font:800 26px/1.3 ${FONT};color:${C.brand900};
                 letter-spacing:-.5px">Your Order Has Been Placed</h1>
      ${paragraph(
        `<span style="font-size:14px">Hi <b style="color:${C.ink900}">${escapeHtml(name)}</b>,
         we&rsquo;ve received your order and it&rsquo;s now being processed.</span>`
      )}`,
    wide: `
      ${rule(26)}
      ${placedDetails(order)}
      ${rule()}
      ${placedSummary(order)}
      ${wideButton(orderUrl(order), 'View Order')}
      ${benefitsPanel()}`,
  });

/**
 * Copy per status. Everything else (tracker, details, totals, trust row) is
 * identical across the order mails, so a shopper reads one familiar layout from
 * checkout through delivery.
 *
 * The headline deliberately does *not* name the status: every in-flight update
 * says the same thing ("something moved"), and the tracker and the status card
 * directly beneath it name which thing, once, in the reader's own words. Only
 * the three states that end the journey earn a headline of their own — those
 * are the mails nobody is expecting.
 *
 * `status` is the line inside the current-status card. The four in-flight
 * entries are exactly Order.STATUS_FLOW's fulfilment path; the closed states
 * take their line from the order itself, in sendOrderStatusEmail below.
 */
const STATUS_LEAD = {
  lead: 'Good News!',
  highlight: 'Your Order Status Has Updated',
  message: 'your order status has been updated.',
};

const STATUS_COPY = {
  confirmed: { status: 'We have accepted your order and are getting it ready for packing.' },
  packed: { status: 'We are preparing your order and it will be shipped soon.' },
  shipped: { status: 'Your order has left our warehouse and is on its way to you.' },
  out_for_delivery: { status: 'Your order is out for delivery and should reach you today.' },
  delivered: {
    lead: 'Great News!',
    highlight: 'Your Order Has Been Delivered',
    message: 'your order has been delivered.',
    status: 'Your order has reached you. We hope you love it.',
  },
  cancelled: {
    lead: 'Order Update',
    highlight: 'Your Order Has Been Cancelled',
    message: 'your order has been cancelled.',
  },
  returned: {
    lead: 'Order Update',
    highlight: 'Your Order Has Been Returned',
    message: 'your order return has been completed.',
  },
};

/**
 * The status card's line for an order that has stopped: who ended it, the reason
 * they gave, and the refund note where the money has already been sent back.
 *
 * Naming the side that cancelled is the difference between a receipt and a
 * shock — "cancelled at your request" answers the question a red email opens
 * with. Nothing is promised that the payment record does not already show.
 */
const CANCELLED_BY_LEAD = {
  customer: 'Cancelled at your request',
  admin: 'Cancelled by our team',
};

/**
 * The refund sentence, keyed off the payment record rather than off the
 * cancellation — a refund is raised by hand through the gateway, and this mail
 * must not claim it has happened while the order is still queued for it. An
 * unpaid COD order gets no line at all: there is nothing to send back.
 */
const REFUND_LINE = {
  refund_pending: 'Your refund has been initiated and will reach your original payment method shortly.',
  refunded: 'Any amount paid has been refunded to the original payment method.',
};

const closedStatusLine = (order) => {
  const reason = order.cancellationReason;
  const lead = CANCELLED_BY_LEAD[order.cancelledBy];

  return [
    reason
      ? escapeHtml(lead ? `${lead} — ${reason}` : reason)
      : escapeHtml(`Order ${order.orderNumber} was ${statusLabel(order.orderStatus)}.`),
    REFUND_LINE[order.paymentStatus],
  ]
    .filter(Boolean)
    .join('<br>');
};

/** `async` for the reason spelled out on sendOrderConfirmationEmail above. */
const sendOrderStatusEmail = async ({ to, name, order }) => {
  const copy = { ...STATUS_LEAD, ...(STATUS_COPY[order.orderStatus] || {}) };
  const status = isClosed(order)
    ? closedStatusLine(order)
    : copy.status || `Your order is now ${statusLabel(order.orderStatus)}.`;

  return send({
    to,
    subject: `Order ${order.orderNumber} is now ${statusLabel(order.orderStatus)}`,
    text: orderTextSummary(order, `Hi ${name}, ${copy.message}`),
    title: `Order ${order.orderNumber} — ${statusLabel(order.orderStatus)}`,
    // The masthead names the order rather than the email — the number the reader
    // quotes back to support, exactly as the confirmation mail carries it.
    tag: `Order #${order.orderNumber}`,
    ...orderBody({
      order,
      name,
      lead: copy.lead,
      highlight: copy.highlight,
      message: copy.message,
      status,
    }),
  });
};

/* ------------------------------------------------------------------ *
 * Inquiry acknowledgement
 *
 * The one email a visitor gets before anybody at the company has read a
 * word they wrote, so it does the reassuring on its own: a receipt of
 * exactly what was submitted, what the company will do with it, and a way
 * to reach a human in the meantime.
 *
 * It builds its own body rather than going through `layout()` — the tinted
 * hero panel, the details card and the brand-coloured social chips are its
 * own — but it opens on the shared `header()`, the same dark masthead every
 * other transactional mail carries. An enquiry receipt is not a different
 * company from an order confirmation, and a white masthead here made it look
 * like one; the bar is the one element that has to be identical across the
 * suite for the sender to be recognisable at a glance.
 * ------------------------------------------------------------------ */

/**
 * Tinted panel that opens the message: the envelope-with-a-tick artwork beside
 * the thank-you. The script line is Georgia italic rather than a webfont —
 * mail clients do not load one, and a missing family would drop the greeting
 * back to the same face as the heading below it.
 */
const inquiryHeroPanel = () => `
  <tr>
    <td class="p-inq-pad" style="padding:16px 32px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:${C.brand50};border-radius:14px">
        <tr>
          <td class="p-hero" width="228" style="width:228px;padding:16px 4px 16px 12px;
              vertical-align:middle;font-size:0;line-height:0">
            ${image('inquiry-hero.png', { width: 210, height: 193, alt: '', style: 'margin:0 auto', cls: 'p-art' })}
          </td>
          <td class="p-inq-copy" style="padding:24px 26px 24px 10px;vertical-align:middle">
            <p style="margin:0 0 2px;font:italic 700 23px/1.3 Georgia,'Times New Roman',serif;
               color:${C.brand600}">Thank You!</p>
            <h1 class="p-h1" style="margin:0 0 14px;font:800 28px/1.2 ${FONT};color:${C.ink900};
                       letter-spacing:-.6px">We&rsquo;ve Received<br>Your Inquiry</h1>
            <div style="width:56px;height:4px;border-radius:2px;background:${C.brand600};margin:0 0 16px"></div>
            <p style="margin:0;font:400 14px/1.75 ${FONT};color:${C.ink600}">
              We appreciate you reaching out to us. Our team has received your inquiry and
              will get back to you shortly.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;

/**
 * The reply's own opening panel: the same tinted card as the acknowledgement,
 * mirrored. The copy leads and the envelope artwork closes the row, because a
 * reply is read as an answer to something — the eye should land on "here's our
 * reply" first, not on the picture it already saw when the enquiry was filed.
 */
const inquiryReplyHeroPanel = () => `
  <tr>
    <td class="p-inq-pad" style="padding:16px 32px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:${C.brand50};border-radius:14px">
        <tr>
          <td class="p-inq-copy" style="padding:26px 10px 26px 26px;vertical-align:middle">
            <p style="margin:0 0 6px;font:700 15px/1.4 ${FONT};color:${C.ink900}">
              Good News! &#128075;
            </p>
            <h1 class="p-h1" style="margin:0 0 14px;font:800 28px/1.2 ${FONT};color:${C.ink900};
                       letter-spacing:-.6px">Here&rsquo;s Our Reply<br>To Your Inquiry</h1>
            <div style="width:56px;height:4px;border-radius:2px;background:${C.brand600};margin:0 0 16px"></div>
            <p style="margin:0;font:400 14px/1.75 ${FONT};color:${C.ink600}">
              Thank you for reaching out to us. We have reviewed your inquiry and
              here is our response.
            </p>
          </td>
          <td class="p-hero" width="228" style="width:228px;padding:16px 12px 16px 4px;
              vertical-align:middle;font-size:0;line-height:0">
            ${image('inquiry-hero.png', { width: 210, height: 193, alt: '', style: 'margin:0 auto', cls: 'p-art' })}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;

/**
 * One "Label : Value" line of the details card — the careers row, tightened:
 * the glyph is a filled mark rather than a stroked one, and the label column is
 * narrower because these labels are single words.
 */
const inquiryRow = (icon, label, value) => `
  <tr>
    <td class="p-row-icon" width="32" style="width:32px;padding:0 0 13px;vertical-align:top;
        font-size:0;line-height:0">
      ${image(icon, { width: 18, height: 18, alt: '' })}
    </td>
    <td class="p-inq-label p-row-label" width="150" style="width:150px;padding:0 0 13px;vertical-align:top;
        font:600 13px/1.5 ${FONT};color:${C.ink900}">${label}</td>
    <td class="p-row-sep" width="16" style="width:16px;padding:0 0 13px;vertical-align:top;
        font:400 13px/1.5 ${FONT};color:${C.ink400}">:</td>
    <td class="p-row-value" style="padding:0 0 13px;vertical-align:top;font:400 13px/1.6 ${FONT};
        color:${C.ink600}">${value}</td>
  </tr>`;

/**
 * What was submitted, verbatim — the facts a visitor may want to quote back.
 * The reply mail reuses the card under its own heading ("Summary"), since by
 * then the details are context for the answer rather than the receipt itself.
 */
const inquiryDetails = (rows, heading = 'Your Inquiry Details') => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:24px 0 0;background:#ffffff;border:1px solid ${C.ink200};border-radius:14px">
    <tr>
      <td class="p-cardpad" style="padding:22px 24px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="margin:0 0 16px">
          <tr>
            <td width="56" style="width:56px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                     style="background:${C.brand50};border-radius:12px">
                <tr><td width="44" height="44" align="center"
                        style="width:44px;height:44px;font-size:0;line-height:0">
                  ${image('job-file.png', { width: 22, height: 22, alt: '', style: 'margin:0 auto' })}
                </td></tr>
              </table>
            </td>
            <td style="font:800 17px/44px ${FONT};color:${C.ink900}">${heading}</td>
          </tr>
        </table>
        <div style="height:1px;background:${C.ink200};margin:0 0 18px;font-size:0;line-height:0">&nbsp;</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${rows.join('')}
        </table>
      </td>
    </tr>
  </table>`;

/**
 * What the company does with an enquiry once it lands, in order. Kept here
 * rather than in the copy so the mail and the contact page promise the same
 * three things.
 */
const INQUIRY_STEPS = [
  {
    icon: 'inquiry-step-review.png',
    title: 'We Review',
    text: 'Our team will carefully review your inquiry.',
  },
  {
    icon: 'inquiry-step-respond.png',
    title: 'We Respond',
    text: 'We will get back to you via email or phone.',
  },
  {
    icon: 'inquiry-step-support.png',
    title: 'We Support',
    text: 'We are here to help and ensure your satisfaction.',
  },
];

/**
 * The three stages as columns split by hairline rules, under a heading with a
 * rule running out of either side. Both sets of rules are borders on cells, so
 * they drop away with the cells when `.p-col` stacks the columns on mobile.
 */
const inquirySteps = () => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"
         style="margin:30px auto 0">
    <tr>
      <td class="p-hrule" width="60" style="width:60px;vertical-align:middle">
        <div style="height:2px;background:${C.brand100};font-size:0;line-height:0">&nbsp;</div>
      </td>
      <td align="center" style="padding:0 16px;font:800 17px/1.3 ${FONT};color:${C.brand600};white-space:nowrap">
        What Happens Next?
      </td>
      <td class="p-hrule" width="60" style="width:60px;vertical-align:middle">
        <div style="height:2px;background:${C.brand100};font-size:0;line-height:0">&nbsp;</div>
      </td>
    </tr>
  </table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0">
    <tr>
      ${INQUIRY_STEPS.map(
        (step, index) => `
        <td class="p-col" width="33%" align="center"
            style="width:33%;vertical-align:top;padding:0 14px;
                   ${index ? `border-left:1px solid ${C.ink200}` : ''}">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"
                 style="margin:0 auto 12px;background:${C.brand50};border-radius:28px">
            <tr><td width="56" height="56" align="center"
                    style="width:56px;height:56px;font-size:0;line-height:0">
              ${image(step.icon, { width: 26, height: 26, alt: '', style: 'margin:0 auto' })}
            </td></tr>
          </table>
          <p style="margin:0 0 5px;font:700 14px/1.4 ${FONT};color:${C.ink900}">${step.title}</p>
          <p style="margin:0;font:400 12px/1.6 ${FONT};color:${C.ink500}">${step.text}</p>
        </td>`
      ).join('')}
    </tr>
  </table>`;

/**
 * Closing bar for anyone who cannot wait for the reply: the support number, and
 * a button back to the contact page. The button is a cell background with a
 * padded link inside, so it stays a filled shape in clients that drop
 * background images.
 *
 * `title`/`text` default to the acknowledgement's copy; the reply mail passes
 * its own ("need *more* help?" — the first answer has already been given) and
 * spells the channels out, since by then there is nothing left to wait for.
 */
const inquirySupportBar = (brand, { title, text } = {}) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:28px 0 0;background:${C.brand50};border-radius:12px">
    <tr>
      <td style="padding:18px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td class="p-cta" width="58" style="width:58px;padding-right:12px;
                vertical-align:middle;font-size:0;line-height:0">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                     style="background:#ffffff;border-radius:23px">
                <tr><td width="46" height="46" align="center"
                        style="width:46px;height:46px;font-size:0;line-height:0">
                  ${image('job-headset.png', { width: 24, height: 24, alt: '', style: 'margin:0 auto' })}
                </td></tr>
              </table>
            </td>
            <td class="p-cta" style="vertical-align:middle">
              <p style="margin:0 0 4px;font:800 14px/1.4 ${FONT};color:${C.ink900}">
                ${title || 'Need immediate assistance?'}
              </p>
              <p style="margin:0;font:400 13px/1.6 ${FONT};color:${C.ink600}">
                ${
                  text ||
                  (brand.supportPhone
                    ? `Call us at <b style="color:${C.ink900}">${escapeHtml(brand.supportPhone)}</b> or reply to this email.`
                    : 'Reply to this email and our support team will help you out.')
                }
              </p>
            </td>
            <td class="p-cta" align="right" style="padding-left:14px;vertical-align:middle">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right" class="p-btn">
                <tr><td style="background:${C.brand600};border-radius:8px">
                  <a href="${env.clientUrl}/contact"
                     style="display:inline-block;padding:13px 24px;color:#ffffff;text-decoration:none;
                            font:600 14px/1 ${FONT};border-radius:8px;white-space:nowrap">Contact Us</a>
                </td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;

/**
 * Sign-off: the thank-you, then the social chips in each network's own colour —
 * this mail closes on a light card, where the footer's dark discs would read as
 * a row of holes.
 *
 * The sentence leads and the chips follow it, so the block closes on the
 * invitation rather than opening on it: the reader finishes the message, is
 * thanked, and *then* is offered somewhere else to go. The chips carry no
 * "Follow us on" label — five recognisable marks in a row need no caption, and
 * the words only put a heading between the thank-you and the thing it leads to.
 */
const inquiryFooter = (brand) => {
  const year = new Date().getFullYear();

  const socials = brand.socials.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"
              style="margin:0 auto 18px">
         <tr>
           ${brand.socials
             .map(
               (s) => `<td style="padding:0 5px">
                 <a href="${escapeHtml(s.href)}" title="${escapeHtml(s.label)}"
                    style="display:block;width:32px;height:32px;border-radius:16px;
                    background:${C.brand600};color:#ffffff;text-decoration:none;font-size:0"
                    >${image(s.file.replace('social-', 'social-color-'), {
                      width: 32,
                      height: 32,
                      alt: s.label,
                    })}</a></td>`
             )
             .join('')}
         </tr>
       </table>`
    : '';

  return `
  <tr>
    <td class="p-inq-pad" style="padding:26px 32px 28px;text-align:center">
      <div style="height:1px;background:${C.ink200};margin:0 0 22px;font-size:0;line-height:0">&nbsp;</div>
      <p style="margin:0 0 16px;font:400 13px/1.7 ${FONT};color:${C.ink600}">
        Thank you for choosing
        <b style="color:${C.brand600}">${escapeHtml(brand.siteName)}</b>.<br>
        We look forward to serving you!
      </p>
      ${socials}
      ${
        // Its own line rather than a <br> inside the copyright: where we are and
        // who owns the mail are two separate facts, and running them together
        // read as one long legal string.
        brand.address
          ? `<p style="margin:0 0 6px;font:400 12px/1.7 ${FONT};color:${C.ink400}">
               ${escapeHtml(brand.address)}
             </p>`
          : ''
      }
      <p style="margin:0;font:400 12px/1.7 ${FONT};color:${C.ink400}">
        &copy; ${year} ${escapeHtml(brand.siteName)}. All rights reserved.
      </p>
    </td>
  </tr>`;
};

/**
 * Auto-acknowledgement sent the moment a contact form is submitted.
 *
 * `phone`, `subject` and `receivedAt` are optional: the contact form leaves the
 * subject blank when the visitor picks no topic, and a caller with no timestamp
 * to hand gets now, which is the moment the enquiry was filed anyway. A row is
 * simply left out rather than printed empty.
 */
const sendInquiryAckEmail = async ({ to, name, email, phone, subject, message, receivedAt }) => {
  const brand = await getBranding();
  const address = email || to;
  // "10:30 AM", not the locale's own "10:30 am" — this card sets each value in
  // the same weight, and a lowercase meridiem reads as a typo beside them.
  const received = dateTime(receivedAt).replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());

  const rows = [
    inquiryRow('inquiry-user.png', 'Name', escapeHtml(name)),
    address &&
      inquiryRow(
        'inquiry-mail.png',
        'Email',
        `<a href="mailto:${escapeHtml(address)}"
            style="color:${C.brand600};text-decoration:none">${escapeHtml(address)}</a>`
      ),
    phone && inquiryRow('inquiry-phone.png', 'Phone', escapeHtml(phone)),
    inquiryRow('inquiry-calendar.png', 'Date Received', received),
    subject && inquiryRow('inquiry-subject.png', 'Subject', escapeHtml(subject)),
    inquiryRow(
      'inquiry-message.png',
      'Message',
      `<span style="white-space:pre-wrap">${escapeHtml(message)}</span>`
    ),
  ].filter(Boolean);

  const title = 'We&rsquo;ve received your inquiry';

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>${head}</head>
<body style="margin:0;padding:0;background:${C.ink100}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">
    Thank you for contacting ${escapeHtml(brand.siteName)} — we will get back to you shortly.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="p-shell"
         style="background:${C.ink100};padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="p-card"
             style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;
                    border:1px solid ${C.ink200}">
        ${header(brand)}
        ${inquiryHeroPanel()}
        <tr>
          <td class="p-inq-pad" style="padding:28px 32px 0">
            <p style="margin:0 0 10px;font:800 19px/1.4 ${FONT};color:${C.ink900}">
              Hello <span style="color:${C.brand600}">${escapeHtml(name)}</span>,
            </p>
            <p style="margin:0;font:400 14px/1.75 ${FONT};color:${C.ink600}">
              Thank you for contacting ${escapeHtml(brand.siteName)}. We&rsquo;ve received your inquiry and
              one of our team members will review it and respond as soon as possible.
            </p>
            ${inquiryDetails(rows)}
            ${inquirySteps()}
            ${inquirySupportBar(brand)}
          </td>
        </tr>
        ${inquiryFooter(brand)}
      </table>
    </td></tr>
  </table>
</body></html>`;

  return sendMail({
    to,
    subject: "We've received your inquiry",
    text: [
      `Hello ${name},`,
      '',
      `Thank you for contacting ${brand.siteName}. We've received your inquiry and one of our`,
      'team members will review it and respond as soon as possible.',
      '',
      'Your inquiry details',
      `Name: ${name}`,
      ...(address ? [`Email: ${address}`] : []),
      ...(phone ? [`Phone: ${phone}`] : []),
      `Date received: ${received}`,
      ...(subject ? [`Subject: ${subject}`] : []),
      `Message: ${message}`,
      '',
      'What happens next?',
      ...INQUIRY_STEPS.map((step) => `- ${step.title} — ${step.text}`),
      '',
      ...(brand.supportPhone
        ? [`Need immediate assistance? Call us at ${brand.supportPhone} or reply to this email.`]
        : ['Need immediate assistance? Just reply to this email.']),
      '',
      `Thank you for choosing ${brand.siteName}. We look forward to serving you!`,
    ].join('\n'),
    html,
  });
};

/* ------------------------------------------------------------------ *
 * Inquiry reply
 *
 * The answer to the message the acknowledgement above confirmed. It is
 * built from that mail's own parts — masthead, hero panel, details card,
 * support bar, colour social footer — so the pair reads as one thread
 * rather than two unrelated emails.
 *
 * The one block it adds is the response card: the admin's words, set
 * apart on the success tint, because everything else on the page is a
 * restatement of what the reader already sent us.
 * ------------------------------------------------------------------ */

/**
 * The reply itself. Green rather than brand blue — the storefront marks
 * anything resolved in `success`, and the card has to read as the answer at a
 * glance beside the blue summary card restating the question.
 *
 * The greeting and the sign-off are the template's, not the admin's: the
 * Inquiries composer is a bare textarea, so the mail supplies the frame the way
 * the old version put "Hi {name}," in the heading above it.
 */
const inquiryResponseCard = (brand, name, reply) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:22px 0 0;background:${C.green50};border:1px solid ${C.green100};border-radius:14px">
    <tr>
      <td class="p-cardpad" style="padding:22px 24px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="margin:0 0 16px">
          <tr>
            <td width="56" style="width:56px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                     style="background:${C.green100};border-radius:22px">
                <tr><td width="44" height="44" align="center"
                        style="width:44px;height:44px;font-size:0;line-height:0">
                  ${image('inquiry-reply.png', { width: 22, height: 22, alt: '', style: 'margin:0 auto' })}
                </td></tr>
              </table>
            </td>
            <td style="font:800 17px/44px ${FONT};color:${C.ink900}">Our Response</td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="vertical-align:middle">
              <p style="margin:0 0 12px;font:700 14px/1.6 ${FONT};color:${C.ink900}">
                Hello ${escapeHtml(String(name).trim().split(/\s+/)[0] || name)},
              </p>
              <div style="font:400 14px/1.75 ${FONT};color:${C.ink600};
                          white-space:pre-wrap">${escapeHtml(reply)}</div>
              <p style="margin:16px 0 0;font:400 14px/1.6 ${FONT};color:${C.ink600}">
                <b style="color:${C.ink900}">Best regards,</b><br>
                The <b style="color:${C.brand600}">${escapeHtml(brand.siteName)}</b> Team
              </p>
            </td>
            <td class="p-hero" width="164" style="width:164px;padding-left:12px;
                vertical-align:middle;font-size:0;line-height:0">
              ${image('inquiry-response.png', { width: 150, height: 150, alt: '', style: 'margin:0 auto', cls: 'p-art' })}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;

/** Envelope / handset glyph set inline in a line of copy, not in its own cell. */
const inlineGlyph = (file) =>
  image(file, { width: 14, height: 14, alt: '', style: 'display:inline-block;vertical-align:-2px' });

/**
 * An admin's reply from the Inquiries inbox.
 *
 * `subject` and `receivedAt` are optional for the same reason as in the
 * acknowledgement — the contact form allows a blank topic, and a caller with no
 * timestamp gets now. A row is left out rather than printed empty.
 */
const sendInquiryReplyEmail = async ({
  to,
  name,
  subject,
  reply,
  originalMessage,
  receivedAt,
}) => {
  const brand = await getBranding();
  const received = dateTime(receivedAt).replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());

  const rows = [
    subject && inquiryRow('inquiry-subject.png', 'Subject', escapeHtml(subject)),
    inquiryRow('inquiry-calendar.png', 'Date Received', received),
    originalMessage &&
      inquiryRow(
        'inquiry-mail.png',
        'Your Message',
        `<span style="white-space:pre-wrap">${escapeHtml(originalMessage)}</span>`
      ),
  ].filter(Boolean);

  // Both channels on one line, each behind its own glyph — the reader has an
  // answer already, so this is a way back to us rather than a promise to reply.
  // Each channel is `nowrap` so a long address pushes the phone onto its own
  // line whole, rather than splitting the number across two.
  const channels = [
    brand.supportEmail &&
      `<span style="white-space:nowrap">${inlineGlyph('inquiry-mail.png')}&nbsp;<a
         href="mailto:${escapeHtml(brand.supportEmail)}"
         style="color:${C.brand600};text-decoration:none;font-weight:600">${escapeHtml(
        brand.supportEmail
      )}</a></span>`,
    brand.supportPhone &&
      `<span style="white-space:nowrap">${inlineGlyph('inquiry-phone.png')}&nbsp;<b
         style="color:${C.ink900}">${escapeHtml(brand.supportPhone)}</b></span>`,
  ].filter(Boolean);

  const title = subject ? `Re: ${escapeHtml(subject)}` : 'Our reply to your inquiry';

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>${head}</head>
<body style="margin:0;padding:0;background:${C.ink100}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">
    ${escapeHtml(brand.siteName)} has replied to your inquiry.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="p-shell"
         style="background:${C.ink100};padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="p-card"
             style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;
                    border:1px solid ${C.ink200}">
        ${header(brand)}
        ${inquiryReplyHeroPanel()}
        <tr>
          <td class="p-inq-pad" style="padding:28px 32px 0">
            <p style="margin:0 0 10px;font:800 19px/1.4 ${FONT};color:${C.ink900}">
              Hello <span style="color:${C.brand600}">${escapeHtml(name)}</span>,
            </p>
            <p style="margin:0;font:400 14px/1.75 ${FONT};color:${C.ink600}">
              Thank you for contacting ${escapeHtml(brand.siteName)}. We truly appreciate your interest
              in our products/services. Please find our response to your inquiry below.
            </p>
            ${rows.length ? inquiryDetails(rows, 'Your Inquiry Summary') : ''}
            ${inquiryResponseCard(brand, name, reply)}
            ${inquirySupportBar(brand, {
              title: 'Need more help?',
              // A step down from the line above it — the cell left over beside
              // the button in a 600px card is narrow, and at 13px an address
              // and a number take three lines instead of two.
              // Spaces rather than a divider between the two: whether they fit
              // on one line depends on how long the address is, and a rule left
              // dangling at the end of a wrapped line reads as a typo.
              text: channels.length
                ? `We&rsquo;re just a message or call away.<br>
                   <span style="font-size:12px">${channels.join('&nbsp; &nbsp;')}</span>`
                : 'We&rsquo;re just a message away — simply reply to this email.',
            })}
          </td>
        </tr>
        ${inquiryFooter(brand)}
      </table>
    </td></tr>
  </table>
</body></html>`;

  return sendMail({
    to,
    subject: subject ? `Re: ${subject}` : 'Re: your inquiry',
    text: [
      `Hello ${name},`,
      '',
      `Thank you for contacting ${brand.siteName}. Please find our response to your inquiry below.`,
      '',
      ...(rows.length ? ['Your inquiry summary'] : []),
      ...(subject ? [`Subject: ${subject}`] : []),
      `Date received: ${received}`,
      ...(originalMessage ? [`Your message: ${originalMessage}`] : []),
      '',
      'Our response',
      reply,
      '',
      `Best regards,`,
      `The ${brand.siteName} Team`,
      '',
      ...(brand.supportEmail ? [`Email: ${brand.supportEmail}`] : []),
      ...(brand.supportPhone ? [`Phone: ${brand.supportPhone}`] : []),
    ].join('\n'),
    html,
  });
};

/* ------------------------------------------------------------------ *
 * Careers acknowledgement
 * ------------------------------------------------------------------ */

/**
 * Envelope-with-a-tick artwork beside the "thank you" copy. It sits in the copy
 * column rather than leading the mail the way the reset envelope does: a careers
 * acknowledgement is a reply to something the reader sent, so the words come
 * first. Decorative, so `alt=""` and hidden below 520px where the copy needs the
 * full width.
 */
const applicationHero = `
  <td class="p-hero" width="196" style="width:196px;vertical-align:middle;padding-left:16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center" style="font-size:0;line-height:0">
        ${image('application-mail.png', { width: 178, height: 163, alt: '', style: 'margin:0 auto', cls: 'p-art' })}
      </td></tr>
    </table>
  </td>`;

/**
 * One "Label : Value" line of the details card. The glyph sits in its own
 * narrow cell so every value starts on the same left edge whatever the label's
 * length — a colon column rather than a dotted leader, as on the careers page.
 */
const applicationRow = (icon, label, value) => `
  <tr>
    <td class="p-row-icon" width="34" style="width:34px;padding:0 0 12px;vertical-align:top;
        font-size:0;line-height:0">
      ${image(icon, { width: 20, height: 20, alt: '' })}
    </td>
    <td class="p-row-label" width="170" style="width:170px;padding:0 0 12px;vertical-align:top;
        font:700 13px/1.5 ${FONT};color:${C.ink900}">${label}</td>
    <td class="p-row-sep" width="16" style="width:16px;padding:0 0 12px;vertical-align:top;
        font:400 13px/1.5 ${FONT};color:${C.ink400}">:</td>
    <td class="p-row-value" style="padding:0 0 12px;vertical-align:top;font:400 13px/1.5 ${FONT};
        color:${C.ink600}">${value}</td>
  </tr>`;

/** What the application was filed as — the facts an applicant may want to quote back. */
const applicationDetails = (rows) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:26px 0 0;background:${C.ink50};border:1px solid ${C.ink200};border-radius:12px">
    <tr>
      <td class="p-cardpad" style="padding:22px 24px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px">
          <tr>
            <td width="34" style="width:34px;font-size:0;line-height:0">
              ${image('job-file.png', { width: 22, height: 22, alt: '' })}
            </td>
            <td style="font:800 16px/22px ${FONT};color:${C.ink900}">Application Details</td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${rows.join('')}
        </table>
      </td>
    </tr>
  </table>`;

/**
 * The three stages HR actually works an application through, in order. Kept
 * here rather than in the copy so the mail and the careers page describe the
 * same process.
 */
const HIRING_STEPS = [
  { title: 'Application Review', text: 'Our team will review your application carefully.' },
  { title: 'Shortlisting', text: "If your profile matches, we'll reach out to you." },
  { title: 'Next Steps', text: 'You may be invited for a test or interview.' },
];

/**
 * Green "what happens next?" panel: the three stages as numbered columns split
 * by hairline rules.
 *
 * Drawn by `stepsPanel` below, which is this block generalised over its accent
 * once the status mails needed the same panel in blue, periwinkle and green.
 * Called lazily, so reading a const declared further down the module is safe —
 * nothing here runs before the file has finished loading.
 */
const hiringSteps = () =>
  stepsPanel(APPLICATION_ACCENT.green, { title: 'What happens next?', steps: HIRING_STEPS });

/** Closing card pointing at whoever actually answers careers mail. */
const hrContactCard = (email) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:22px 0 0;background:${C.brand50};border:1px solid ${C.brand100};border-radius:12px">
    <tr>
      <td width="66" style="width:66px;padding:18px 0 18px 18px;vertical-align:middle;font-size:0;line-height:0">
        ${image('job-headset.png', { width: 26, height: 26, alt: '' })}
      </td>
      <td style="padding:18px 18px 18px 6px;vertical-align:middle">
        <p style="margin:0 0 4px;font:800 14px/1.4 ${FONT};color:${C.ink900}">Have questions?</p>
        <p style="margin:0;font:400 13px/1.6 ${FONT};color:${C.ink600}">
          ${
            email
              ? `Feel free to contact our HR team at
                 <a href="mailto:${escapeHtml(email)}"
                    style="color:${C.brand600};text-decoration:none;font-weight:600">${escapeHtml(email)}</a>`
              : 'Feel free to reply to this email and our HR team will help you out.'
          }
        </p>
      </td>
    </tr>
  </table>`;

/**
 * Auto-acknowledgement for a careers submission.
 *
 * `department` and `appliedAt` are optional — the department is admin-managed
 * on JobPosition and may be blank, and a caller that has no timestamp to hand
 * gets today's, which is the moment the application was filed anyway.
 */
const sendApplicationAckEmail = async ({ to, name, position, department = '', appliedAt }) => {
  const brand = await getBranding();
  const hrEmail = brand.supportEmail;

  const rows = [
    applicationRow('job-briefcase.png', 'Position Applied For', escapeHtml(position)),
    department && applicationRow('job-building.png', 'Department', escapeHtml(department)),
    applicationRow('job-calendar.png', 'Application Date', shortDate(appliedAt)),
  ].filter(Boolean);

  return send({
    to,
    subject: `We received your application for ${position}`,
    text: [
      `Hi ${name},`,
      '',
      `Thanks for applying for ${position}. We have received your application.`,
      '',
      `Position applied for: ${position}`,
      ...(department ? [`Department: ${department}`] : []),
      `Application date: ${shortDate(appliedAt)}`,
      '',
      'What happens next?',
      ...HIRING_STEPS.map((step, index) => `${index + 1}. ${step.title} — ${step.text}`),
      '',
      `We appreciate your interest in joining ${brand.siteName}. Best of luck!`,
      ...(hrEmail ? ['', `Questions? Contact our HR team at ${hrEmail}.`] : []),
    ].join('\n'),
    title: 'Thank you for applying!',
    tag: 'Building a better future, together.',
    hideHeading: true,
    hero: applicationHero,
    body: `
      ${paragraph(`Hi ${escapeHtml(name)},`)}
      <h1 class="p-h1" style="margin:0 0 14px;font:800 27px/1.25 ${FONT};color:${C.ink900};
                 letter-spacing:-.5px">Thank you for applying!</h1>
      <div style="width:44px;height:4px;border-radius:2px;background:${C.brand600};margin:0 0 18px"></div>
      ${paragraph(
        `We've received your application for the
         <b style="color:${C.brand600}">${escapeHtml(position)}</b> position.`
      )}
      ${paragraph(
        `<span style="font-size:14px">Our team is excited to learn more about you and your experience.
         We'll review your application and get back to you soon.</span>`
      )}`,
    wide: `
      <div style="height:1px;background:${C.ink200};margin:28px 0 0;font-size:0;line-height:0">&nbsp;</div>
      ${applicationDetails(rows)}
      ${hiringSteps()}
      ${paragraph(
        `<span style="display:inline-block;margin-top:24px">We appreciate your interest in joining
         <b style="color:${C.brand600}">${escapeHtml(brand.siteName)}</b>.<br>Best of luck!</span>`
      )}
      ${hrContactCard(hrEmail)}`,
    // The card above already offers the HR address; the footer's own support
    // line would repeat it two inches lower.
    hideSupport: true,
  });
};

/* ------------------------------------------------------------------ *
 * Careers status update
 *
 * Sent when an admin moves an application along in the panel. The four
 * outcomes share one shell with the acknowledgement above — the same
 * masthead strapline, the same artwork beside the copy, the same details
 * card, the same numbered "what happens next" panel and the same HR card —
 * so an applicant reads one familiar layout from "we got it" through to the
 * decision. Only three things change with the status: the accent, the words,
 * and whether the journey is still running.
 * ------------------------------------------------------------------ */

/**
 * The ramps a status mail can wear. Each is a step of a scale the palette
 * already carries rather than a new hue: brand blue while the application is
 * moving, periwinkle for the wait after an interview, the storefront's success
 * green for an offer, and the same `RED` a cancelled order wears for the one
 * outcome that ends the journey.
 */
const APPLICATION_ACCENT = {
  brand: { tint: C.brand50, line: C.brand100, solid: C.brand600, deep: C.brand700 },
  iris: { tint: C.iris50, line: C.iris100, solid: C.iris700, deep: C.iris700 },
  green: { tint: C.green50, line: C.green100, solid: C.green600, deep: C.green700 },
  red: { tint: RED.tint, line: RED.line, solid: RED.base, deep: RED.base },
};

/**
 * The hiring journey the tracker draws — the model's own status list minus
 * `rejected`, which is not a point on the path but the path stopping. Labels
 * match the panel's status dropdown so the admin and the applicant never name
 * the same stage differently.
 */
const APPLICATION_STAGES = [
  { key: 'new', label: 'Applied', note: 'Application received' },
  { key: 'shortlisted', label: 'Shortlisted', note: 'Profile matched' },
  // The one stage whose label does not echo the panel's dropdown, which calls
  // this "Interviewed". The status is set when HR calls a candidate *in* for an
  // interview, not after one has happened — so to the applicant reading the rail
  // it is the stage they are entering, and a bead reading "Interviewed / Interview
  // done" told them an interview they have not sat yet was already behind them.
  { key: 'interviewed', label: 'Interview', note: 'Invite sent' },
  { key: 'hired', label: 'Hired', note: 'Offer confirmed' },
];

/**
 * Where the application has got to, drawn the way the order tracker draws a
 * parcel: a rounded tile per stage, the stage name and its caption underneath,
 * and a rail of dots joined by a progress line below the whole row. Read top
 * down, the row says what each stage *is* before it says how far along the
 * application has got, and the rail then answers that once, across the full
 * width, in a single line.
 *
 * The tiles are numbered rather than glyphed — the one place this departs from
 * the order tracker, and only because it has to. A hiring stage has no icon cut
 * for it in the mail assets, and an <img> that a client blocks would leave the
 * top row empty; a number is type, so it survives wherever the text does. The
 * numbering is also how the acknowledgement already draws a hiring stage.
 *
 * The connectors are 2px <div>s inside cells either side of the dot, not cell
 * backgrounds — a background paints the full row height, which is a band of
 * colour beside each dot rather than a line between them.
 *
 * Two looks only, tile and dot alike: the status's own accent once the stage is
 * reached, flat grey while it is not. There is deliberately no third look for
 * the stage the reader is standing on — a hollow "you are here" ring made the
 * current stage the one bead on the rail that read as unfinished. How far along
 * they are is what the connector behind it says, and which stage they are on is
 * what the status card underneath says.
 */
const applicationTracker = (status, accent) => {
  const rank = APPLICATION_STAGES.findIndex((stage) => stage.key === status);
  const width = `${(100 / APPLICATION_STAGES.length).toFixed(2)}%`;
  const reached = (index) => index <= rank;

  /** Solid accent behind stages already passed, flat grey ahead of them. */
  const connector = (index) =>
    index < 0 || index >= APPLICATION_STAGES.length - 1
      ? '<div style="height:2px;font-size:0;line-height:0">&nbsp;</div>'
      : `<div style="height:2px;font-size:0;line-height:0;background:${
          index < rank ? accent.solid : C.ink200
        }">&nbsp;</div>`;

  /**
   * The tinted square the stage number sits in. A table rather than a styled
   * <div>, and one that opts back out of the `border-collapse:collapse` the
   * head style sets on every table here: a collapsed table's `border-radius` is
   * ignored outright, so the tile would render as a hard square.
   *
   * The number is sized in `1` line-heights over a `valign="middle"` cell
   * rather than pinned to the tile's pixel height — `.p-step-tile` shrinks the
   * square on phones, and a baked-in `/46px` would leave the digit hanging
   * below the tile at every width but the widest.
   */
  const tile = (index) => `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"
             style="margin:0 auto;border-collapse:separate;border-spacing:0">
        <tr><td class="p-step-tile" width="46" height="46" align="center" valign="middle"
                style="width:46px;height:46px;border-radius:14px;
                       background:${reached(index) ? accent.tint : C.ink100}">
          <span class="p-step-num" style="font:800 16px/1 ${FONT};
                color:${reached(index) ? accent.deep : C.ink400}">${index + 1}</span>
        </td></tr>
      </table>`;

  /** One bead of the rail: solid in the accent once reached, hollow before. */
  const dot = (index) => `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"
             style="margin:0 auto;border-collapse:separate;border-spacing:0">
        <tr><td width="20" height="20"
                style="width:20px;height:20px;font-size:0;line-height:0;border-radius:12px;
                       ${
                         reached(index)
                           ? `background:${accent.solid};border:2px solid ${accent.solid}`
                           : `background:#ffffff;border:2px solid ${C.ink200}`
                       }">&nbsp;</td></tr>
      </table>`;

  const heads = APPLICATION_STAGES.map(
    (stage, index) => `
      <td class="p-step" width="${width}" align="center"
          style="width:${width};padding:0 3px;vertical-align:top">
        ${tile(index)}
        <p class="p-step-label" style="margin:12px 0 0;font:700 12px/1.4 ${FONT};
           color:${reached(index) ? C.ink900 : C.ink400}">${stage.label}</p>
        <p class="p-step-note" style="margin:4px 0 0;font:400 11px/1.4 ${FONT};
           color:${reached(index) ? C.ink500 : C.ink400}">${stage.note}</p>
      </td>`
  ).join('');

  const rail = APPLICATION_STAGES.map(
    (stage, index) => `
      <td class="p-stepdot" width="${width}" style="width:${width};padding:14px 0 0;
          vertical-align:middle">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="vertical-align:middle">${connector(index - 1)}</td>
            <td width="24" style="width:24px;font-size:0;line-height:0">${dot(index)}</td>
            <td style="vertical-align:middle">${connector(index)}</td>
          </tr>
        </table>
      </td>`
  ).join('');

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:26px 0 0">
    <tr>
      <td style="padding:0 4px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>${heads}</tr>
          <tr>${rail}</tr>
        </table>
      </td>
    </tr>
  </table>`;
};

/**
 * The one line that says where the application stands right now, boxed in the
 * status's own accent — the order mails' current-status card, with the stage
 * name where the order status would be. The tracker above draws the journey;
 * this names the point on it.
 */
const applicationStatusCard = (accent, { label, line }) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:24px 0 0;background:${accent.tint};border:1px solid ${accent.line};
                border-radius:12px">
    <tr>
      <td width="66" style="width:66px;padding:18px 0 18px 18px;vertical-align:middle;
          font-size:0;line-height:0">
        ${image('job-file.png', { width: 26, height: 26, alt: '' })}
      </td>
      <td style="padding:18px 18px 18px 6px;vertical-align:middle">
        <p style="margin:0 0 4px;font:800 14px/1.4 ${FONT};color:${accent.deep}">
          Current status: ${label}
        </p>
        <p style="margin:0;font:400 13px/1.6 ${FONT};color:${C.ink600}">${line}</p>
      </td>
    </tr>
  </table>`;

/** How each interview mode is named to the candidate, and the glyph it wears. */
const INTERVIEW_MODE_COPY = {
  'in-person': { label: 'In person', icon: 'job-building.png', where: 'Venue' },
  online: { label: 'Online / Video call', icon: 'job-users.png', where: 'Joining link' },
  phone: { label: 'Telephone', icon: 'inquiry-phone.png', where: 'Venue' },
};

/**
 * The appointment itself — the one block of this mail the candidate will come
 * back to, so it leads the wide column rather than sitting under the tracker
 * with the application facts.
 *
 * It is built from the details card's own "label : value" rows so it reads as
 * the same kind of object, but on the status accent rather than flat ink: this
 * is the news, and the application summary below it is the context.
 *
 * A row is omitted rather than printed empty. Everything but the slot and the
 * mode is optional on the model, and "Interviewer : —" tells the reader nothing
 * except that a field existed.
 */
const interviewCard = (accent, interview) => {
  const mode = INTERVIEW_MODE_COPY[interview.mode] || INTERVIEW_MODE_COPY['in-person'];
  const when = appointment(interview.scheduledAt);
  const online = interview.mode === 'online';

  const place = online
    ? interview.meetingLink &&
      `<a href="${escapeHtml(interview.meetingLink)}"
          style="color:${C.brand600};text-decoration:none;font-weight:600;word-break:break-all"
       >${escapeHtml(interview.meetingLink)}</a>`
    : escapeHtml(interview.location || '');

  const rows = [
    applicationRow(
      'job-calendar.png',
      'Date &amp; Time',
      `<b style="color:${C.ink900}">${escapeHtml(when.day)}</b> at
       <b style="color:${C.ink900}">${escapeHtml(when.time)}</b>${
        interview.durationMins
          ? `<span style="color:${C.ink500}"> &middot; ${interview.durationMins} minutes</span>`
          : ''
      }`
    ),
    applicationRow(mode.icon, 'Interview Mode', escapeHtml(mode.label)),
    place && applicationRow(mode.icon, mode.where, place),
    interview.interviewer &&
      applicationRow('job-users.png', 'You will meet', escapeHtml(interview.interviewer)),
    interview.contactPhone &&
      applicationRow('inquiry-phone.png', 'Contact', escapeHtml(interview.contactPhone)),
  ].filter(Boolean);

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:26px 0 0;background:${accent.tint};border:1px solid ${accent.line};
                border-radius:12px">
    <tr>
      <td class="p-cardpad" style="padding:22px 24px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px">
          <tr>
            <td width="34" style="width:34px;font-size:0;line-height:0">
              ${image('job-calendar.png', { width: 22, height: 22, alt: '' })}
            </td>
            <td style="font:800 16px/22px ${FONT};color:${accent.deep}">Your Interview Details</td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${rows.join('')}
        </table>

        ${
          interview.instructions
            ? `<div style="height:1px;background:${accent.line};margin:6px 0 16px;
                    font-size:0;line-height:0">&nbsp;</div>
               <p style="margin:0 0 6px;font:700 13px/1.5 ${FONT};color:${C.ink900}">
                 Before you join
               </p>
               <p style="margin:0;font:400 13px/1.7 ${FONT};color:${C.ink600}">
                 ${escapeHtml(interview.instructions).replace(/\n/g, '<br>')}
               </p>`
            : ''
        }
        ${
          // Only the online round gets a button: there is nothing to click for a
          // room to walk into or a phone that will ring.
          online && interview.meetingLink
            ? button(escapeHtml(interview.meetingLink), 'Join the Interview')
            : ''
        }
      </td>
    </tr>
  </table>`;
};

/**
 * The numbered "what happens next?" panel, generalised out of the
 * acknowledgement's green one so every careers mail draws its stages the same
 * way and only the accent moves. The hairline dividers are left borders on the
 * second and third cells, which drop away with the cells when `.p-col` stacks
 * them on mobile.
 */
const stepsPanel = (accent, { title, steps, icon = 'job-users.png' }) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:20px 0 0;background:${accent.tint};border:1px solid ${accent.line};
                border-radius:12px">
    <tr>
      <td class="p-cardpad" style="padding:22px 24px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px">
          <tr>
            <td width="56" style="width:56px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                     style="background:${accent.line};border-radius:22px">
                <tr><td width="44" height="44" align="center"
                        style="width:44px;height:44px;font-size:0;line-height:0">
                  ${image(icon, { width: 26, height: 26, alt: '', style: 'margin:0 auto' })}
                </td></tr>
              </table>
            </td>
            <td style="font:800 17px/44px ${FONT};color:${accent.deep}">${title}</td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            ${steps
              .map(
                (step, index) => `
              <td class="p-col" width="33%" align="center"
                  style="width:33%;vertical-align:top;padding:0 12px;
                         ${index ? `border-left:1px solid ${accent.line}` : ''}">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"
                       style="margin:0 auto 10px;background:${accent.solid};border-radius:14px">
                  <tr><td width="28" height="28" align="center"
                          style="width:28px;height:28px;font:700 13px/28px ${FONT};color:#ffffff">
                    ${index + 1}
                  </td></tr>
                </table>
                <p style="margin:0 0 4px;font:700 13px/1.4 ${FONT};color:${C.ink900}">${step.title}</p>
                <p style="margin:0;font:400 12px/1.6 ${FONT};color:${C.ink500}">${step.text}</p>
              </td>`
              )
              .join('')}
          </tr>
        </table>
      </td>
    </tr>
  </table>`;

/**
 * Copy per status, and nothing else — the shell, the details card, the tracker
 * and the HR card are identical across all four, so an applicant reads one
 * familiar layout whichever way the decision went.
 *
 * `new` is absent on purpose: it is the state an application is created in, and
 * the acknowledgement has already said what a "your status is New" mail would.
 *
 * `rejected` is the only entry with no tracker. The rail draws a journey, and a
 * rail whose last bead is red says "you stopped here" in the one mail where the
 * kindest thing the design can do is not draw the distance travelled. It closes
 * on the open-roles panel instead, which is the only next step it can honestly
 * offer. The accent is still the terminal red a cancelled order wears — the
 * status is final, and the panel says so once, quietly.
 */
const APPLICATION_STATUS_COPY = {
  shortlisted: {
    accent: 'brand',
    label: 'Shortlisted',
    subject: ({ position }) => `Good news — you have been shortlisted for ${position}`,
    lead: 'Good news!',
    heading: 'You have been shortlisted',
    intro: ({ position }) =>
      `Your application for the <b style="color:${C.brand600}">${position}</b> position stood out,
       and we would like to take it further.`,
    follow:
      'Our HR team is reviewing schedules and will reach out to you shortly with the next step.',
    statusLine: 'Your profile matched what we are looking for and has moved to the interview stage.',
    stepsTitle: 'What happens next?',
    steps: [
      { title: 'Interview Call', text: 'Our HR team will contact you to fix a time.' },
      { title: 'Interview', text: 'Meet the team and walk us through your work.' },
      { title: 'Decision', text: 'We will share the outcome as soon as we can.' },
    ],
  },

  /**
   * An invitation, not a thank-you. HR moves an application to `interviewed`
   * when they call the candidate in — the mail used to open "It was a pleasure
   * speaking with you", which reached the reader before the interview it was
   * thanking them for had happened.
   *
   * It names no date. There is no interview slot on JobApplication for one to be
   * read from, and a mail that invented "we will see you Tuesday" would be worse
   * than one that says HR will confirm the details — which is what actually
   * happens next.
   */
  interviewed: {
    accent: 'iris',
    label: 'Interview',
    subject: ({ position, interview }) =>
      interview
        ? `Interview scheduled for ${position} — ${appointment(interview.scheduledAt).full}`
        : `Interview invitation for ${position}`,
    lead: 'Next step',
    heading: 'You are invited to interview',
    intro: ({ position }) =>
      `We would like to meet you for the
       <b style="color:${C.iris700}">${position}</b> position and hear more about your work.`,
    // Two readings of the same status. HR normally sets it from the scheduling
    // dialog, which means the slot is in hand and the mail can state it; a
    // status changed without one still has to say something true, which is that
    // the details are coming.
    follow: ({ interview }) =>
      interview
        ? 'Your interview details are below. If that time does not work for you, just reply to this ' +
          'email and we will find another one.'
        : 'Our HR team will confirm the date, time and format with you shortly — please keep an eye ' +
          'on your inbox and your phone.',
    statusLine: ({ interview }) =>
      interview
        ? `Your interview is scheduled for ${appointment(interview.scheduledAt).full}.`
        : 'You have moved to the interview stage. Your interview details will follow shortly.',
    stepsTitle: 'What happens next?',
    steps: ({ interview }) =>
      interview
        ? [
            { title: 'Confirm', text: 'Reply to this email if you need a different time.' },
            { title: 'The Interview', text: 'Join a few minutes early and keep your ID handy.' },
            { title: 'Decision', text: 'We will share the outcome as soon as we can.' },
          ]
        : [
            { title: 'Schedule', text: 'HR will agree a slot that works for you.' },
            { title: 'The Interview', text: 'Meet the team and walk us through your work.' },
            { title: 'Decision', text: 'We will share the outcome as soon as we can.' },
          ],
  },

  hired: {
    accent: 'green',
    label: 'Hired',
    // The one status whose subject leads with the company rather than the role:
    // an offer is news about where you are going, not about what you applied for.
    subject: ({ siteName }) => `Congratulations — welcome to ${siteName}!`,
    lead: 'Congratulations!',
    heading: 'Welcome to the team',
    intro: ({ position }) =>
      `We are delighted to let you know that you have been selected for the
       <b style="color:${C.green700}">${position}</b> position.`,
    follow:
      'Everyone here is looking forward to working with you. Our HR team will take it from here.',
    statusLine: 'You have been selected. Your offer and joining details are on their way.',
    stepsTitle: 'Getting you started',
    steps: [
      { title: 'Offer Letter', text: 'HR will email your formal offer for signing.' },
      { title: 'Documents', text: 'Share the paperwork listed in the offer.' },
      { title: 'Onboarding', text: 'We will set up your first day and your kit.' },
    ],
  },

  rejected: {
    accent: 'red',
    label: 'Not selected',
    hideTracker: true,
    subject: ({ position }) => `Update on your application for ${position}`,
    lead: 'Application update',
    heading: 'Thank you for applying',
    intro: ({ position }) =>
      `Thank you for the time you put into your application for the
       <b style="color:${C.ink900}">${position}</b> position, and for your interest in us.`,
    follow:
      'After careful consideration we have decided to move ahead with another candidate for this role. ' +
      'This was a difficult call — it says nothing about the quality of your work.',
    statusLine:
      'We are not taking this application further. Your details stay with us for future openings.',
  },
};

/**
 * The closing panel of a rejection: the one thing the mail can actually offer.
 * It sits on the neutral card the details block uses rather than on the red
 * accent — the decision has already been stated once, and repeating the tint
 * under an invitation to apply again reads as a door closing twice.
 */
const openRolesPanel = () => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:20px 0 0;background:${C.brand50};border:1px solid ${C.brand100};
                border-radius:12px">
    <tr>
      <td class="p-cardpad" style="padding:22px 24px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px">
          <tr>
            <td width="56" style="width:56px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                     style="background:${C.brand100};border-radius:22px">
                <tr><td width="44" height="44" align="center"
                        style="width:44px;height:44px;font-size:0;line-height:0">
                  ${image('job-briefcase.png', { width: 26, height: 26, alt: '', style: 'margin:0 auto' })}
                </td></tr>
              </table>
            </td>
            <td style="font:800 17px/44px ${FONT};color:${C.brand700}">Keep in touch</td>
          </tr>
        </table>
        <p style="margin:0;font:400 13px/1.7 ${FONT};color:${C.ink600}">
          We hire through the year, and roles closer to your experience open regularly.
          We would genuinely welcome another application from you.
        </p>
        ${button(`${env.clientUrl}/careers`, 'View Open Positions', { icon: 'job-briefcase.png' })}
      </td>
    </tr>
  </table>`;

/**
 * Sent when an admin changes an application's status in the panel.
 *
 * `status` must be one of APPLICATION_STATUS_COPY's keys — `new` has no mail,
 * since the acknowledgement already covers it — and an unknown status is a
 * no-op rather than a half-written message. `hrEmail` is the careers contact
 * the admin manages under Positions & HR contact; it falls back to the store's
 * support address, which is what the acknowledgement prints.
 */
const sendApplicationStatusEmail = async ({
  to,
  name,
  position,
  department = '',
  appliedAt,
  status,
  interview = null,
  hrEmail = '',
}) => {
  const copy = APPLICATION_STATUS_COPY[status];
  if (!copy) return false;

  const brand = await getBranding();
  const accent = APPLICATION_ACCENT[copy.accent];
  const contact = hrEmail || brand.supportEmail;
  const safeName = escapeHtml(name);
  const safePosition = escapeHtml(position);

  // Only the interview mail has anything to do with an appointment. Guarding
  // here rather than at every use keeps a stale `interview` on a hired or
  // rejected record from leaking into a mail that never mentions one.
  const slot = status === 'interviewed' && interview?.scheduledAt ? interview : null;

  /**
   * Copy that reads the appointment is written as a function of it; copy that
   * does not is a plain value. Resolving both the same way here means only the
   * entries that actually vary have to know the difference.
   */
  const say = (value) => (typeof value === 'function' ? value({ interview: slot }) : value);
  const follow = say(copy.follow);
  const statusLine = say(copy.statusLine);
  const steps = say(copy.steps);

  const rows = [
    applicationRow('job-briefcase.png', 'Position Applied For', safePosition),
    department && applicationRow('job-building.png', 'Department', escapeHtml(department)),
    applicationRow('job-calendar.png', 'Application Date', shortDate(appliedAt)),
    applicationRow(
      'job-file.png',
      'Current Status',
      `<b style="color:${accent.deep}">${copy.label}</b>`
    ),
  ].filter(Boolean);

  return send({
    to,
    subject: copy.subject({ position, siteName: brand.siteName, interview: slot }),
    text: [
      `Hi ${name},`,
      '',
      copy.heading,
      follow,
      ...(slot
        ? [
            '',
            'Your interview details',
            `Date & time: ${appointment(slot.scheduledAt).full}${
              slot.durationMins ? ` (${slot.durationMins} minutes)` : ''
            }`,
            `Mode: ${(INTERVIEW_MODE_COPY[slot.mode] || INTERVIEW_MODE_COPY['in-person']).label}`,
            ...(slot.mode === 'online'
              ? slot.meetingLink
                ? [`Joining link: ${slot.meetingLink}`]
                : []
              : slot.location
              ? [`Venue: ${slot.location}`]
              : []),
            ...(slot.interviewer ? [`You will meet: ${slot.interviewer}`] : []),
            ...(slot.contactPhone ? [`Contact: ${slot.contactPhone}`] : []),
            ...(slot.instructions ? ['', `Before you join: ${slot.instructions}`] : []),
          ]
        : []),
      '',
      `Position applied for: ${position}`,
      ...(department ? [`Department: ${department}`] : []),
      `Application date: ${shortDate(appliedAt)}`,
      `Current status: ${copy.label}`,
      '',
      statusLine,
      ...(steps
        ? [
            '',
            `${copy.stepsTitle}`,
            ...steps.map((step, index) => `${index + 1}. ${step.title} — ${step.text}`),
          ]
        : ['', `See our open positions: ${env.clientUrl}/careers`]),
      '',
      `Thank you for your interest in ${brand.siteName}.`,
      ...(contact ? ['', `Questions? Contact our HR team at ${contact}.`] : []),
    ].join('\n'),
    title: `${copy.heading} — ${position}`,
    // The same strapline the acknowledgement carries, so the two mails are
    // visibly one conversation rather than two senders.
    tag: 'Building a better future, together.',
    hideHeading: true,
    hero: applicationHero,
    body: `
      ${paragraph(`Hi ${safeName},`)}
      <h1 class="p-h1" style="margin:0 0 14px;font:800 27px/1.25 ${FONT};color:${C.ink900};
                 letter-spacing:-.5px">${copy.heading}</h1>
      <div style="width:44px;height:4px;border-radius:2px;background:${accent.solid};margin:0 0 18px"></div>
      ${paragraph(copy.intro({ position: safePosition }))}
      ${paragraph(`<span style="font-size:14px">${follow}</span>`)}`,
    wide: `
      <div style="height:1px;background:${C.ink200};margin:28px 0 0;font-size:0;line-height:0">&nbsp;</div>
      ${copy.hideTracker ? '' : applicationTracker(status, accent)}
      ${applicationStatusCard(accent, { label: copy.label, line: statusLine })}
      ${slot ? interviewCard(accent, slot) : ''}
      ${applicationDetails(rows)}
      ${steps ? stepsPanel(accent, { title: copy.stepsTitle, steps }) : openRolesPanel()}
      ${paragraph(
        `<span style="display:inline-block;margin-top:24px">Thank you for your interest in
         <b style="color:${C.brand600}">${escapeHtml(brand.siteName)}</b>.</span>`
      )}
      ${hrContactCard(contact)}`,
    // The HR card already offers the address the footer would repeat.
    hideSupport: true,
  });
};

/**
 * Waits for a send, but only for as long as a person is willing to sit in front
 * of a spinner for it.
 *
 * Composing and delivering a message costs a TLS handshake, an AUTH exchange and
 * a few hundred KB of artwork — a second or two on a real machine, and rather
 * more on a throttled one, all of it spent while the request that triggered it
 * is still open. Past the deadline the caller is handed `null` and answers the
 * browser; the send itself is untouched and carries on to completion in the
 * background, so the mail still arrives. The rejection is swallowed here because
 * every caller's `.catch()` has already stopped listening by then.
 *
 * The three-way answer is the point. `false` means the provider actually refused
 * the message and nothing is coming, which is worth telling the user about;
 * `null` means only that it is taking a while, which is not — a caller that
 * treated the two alike would fail a registration whose code is seconds behind it.
 *
 * @param {Promise<boolean>} sending  A send in flight — call the sender first.
 * @param {number} [ms]  How long to wait. Defaults to the configured deadline.
 * @returns {Promise<boolean|null>} true sent, false refused, null still going.
 */
function within(sending, ms = env.mail.requestDeadlineMs) {
  const settled = Promise.resolve(sending).catch((err) => {
    logger.error(`Background mail send failed: ${err.message}`);
    return false;
  });

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    // `unref` so a pending deadline cannot hold the process open during shutdown.
    timer.unref?.();
    settled.then((sent) => {
      clearTimeout(timer);
      resolve(sent);
    });
  });
}

module.exports = {
  sendMail,
  within,
  // The invoice PDF is branded from the same Organization settings and the same
  // cache, so a rebrand lands on the mail and the invoice in the same instant.
  getBranding,
  clearBrandingCache,
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
  sendAccountLockedEmail,
  sendOrderConfirmationEmail,
  sendOrderStatusEmail,
  sendInquiryAckEmail,
  sendInquiryReplyEmail,
  sendApplicationAckEmail,
  sendApplicationStatusEmail,
};
