/**
 * Formatting — mirrors client/src/utils/format.js so an email and the
 * order page it links to never disagree on a price or a date.
 *
 * Pure functions with no dependencies, which is what makes them worth having
 * separately: they are the part of the mail layer that can be reasoned about, and
 * changed, without knowing anything about email at all.
 */

/** Escapes visitor-supplied text before it is interpolated into an HTML email. */
const escapeHtml = (value = '') =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );

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

module.exports = {
  escapeHtml,
  money,
  moneyText,
  dateTime,
  shortDate,
  appointment,
  titleCase,
  thumb,
};
