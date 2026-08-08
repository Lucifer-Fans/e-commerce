/**
 * User-agent parsing, in-house.
 *
 * Deliberately dependency-free — the same reasoning as the inline icon set on the
 * front-end. A UA library carries a database of thousands of feature phones and
 * crawlers we will never show on a "Manage devices" screen; what that screen needs is
 * a browser, an OS and a device the account holder recognises as theirs.
 *
 * Order matters everywhere below: every Chromium browser claims to be Chrome, Chrome
 * claims to be Safari, and Safari claims to be Mozilla. The first match wins, so the
 * most specific token is always tested first.
 */

const BROWSERS = [
  // Chromium forks, all of which also carry "Chrome/…" later in the string.
  { name: 'Edge', re: /Edg(?:e|A|iOS)?\/([\d.]+)/ },
  { name: 'Opera', re: /(?:OPR|OPiOS|Opera)\/([\d.]+)/ },
  { name: 'Samsung Internet', re: /SamsungBrowser\/([\d.]+)/ },
  { name: 'Vivaldi', re: /Vivaldi\/([\d.]+)/ },
  { name: 'Brave', re: /Brave\/([\d.]+)/ },
  { name: 'Yandex Browser', re: /YaBrowser\/([\d.]+)/ },
  { name: 'UC Browser', re: /UCBrowser\/([\d.]+)/ },
  // iOS wrappers: every browser on iOS is WebKit wearing a different badge.
  { name: 'Chrome', re: /CriOS\/([\d.]+)/ },
  { name: 'Firefox', re: /(?:FxiOS|Firefox)\/([\d.]+)/ },
  { name: 'Chrome', re: /Chrome\/([\d.]+)/ },
  { name: 'Safari', re: /Version\/([\d.]+).*Safari/ },
  { name: 'Internet Explorer', re: /(?:MSIE |rv:)([\d.]+)\)?.*Trident/ },
  // Non-browser clients still deserve an honest label rather than "Unknown".
  { name: 'Postman', re: /PostmanRuntime\/([\d.]+)/ },
  { name: 'curl', re: /curl\/([\d.]+)/ },
];

const OPERATING_SYSTEMS = [
  // Android must precede Linux — every Android UA also says "Linux".
  { name: 'Android', re: /Android\s([\d.]+)/ },
  { name: 'iPadOS', re: /iPad.*?OS\s([\d_]+)/ },
  { name: 'iOS', re: /(?:iPhone|iPod).*?OS\s([\d_]+)/ },
  {
    name: 'Windows',
    re: /Windows NT\s([\d.]+)/,
    // Microsoft froze the UA at "Windows NT 10.0" for 10 and 11 alike, so the
    // marketing name is as far as this can honestly go.
    version: (raw) =>
      ({ '10.0': '10/11', 6.3: '8.1', 6.2: '8', 6.1: '7' })[raw] || raw,
  },
  { name: 'macOS', re: /Mac OS X\s([\d_.]+)/ },
  { name: 'Chrome OS', re: /CrOS\s\S+\s([\d.]+)/ },
  { name: 'Ubuntu', re: /Ubuntu/ },
  { name: 'Linux', re: /Linux/ },
];

/**
 * Marketing names for the device itself. Apple hides the model behind a generic
 * "iPhone", so those stay generic; Android vendors put the model in the UA, which is
 * where "Samsung Galaxy S21 FE 5G" style labels come from.
 */
const VENDORS = [
  // `model` given here is already the full product name, so it is shown as-is —
  // "iPhone", not "Apple iPhone", which is how Apple and everyone else writes it.
  { vendor: 'Apple', re: /\biPhone\b/, model: 'iPhone', standalone: true },
  { vendor: 'Apple', re: /\biPad\b/, model: 'iPad', standalone: true },
  { vendor: 'Apple', re: /\bMacintosh\b/, model: 'Mac', standalone: true },
  { vendor: 'Samsung', re: /\bSM-[A-Z0-9]+\b/i },
  { vendor: 'Xiaomi', re: /\b(?:Redmi|POCO|Mi)\s[\w\s]+?(?=\sBuild|\)|;)/i },
  { vendor: 'OnePlus', re: /\b(?:ONEPLUS|OnePlus)\s?[\w-]*/ },
  { vendor: 'Realme', re: /\bRMX\d+\b/i },
  { vendor: 'Oppo', re: /\bCPH\d+\b/i },
  { vendor: 'Vivo', re: /\bvivo\s[\w-]+/i },
  { vendor: 'Motorola', re: /\bmoto\s[\w\s]+?(?=\sBuild|\)|;)/i },
  { vendor: 'Google', re: /\bPixel\s?[\w\s]*?(?=\sBuild|\)|;)/i },
  { vendor: 'Nokia', re: /\bNokia\s?[\w\s]*?(?=\sBuild|\)|;)/i },
];

const TABLET = /\biPad\b|\bTablet\b|\bPlayBook\b|Silk|(?:Android(?!.*\bMobile\b))/i;
const MOBILE = /\bMobi(?:le)?\b|\biPhone\b|\biPod\b|\bAndroid\b|\bWindows Phone\b|\bBlackBerry\b/i;
const BOT = /bot|crawler|spider|crawling|headless|monitor|preview|fetch/i;

const clean = (value) => (value ? String(value).trim().replace(/\s+/g, ' ') : '');

/** Two significant parts is what people recognise; the build number is noise. */
const shortVersion = (raw) => {
  if (!raw) return '';
  const parts = String(raw).replace(/_/g, '.').split('.');
  return parts.slice(0, 2).join('.');
};

function matchBrowser(ua) {
  for (const { name, re } of BROWSERS) {
    const hit = ua.match(re);
    if (hit) return { name, version: shortVersion(hit[1]) };
  }
  return { name: '', version: '' };
}

function matchOs(ua) {
  for (const { name, re, version } of OPERATING_SYSTEMS) {
    const hit = ua.match(re);
    if (!hit) continue;
    const raw = shortVersion(hit[1]);
    return { name, version: version ? version(raw) : raw };
  }
  return { name: '', version: '' };
}

function matchDevice(ua) {
  for (const { vendor, re, model, standalone } of VENDORS) {
    const hit = ua.match(re);
    if (hit) return { vendor, model: clean(model || hit[0]), standalone: Boolean(standalone) };
  }
  return { vendor: '', model: '', standalone: false };
}

/**
 * Turns a raw UA header into the fields the devices screen renders.
 *
 * Every field degrades to a readable fallback rather than an empty cell — a session
 * the user cannot identify is a session they cannot safely revoke.
 *
 * @param {string} [userAgent]
 * @returns {{ name: string, type: 'mobile'|'tablet'|'desktop'|'bot'|'unknown',
 *   vendor: string, model: string, browser: { name: string, version: string },
 *   os: { name: string, version: string } }}
 */
function parseUserAgent(userAgent) {
  const ua = clean(userAgent);

  if (!ua) {
    return {
      name: 'Unknown device',
      type: 'unknown',
      vendor: '',
      model: '',
      browser: { name: '', version: '' },
      os: { name: '', version: '' },
    };
  }

  const browser = matchBrowser(ua);
  const os = matchOs(ua);
  const { vendor, model, standalone } = matchDevice(ua);

  let type = 'desktop';
  if (BOT.test(ua)) type = 'bot';
  else if (TABLET.test(ua)) type = 'tablet';
  else if (MOBILE.test(ua)) type = 'mobile';

  return {
    name: deviceName({ type, vendor, model, standalone, os, browser }),
    type,
    vendor,
    model,
    browser,
    os,
  };
}

/**
 * The headline on the card, in the order a person would say it out loud:
 * the hardware if the UA named it ("Samsung SM-G990E"), otherwise the platform
 * ("Windows PC"), and only then the browser as a last resort.
 */
function deviceName({ type, vendor, model, standalone, os, browser }) {
  if (model && !standalone && vendor && !model.toLowerCase().startsWith(vendor.toLowerCase())) {
    return `${vendor} ${model}`;
  }
  if (model) return model;

  if (os.name) {
    const suffix = { desktop: 'PC', tablet: 'Tablet', mobile: 'Phone' }[type];
    // "Windows PC" reads naturally; "Android Phone" does too. "macOS PC" does not,
    // but a Mac always matches the vendor branch above, so it never reaches here.
    return suffix && os.name !== 'macOS' ? `${os.name} ${suffix}` : os.name;
  }

  return browser.name || 'Unknown device';
}

module.exports = { parseUserAgent };
