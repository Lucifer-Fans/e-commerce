/**
 * Email artwork, and how a message carries it.
 *
 * Split out of mail.service so both the transport (which attaches the files) and
 * the theme (which references them from the HTML) can reach `cidFor` without
 * either having to require the other.
 */

const fs = require('fs');
const path = require('path');

const ASSET_DIR = path.join(__dirname, '../../assets/email');

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
function inlineAttachments(html = '') {
  const wanted = new Set();
  for (const match of html.matchAll(/src="cid:([^"]+)"/g)) wanted.add(match[1]);
  if (!wanted.size) return [];

  return fs
    .readdirSync(ASSET_DIR)
    .filter((file) => file.endsWith('.png') && wanted.has(cidFor(file)))
    .map((file) => ({
      filename: file,
      path: path.join(ASSET_DIR, file),
      cid: cidFor(file),
      contentDisposition: 'inline',
    }));
}

module.exports = { ASSET_DIR, cidFor, inlineAttachments };
