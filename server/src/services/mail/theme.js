/**
 * The design tokens the email templates draw with, and the two helpers that turn
 * a filename into an <img>.
 *
 * Everything here is data plus two one-liners — no template in this file, which
 * is the line the split was drawn on.
 */

const { cidFor } = require('./assets');
const { escapeHtml } = require('./format');

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
 * an inline `cid:` attachment (see mail/assets.js). It has to be a real image
 * file: inline SVG is stripped by Gmail and most webmail, and a data: URI fares
 * no better, so an <img> is the only mark that survives the trip. Every PNG is
 * cut at 2x and scaled down by the width/height attributes below, which Outlook
 * needs stated explicitly anyway.
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

module.exports = { C, FONT, SOCIAL_ICONS, asset, image };
