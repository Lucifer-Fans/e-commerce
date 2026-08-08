/**
 * One source of truth for "where is the store" — the Contact page map, the footer's
 * location link and anything else that needs it all read the same admin settings.
 *
 * The admin pastes a Google Maps *embed* URL, which is only valid inside an <iframe>.
 * Its `pb=` payload carries the pinned coordinates as `!2d<lng>!3d<lat>`, so a real
 * "open in Maps" link can be derived from it instead of re-geocoding the address.
 */

const COORDS_RE = /!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/;

/** Embed URL for the <iframe> — the admin's own link, else a lookup of the address. */
export function mapEmbedSrc(general = {}) {
  if (general.mapEmbedUrl) return general.mapEmbedUrl;
  if (!general.companyAddress) return '';
  return `https://www.google.com/maps?q=${encodeURIComponent(general.companyAddress)}&output=embed`;
}

/** Link that opens the same pin in the Maps app / site. */
export function mapPlaceUrl(general = {}) {
  const coords = general.mapEmbedUrl?.match(COORDS_RE);
  const query = coords
    ? `${coords[2]},${coords[1]}` // pb= stores lng first, and Maps wants lat,lng
    : general.companyAddress;

  if (!query) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
