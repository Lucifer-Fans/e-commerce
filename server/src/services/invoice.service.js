const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const env = require('../config/env');
const logger = require('../utils/logger');
const { getBranding } = require('./mail.service');

/**
 * The tax invoice, drawn straight into the HTTP response — nothing is written to
 * disk and nothing is cached, so an invoice reprinted a year later is rebuilt
 * from the order document that has always been its only source of truth.
 *
 * Artwork is shared with the transactional emails (server/src/assets/email): the
 * shield on this page and the shield in the order-confirmation mail have to be
 * the identical mark, and cutting a second set for the PDF is how the two drift
 * apart. Type is the four PDF base fonts — Helvetica for the document, Times for
 * the one line of display serif in the footer — because a bundled webfont would
 * be a megabyte on every download for a page that reads as well without it.
 */

const ASSET_DIR = path.join(__dirname, '../assets/email');

/* ------------------------------------------------------------------ *
 * Palette — the tailwind.config.js ramps, as hex. A PDF cannot read a
 * CSS variable, so the values are duplicated here the same way
 * mail.service.js duplicates them, and for the same reason.
 * ------------------------------------------------------------------ */
const P = {
  ink900: '#0f172a',
  ink700: '#334155',
  ink600: '#475569',
  ink500: '#64748b',
  ink400: '#94a3b8',
  ink200: '#e2e8f0',
  ink100: '#f1f5f9',
  ink50: '#f8fafc',
  brand600: '#2563eb',
  // tailwind `accent` — the invoice is the one surface that leads with navy and
  // gold rather than navy and blue. Blue stays on the glyphs, which are shared
  // with the mails; the gold is this document's own accent.
  accent: '#f59e0b',
  accentDark: '#d97706',
  accent50: '#fffbeb',
  accent100: '#fef3c7',
  green50: '#f0fdf4',
  green700: '#15803d',
  red50: '#fef2f2',
  red700: '#b91c1c',
  white: '#ffffff',
};

/* ------------------------------------------------------------------ *
 * Geometry — A4 at 72dpi is 595.28 x 841.89pt.
 * ------------------------------------------------------------------ */
const FRAME = { x: 24, y: 24, w: 547.28, h: 793.89 };
const LEFT = 48;
const RIGHT = 547;
const WIDTH = RIGHT - LEFT;

/** The last line of ink the page allows — 12pt inside the frame's bottom edge. */
const BOTTOM = 810;
/** Continuation pages resume below the frame's top edge. */
const PAGE_TOP = 60;
/** Heights of the two closing blocks, which are laid out as units. */
const TRUST_H = 48;
const FOOTER_H = 74;
/**
 * Where a flowing block — a row, or the whole summary — has to stop and take a
 * new page. It is the foot of the page, not the point where the closing blocks
 * would like to begin: content earns the page first, and the trust row and
 * footer fit themselves in underneath or move on. Reserving their space up here
 * instead is what pushed a summary that had 90pt of paper under it onto a sheet
 * of its own, and left the first page half empty to pay for it.
 */
const CONTENT_BOTTOM = BOTTOM - 40;
/** Breathing room between the last of the content and the closing blocks. */
const CLOSING_GAP = 22;
/** …squeezed to this when it is the difference between one page and two. */
const CLOSING_GAP_MIN = 12;

const TAGLINE = 'Quality Products, Premium Experience';

/**
 * The four promises the order-confirmation mail closes with, in its order and
 * with its glyphs — the invoice is read in the same moment, and answering the
 * same four questions twice in two visual languages is what makes a suite of
 * documents feel assembled rather than designed.
 */
const TRUST = [
  {
    icon: 'shield-check-brand.png',
    title: '100% Genuine Products',
    text: 'Sourced directly from trusted brands.',
  },
  { icon: 'order-return.png', title: 'Easy Returns', text: 'Hassle-free returns within 7 days.' },
  { icon: 'job-headset.png', title: 'Customer Support', text: "We're here to help you anytime." },
  { icon: 'lock-brand.png', title: 'Secure Payments', text: 'Your payments are safe and encrypted.' },
];

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

/**
 * "5th August 2026". Spelled out rather than 5/8/2026, because a numeric date on
 * a document that crosses borders is ambiguous by exactly one month — and this
 * is the date a return window or a warranty is counted from.
 */
const ORDINALS = ['th', 'st', 'nd', 'rd'];
const longDate = (value) => {
  const at = new Date(value);
  const day = at.getDate();
  // 11th, 12th and 13th break the last-digit rule and are the only ones that do.
  const suffix = day > 3 && day < 21 ? 'th' : ORDINALS[day % 10] || 'th';
  return `${day}${suffix} ${at.toLocaleString('en-IN', { month: 'long' })} ${at.getFullYear()}`;
};

/** "Rs. 8,698.72" — the lakh/crore grouping, since every price here is in INR. */
const money = (n) =>
  `Rs. ${Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const titleCase = (value = '') =>
  String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const under100 = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);

/** Indian grouping — crore, lakh, thousand, hundred — not the short scale. */
function inWords(n) {
  if (!n) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1e3);
  const hundred = Math.floor((n % 1e3) / 100);
  const rest = n % 100;

  if (crore) parts.push(`${inWords(crore)} Crore`);
  if (lakh) parts.push(`${under100(lakh)} Lakh`);
  if (thousand) parts.push(`${under100(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(under100(rest));
  return parts.join(' ');
}

/**
 * The amount spelled out, which is what makes the figure above it hard to alter
 * after the fact — the reason every tax invoice carries the line.
 */
function amountInWords(amount) {
  const rupees = Math.floor(amount);
  // Round the fraction, not the product: 0.1 + 0.2 in float arithmetic is 30.000000000000004 paise.
  const paise = Math.round((amount - rupees) * 100);
  const tail = paise ? ` and ${under100(paise)} Paise` : '';
  return `Rupees ${inWords(rupees)}${tail} Only`;
}

/* ------------------------------------------------------------------ *
 * Images
 * ------------------------------------------------------------------ */

/**
 * PDFKit reads JPEG and PNG and nothing else, so the Cloudinary transform asks
 * for `f_jpg` rather than the `f_auto` the storefront uses — auto would hand us
 * a WebP for any modern browser, and this is not a browser.
 */
const thumb = (url, size = 160) =>
  !url || !url.includes('/upload/')
    ? url
    : url.replace('/upload/', `/upload/w_${size},h_${size},c_fill,q_auto,f_jpg/`);

/**
 * Remote artwork — the uploaded logo and the product shots — has to be resolved
 * *before* the document starts streaming, because once a byte of PDF is on the
 * wire the response can no longer become an error. Everything here degrades to
 * null and the page draws a placeholder in its place.
 */
async function fetchImage(url, timeoutMs = 4000) {
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    if (!/image\/(jpeg|jpg|png)/i.test(res.headers.get('content-type') || '')) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    logger.warn(`Invoice image could not be fetched (${url}): ${err.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** A bundled glyph. Missing artwork must never take the download down with it. */
function glyph(doc, file, x, y, size) {
  const full = path.join(ASSET_DIR, file);
  if (!fs.existsSync(full)) return;
  try {
    doc.image(full, x, y, { width: size, height: size });
  } catch (err) {
    logger.warn(`Invoice glyph ${file} could not be drawn: ${err.message}`);
  }
}

/** Scales a photo to cover its box and clips the overflow to a rounded corner. */
function cover(doc, buffer, x, y, size, radius) {
  doc.save();
  doc.roundedRect(x, y, size, size, radius).clip();
  try {
    doc.image(buffer, x, y, { cover: [size, size], align: 'center', valign: 'center' });
  } catch (err) {
    logger.warn(`Invoice thumbnail could not be drawn: ${err.message}`);
  }
  doc.restore();
}

/* ------------------------------------------------------------------ *
 * Drawing primitives
 * ------------------------------------------------------------------ */

/** The card every page is printed inside. Redrawn per page by `pageAdded`. */
function drawFrame(doc) {
  doc
    .save()
    .lineWidth(0.8)
    .roundedRect(FRAME.x, FRAME.y, FRAME.w, FRAME.h, 10)
    .strokeColor(P.ink200)
    .stroke()
    .restore();
}

const rule = (doc, y, color = P.ink200, width = 0.8, x0 = LEFT, x1 = RIGHT) =>
  doc.save().lineWidth(width).moveTo(x0, y).lineTo(x1, y).strokeColor(color).stroke().restore();

const dashedRule = (doc, x0, y0, x1, y1) =>
  doc
    .save()
    .lineWidth(0.7)
    .dash(2, { space: 2.5 })
    .moveTo(x0, y0)
    .lineTo(x1, y1)
    .strokeColor(P.ink200)
    .stroke()
    .undash()
    .restore();

/** A glyph on a filled disc — the meta card's rows and the trust row's marks. */
function disc(doc, file, cx, cy, radius, fill, glyphSize) {
  doc.save().circle(cx, cy, radius).fill(fill).restore();
  glyph(doc, file, cx - glyphSize / 2, cy - glyphSize / 2, glyphSize);
}

/** A status chip: text on a tinted pill, sized to the text it holds. */
function pill(doc, text, x, y, { bg, fg }) {
  doc.font('Helvetica-Bold').fontSize(8.5);
  const w = doc.widthOfString(text) + 18;
  doc.save().roundedRect(x, y - 4.5, w, 17, 8.5).fill(bg).restore();
  doc.fillColor(fg).text(text, x + 9, y, { lineBreak: false });
  return w;
}

/** The gold heart between the footer's two rules — one path, no artwork. */
function heart(doc, cx, cy, s) {
  doc
    .save()
    .moveTo(cx, cy + s * 0.75)
    .bezierCurveTo(cx - s * 1.25, cy - s * 0.2, cx - s * 0.55, cy - s * 1.0, cx, cy - s * 0.2)
    .bezierCurveTo(cx + s * 0.55, cy - s * 1.0, cx + s * 1.25, cy - s * 0.2, cx, cy + s * 0.75)
    .fill(P.accentDark)
    .restore();
}


/* ------------------------------------------------------------------ *
 * Sections
 *
 * Every block is set tight enough that a three-line order still closes
 * on one page: a shopper who opens an invoice and finds the totals on a
 * second sheet reads it as an error, and half a page of white above the
 * footer as an unfinished document.
 * ------------------------------------------------------------------ */

/**
 * Masthead: the mark, the name split across navy and gold, and the registered
 * address. The address stands where the site URL and the support inbox used to:
 * a tax invoice has to say where the seller is, and both of those are repeated
 * in the footer anyway.
 */
function header(doc, brand, logo) {
  const y = 30;

  if (logo) {
    // An uploaded logo carries its own colours, so it gets a white tile with a
    // hairline rather than the navy one the bundled stand-in is cut for.
    doc.save().roundedRect(LEFT, y, 42, 42, 12).lineWidth(0.8).fillAndStroke(P.white, P.ink200).restore();
    doc.save().roundedRect(LEFT, y, 42, 42, 12).clip();
    try {
      doc.image(logo, LEFT + 5, y + 5, { fit: [32, 32], align: 'center', valign: 'center' });
    } catch (err) {
      logger.warn(`Invoice logo could not be drawn: ${err.message}`);
    }
    doc.restore();
  } else {
    doc.save().roundedRect(LEFT, y, 42, 42, 12).fill(P.ink900).restore();
    glyph(doc, 'brand-shield-lock.png', LEFT + 10, y + 10, 22);
  }

  const [first, ...rest] = String(brand.siteName || env.appName).split(' ');
  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor(P.ink900)
    .text(first, 100, y + 5, { continued: rest.length > 0, lineBreak: false });
  if (rest.length) doc.fillColor(P.accentDark).text(` ${rest.join(' ')}`, { lineBreak: false });

  doc.font('Helvetica').fontSize(8).fillColor(P.ink500).text(TAGLINE, 100, y + 27, { lineBreak: false });

  if (brand.address) {
    glyph(doc, 'step-location.png', 335, y + 3, 11);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(P.ink500)
      .text(brand.address, 351, y + 2, { width: RIGHT - 351, lineGap: 2 });
  }

  // The one gold rule on the page, and the widest — it is what separates the
  // letterhead from the document proper. It sits 12pt under the mark, close
  // enough to read as that block's own underline rather than as a band of empty
  // paper between two unrelated things.
  rule(doc, 84, P.accentDark, 1.2);
}

/** "TAX INVOICE" against the card that carries the three numbers it is filed by. */
function titleBlock(doc, order) {
  doc
    .font('Helvetica-Bold')
    .fontSize(25)
    .fillColor(P.ink900)
    .text('TAX INVOICE', LEFT, 96, { characterSpacing: 0.4, lineBreak: false });
  // 8pt under the baseline, not under the line box: PDFKit's `y` is the top of
  // the line, and at 25pt the descender space below the caps is most of a
  // centimetre — measuring from it left the rule adrift from the word it marks.
  doc.save().roundedRect(LEFT, 122, 42, 3, 1.5).fill(P.accentDark).restore();

  const card = { x: 305, y: 92, w: 242, h: 84 };
  doc
    .save()
    .roundedRect(card.x, card.y, card.w, card.h, 10)
    .lineWidth(0.8)
    .fillAndStroke(P.ink50, P.ink200)
    .restore();

  const rows = [
    ['step-clipboard-white.png', 'Invoice No.', order.invoiceNumber || '—'],
    ['step-package-white.png', 'Order No.', order.orderNumber || '—'],
    ['inquiry-calendar-white.png', 'Date', longDate(order.createdAt)],
  ];

  rows.forEach(([icon, label, value], i) => {
    const y = card.y + 11 + i * 26;
    disc(doc, icon, card.x + 17, y + 8, 9, P.ink900, 10);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(P.ink900).text(label, card.x + 35, y + 5, {
      width: 70,
      lineBreak: false,
    });
    doc.font('Helvetica').fillColor(P.ink400).text(':', card.x + 107, y + 5, { lineBreak: false });
    doc.fontSize(8.5).fillColor(P.ink700).text(value, card.x + 118, y + 4.5, {
      width: card.w - 128,
      lineBreak: false,
      ellipsis: true,
    });
  });
}

const PAYMENT_TINTS = {
  paid: { bg: P.green50, fg: P.green700 },
  pending: { bg: P.accent50, fg: P.accentDark },
  failed: { bg: P.red50, fg: P.red700 },
  // Money still owed back wears the same amber as money still owed — both are
  // outstanding; only a completed refund goes quiet.
  refund_pending: { bg: P.accent50, fg: P.accentDark },
  refunded: { bg: P.ink100, fg: P.ink600 },
};

/**
 * Who it went to, on the left; how it was paid for, on the right.
 *
 * The right column carries the payment facts and nothing else. Where an order
 * has got to is live information — it is "confirmed" the day this is printed and
 * "delivered" a week later — and an invoice is a fixed record of a transaction,
 * so it would be stale on the copy in the shopper's downloads folder. The
 * storefront's order page tracks it, and tracks it correctly.
 */
function partiesCard(doc, order) {
  const card = { x: LEFT, y: 194, w: WIDTH, h: 88 };
  doc
    .save()
    .roundedRect(card.x, card.y, card.w, card.h, 10)
    .lineWidth(0.8)
    .fillAndStroke(P.white, P.ink200)
    .restore();

  // The ribbon overlaps the card's top edge, tip first, so the label reads as
  // attached to the panel rather than floating above it.
  doc
    .save()
    .moveTo(LEFT, 182)
    .lineTo(LEFT + 166, 182)
    .lineTo(LEFT + 179, 193)
    .lineTo(LEFT + 166, 204)
    .lineTo(LEFT, 204)
    .fill(P.ink900)
    .restore();
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(P.white)
    .text('BILLED & SHIPPED TO', LEFT + 15, 189, { characterSpacing: 0.7, lineBreak: false });

  /* Left — the address the parcel was shipped to, which is also the billing name. */
  const a = order.shippingAddress;
  disc(doc, 'inquiry-user-accent.png', 79, 228, 13, P.accent50, 13);

  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor(P.ink900)
    .text(a.fullName, 99, 222, { width: 180, lineBreak: false, ellipsis: true });

  const lines = [
    [a.addressLine1, a.addressLine2, a.landmark].filter(Boolean).join(', '),
    `${a.city}, ${a.state} - ${a.pincode}`,
    `${a.country || 'India'} · ${a.phone}`,
  ];
  doc.font('Helvetica').fontSize(8.5).fillColor(P.ink600);
  lines.forEach((line, i) => {
    doc.text(line, 64, 245 + i * 12.5, { width: 226, lineBreak: false, ellipsis: true });
  });

  dashedRule(doc, 300, 206, 300, 270);

  /* Right — the payment facts a shopper checks an invoice for. */
  const status = order.paymentStatus || 'pending';
  const rows = [
    {
      icon: 'inquiry-bag.png',
      label: 'Payment Method',
      value: order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online (Razorpay)',
    },
    {
      icon: 'shield-check-brand.png',
      label: 'Payment Status',
      value: titleCase(status),
      tint: PAYMENT_TINTS[status] || PAYMENT_TINTS.refunded,
    },
  ];

  rows.forEach((row, i) => {
    const y = 210 + i * 32;
    doc.save().roundedRect(318, y, 24, 24, 7).fill(P.ink50).restore();
    glyph(doc, row.icon, 323.5, y + 5.5, 13);

    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(P.ink900)
      .text(row.label, 352, y + 8, { width: 82, lineBreak: false });
    doc.font('Helvetica').fillColor(P.ink400).text(':', 440, y + 8, { lineBreak: false });

    if (row.tint) pill(doc, row.value, 452, y + 8, row.tint);
    else
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(P.ink700)
        .text(row.value, 452, y + 8, { width: 79, lineBreak: false, ellipsis: true });

    if (i < rows.length - 1) rule(doc, y + 28, P.ink100, 0.7, 318, 531);
  });
}

/** Where the item table starts on the first page, under the parties card. */
const TABLE_TOP = 296;

const COLS = {
  thumb: 62,
  text: 110,
  textWidth: 214,
  qty: 332,
  qtyWidth: 44,
  rate: 384,
  rateWidth: 78,
  amount: 462,
  amountWidth: 69,
};

/** The navy band above the line items — repeated on every page the table spills onto. */
function tableHead(doc, y) {
  doc.save().roundedRect(LEFT, y, WIDTH, 26, 7).fill(P.ink900).restore();
  doc.font('Helvetica-Bold').fontSize(8).fillColor(P.white);
  const opts = { characterSpacing: 0.6, lineBreak: false };
  doc.text('ITEM', COLS.thumb, y + 9, opts);
  doc.text('QTY', COLS.qty, y + 9, { ...opts, width: COLS.qtyWidth, align: 'center' });
  doc.text('RATE', COLS.rate, y + 9, { ...opts, width: COLS.rateWidth, align: 'right' });
  doc.text('AMOUNT', COLS.amount, y + 9, { ...opts, width: COLS.amountWidth, align: 'right' });
  return y + 26;
}

/**
 * One row per shipped SKU. The line names the variant *and* its SKU: the invoice
 * is the document a return or a warranty claim is checked against, and "Black ·
 * M" is what tells that claim apart from the other size in the same order.
 *
 * Both sit on one line under the name rather than stacking, which is what keeps
 * a row to 46pt — the difference between three items fitting on this page and
 * the totals being pushed onto a second one.
 */
function itemsTable(doc, order, shots) {
  let sectionTop = TABLE_TOP;
  let y = tableHead(doc, TABLE_TOP);

  order.items.forEach((item, i) => {
    const meta = [item.variantLabel && `(${item.variantLabel})`, item.variantSku && `SKU: ${item.variantSku}`]
      .filter(Boolean)
      .join('  ·  ');

    doc.font('Helvetica-Bold').fontSize(8.5);
    // Capped at two lines: a product name is denormalised onto the order and can
    // be any length an admin typed, and one row is not allowed to grow taller
    // than the page it has to break against.
    const titleHeight = Math.min(doc.heightOfString(item.name, { width: COLS.textWidth }), 22);
    const height = Math.max(45, titleHeight + (meta ? 11 : 0) + 17);

    if (y + height > CONTENT_BOTTOM) {
      // Close the table's border over what has been drawn, then carry the head
      // onto the next page — a bare continuation of rows reads as a new table.
      tableBorder(doc, sectionTop, y);
      doc.addPage();
      sectionTop = PAGE_TOP;
      y = tableHead(doc, PAGE_TOP);
    }

    const shot = shots[i];
    if (shot) cover(doc, shot, COLS.thumb, y + 4, 38, 8);
    else {
      doc.save().roundedRect(COLS.thumb, y + 4, 38, 38, 8).fill(P.ink50).restore();
      glyph(doc, 'inquiry-bag.png', COLS.thumb + 11, y + 14, 16);
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(P.ink900)
      .text(item.name, COLS.text, y + 11, { width: COLS.textWidth, height: 22, ellipsis: true });

    if (meta) {
      doc.font('Helvetica').fontSize(7.5).fillColor(P.ink500).text(meta, COLS.text, y + 12 + titleHeight, {
        width: COLS.textWidth,
        lineBreak: false,
        ellipsis: true,
      });
    }

    doc.font('Helvetica').fontSize(9).fillColor(P.ink700);
    doc.text(String(item.quantity), COLS.qty, y + 14, { width: COLS.qtyWidth, align: 'center' });
    doc.text(money(item.finalPrice), COLS.rate, y + 14, { width: COLS.rateWidth, align: 'right' });
    doc
      .font('Helvetica-Bold')
      .fillColor(P.ink900)
      .text(money(item.lineTotal), COLS.amount, y + 14, { width: COLS.amountWidth, align: 'right' });

    y += height;
    if (i < order.items.length - 1) rule(doc, y, P.ink100, 0.7, LEFT + 8, RIGHT - 8);
  });

  tableBorder(doc, sectionTop, y);
  return y;
}

/**
 * The table's own outline, drawn last: the head is a filled navy block, so the
 * border only has to close the body beneath it — and the body's height is not
 * known until the rows have been laid out.
 */
function tableBorder(doc, headTop, bottom) {
  doc
    .save()
    .lineWidth(0.8)
    .roundedRect(LEFT, headTop, WIDTH, bottom - headTop, 7)
    .strokeColor(P.ink200)
    .stroke()
    .restore();
}

/**
 * The summary column — the storefront's own Price Details panel, line for line,
 * so the breakdown a shopper approved at checkout is the breakdown they are
 * invoiced from.
 *
 * It has to *add up*, which decides the first row. The discounted selling price
 * is the price: `pricing.subtotal` is what the item table charges, already net
 * of the product discount, so the column opens there and the coupon is the only
 * thing taken off it — subtotal − coupon + delivery = the grand total, to the
 * paisa. `pricing.discount` is the gap between MRP and that subtotal, a saving
 * banked before the order was placed; printing it as a row would invite the
 * reader to subtract a number that was subtracted already, so it appears once,
 * below the total, as the saving it is.
 *
 * There is no tax line, by decision. `pricing.service.js` charges none, so for
 * anything this system prices the column closes on its own.
 */
function totals(doc, order, y) {
  const p = order.pricing;
  const x = 292;
  const w = RIGHT - x;
  const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
  // Orders placed before `mrpTotal` was stored still carry the gap it was derived from.
  const mrpTotal = p.mrpTotal || p.subtotal + (p.discount || 0);
  const savings = (p.discount || 0) + (p.couponDiscount || 0);

  const rows = [
    { label: `Subtotal (${count} ${count === 1 ? 'item' : 'items'})`, value: money(p.subtotal) },
    p.couponDiscount
      ? { label: `Coupon (${p.couponCode})`, value: `- ${money(p.couponDiscount)}`, tone: P.green700 }
      : null,
    p.shipping
      ? { label: 'Delivery Charges', value: money(p.shipping) }
      : { label: 'Delivery Charges', value: 'FREE', tone: P.green700 },
  ].filter(Boolean);

  // The summary moves as one block — a grand total orphaned from its breakdown
  // is the one break nobody accepts — but it moves only when the paper under the
  // table genuinely cannot hold it. Not when the footer wanted that space, and
  // not to keep a bottom margin the rows are given: it may sit flush on the last
  // line the page allows, and let the closing blocks find their own room.
  const height = rows.length * 15 + 74 + (savings > 0 ? 14 : 0);
  if (y + 8 + height > BOTTOM) {
    doc.addPage();
    y = PAGE_TOP;
  } else {
    y += 8;
  }

  rows.forEach((row, i) => {
    const ry = y + i * 15;
    doc.font('Helvetica').fontSize(9).fillColor(P.ink600);
    doc.text(row.label, x + 14, ry, { width: 120, lineBreak: false, ellipsis: true });
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(row.tone || P.ink900)
      .text(row.value, COLS.amount, ry, { width: COLS.amountWidth, align: 'right' });
  });

  const barY = y + rows.length * 15 + 6;
  doc.save().roundedRect(x, barY, w, 28, 7).fill(P.ink900).restore();
  doc
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .fillColor(P.white)
    .text('GRAND TOTAL', x + 14, barY + 9.5, { characterSpacing: 0.6, lineBreak: false });
  doc
    .fontSize(11.5)
    .text(money(p.total), COLS.amount - 24, barY + 8, { width: COLS.amountWidth + 24, align: 'right' });

  doc
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .fillColor(P.ink900)
    .text('Amount in Words:', x + 14, barY + 36, { lineBreak: false });
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(P.ink600)
    .text(amountInWords(p.total), x + 14, barY + 46, { width: w - 28 });

  // The MRP and the two discounts, stated once, after the sum they are not part of.
  let end = Math.max(doc.y, barY + 56);
  if (savings > 0) {
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor(P.green700)
      .text(`You saved ${money(savings)} on this order (MRP ${money(mrpTotal)})`, x + 14, end + 4, {
        width: w - 28,
      });
    end = doc.y;
  }

  return Math.max(barY + 68, end + 6);
}

/** The four promises, in the order mail's own words and with its own glyphs. */
function trustRow(doc, y) {
  doc
    .save()
    .roundedRect(LEFT, y, WIDTH, TRUST_H, 10)
    .lineWidth(0.8)
    .fillAndStroke(P.ink50, P.ink200)
    .restore();

  const colWidth = WIDTH / 4;
  TRUST.forEach((point, i) => {
    const x = LEFT + i * colWidth;
    if (i) dashedRule(doc, x, y + 11, x, y + TRUST_H - 11);

    disc(doc, point.icon, x + 17, y + TRUST_H / 2, 10, P.white, 12);
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor(P.ink900)
      .text(point.title, x + 31, y + 13, { width: colWidth - 37, lineBreak: false, ellipsis: true });
    doc
      .font('Helvetica')
      .fontSize(6.5)
      .fillColor(P.ink500)
      .text(point.text, x + 31, y + 24, { width: colWidth - 37, lineGap: 1 });
  });
}

/**
 * Four columns, in the order a reader wants them: the thank-you the order mail
 * signs off with, the two channels a shopper acts on when something is wrong,
 * the networks to follow when nothing is, and a QR back to the storefront.
 *
 * The chips had been tucked under the phone number, where they read as a third
 * way to raise a support ticket. Under their own "Follow Us" they are what they
 * are. They stay the storefront footer's own marks in the networks' own colours
 * — the same `social-color-*` cuts the email footer uses, so the three footers
 * are one row.
 *
 * Columns are fixed rather than divided evenly: the widest thing in each is a
 * different shape — a line of display serif, an email address, a row of 15pt
 * discs, a 46pt square — and four equal quarters would starve the second and
 * waste the fourth.
 */
const FOOT = {
  thanks: { x: LEFT, w: 110 },
  help: { x: 178, w: 140 },
  // Wide enough for all five networks at the chip size below, so a store that
  // fills in every profile gets the same row as one that fills in four.
  social: { x: 338, w: 116 },
  scan: { x: 474, w: 73 },
};

/** Chip diameter and the pitch they are set on. */
const CHIP = 18;
const CHIP_PITCH = 24;

function footer(doc, brand, qr, y) {
  const socials = brand.socials.slice(0, 5);

  dashedRule(doc, 168, y + 2, 168, y + 52);
  dashedRule(doc, 328, y + 2, 328, y + 52);
  if (socials.length) dashedRule(doc, 464, y + 2, 464, y + 52);

  /* Thank you */
  const thanks = FOOT.thanks;
  const centre = thanks.x + thanks.w / 2;
  doc
    .font('Times-Bold')
    .fontSize(18)
    .fillColor(P.ink900)
    .text('Thank You', thanks.x, y, { width: thanks.w, align: 'center', lineBreak: false });
  rule(doc, y + 26, P.accent100, 1, centre - 33, centre - 13);
  heart(doc, centre, y + 26, 4.5);
  rule(doc, y + 26, P.accent100, 1, centre + 13, centre + 33);
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor(P.ink600)
    .text('for shopping with us!', thanks.x, y + 33, { width: thanks.w, align: 'center', lineBreak: false });

  /* Need help */
  const help = FOOT.help;
  doc
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .fillColor(P.accentDark)
    .text('Need Help?', help.x, y + 2, { lineBreak: false });

  let helpY = y + 18;
  if (brand.supportEmail) {
    glyph(doc, 'inquiry-mail.png', help.x, helpY, 10);
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(P.ink600)
      .text(`Contact us at ${brand.supportEmail}`, help.x + 14, helpY + 1.5, {
        width: help.w - 14,
        lineBreak: false,
        ellipsis: true,
      });
    helpY += 14;
  }
  if (brand.supportPhone) {
    glyph(doc, 'inquiry-phone.png', help.x, helpY, 10);
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(P.ink600)
      .text(`or call us at ${brand.supportPhone}`, help.x + 14, helpY + 1.5, {
        width: help.w - 14,
        lineBreak: false,
        ellipsis: true,
      });
  }

  /* Follow us — its own column, and no column at all when nothing is configured. */
  if (socials.length) {
    const social = FOOT.social;
    // Ink, not the gold "Need Help?" wears: that heading is a call to action and
    // this one is a label over a row of marks that already carry all the colour
    // this corner of the page can hold.
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(P.ink900)
      .text('Follow Us', social.x, y + 2, { lineBreak: false });

    // Chips only. A handle underneath would have to be invented from the site
    // name, and a printed @name that turns out not to exist is worse than none.
    socials.forEach((network, i) => {
      glyph(doc, network.file.replace('social-', 'social-color-'), social.x + i * CHIP_PITCH, y + 22, CHIP);
    });
  }

  /* Scan to visit — caption under the code rather than beside it, which is what
     lets this column be narrow enough for the row of chips to its left. */
  const scan = FOOT.scan;
  const boxX = scan.x + (scan.w - 44) / 2;
  if (qr) {
    doc.save().roundedRect(boxX, y + 1, 44, 44, 8).lineWidth(1).fillAndStroke(P.white, P.accent).restore();
    try {
      doc.image(qr, boxX + 5, y + 6, { width: 34, height: 34 });
    } catch (err) {
      logger.warn(`Invoice QR could not be drawn: ${err.message}`);
    }
  }
  doc
    .font('Helvetica')
    .fontSize(6.5)
    .fillColor(P.ink500)
    .text('Scan to visit our website', scan.x, y + 47, { width: scan.w, align: 'center', lineBreak: false });

  rule(doc, y + 58, P.ink200, 0.8);
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(P.ink400)
    .text('This is a computer-generated invoice and does not require a physical signature.', LEFT, y + 66, {
      width: WIDTH,
      align: 'center',
      lineBreak: false,
    });
}

/**
 * Places the two closing blocks under whatever the document ended on.
 *
 * They follow the content rather than sitting at fixed coordinates, so a short
 * invoice leaves its white space at the foot of the page instead of opening a
 * hole between the total and the footer. And they give ground in that order,
 * cheapest thing first, because none of it is worth a second sheet: the trust
 * row — the one decorative block on the page — steps aside, then the gap above
 * closes to `CLOSING_GAP_MIN`. Only when even that will not do does the footer
 * take a page of its own, and there it sits at the foot, where a footer belongs.
 */
function closing(doc, brand, qr, contentEnd) {
  const fits = (gap, trust) => contentEnd + gap + (trust ? TRUST_H + 10 : 0) + FOOTER_H <= BOTTOM;

  let showTrust = true;
  let y;

  if (fits(CLOSING_GAP, true)) y = contentEnd + CLOSING_GAP;
  else if (fits(CLOSING_GAP, false)) {
    showTrust = false;
    y = contentEnd + CLOSING_GAP;
  } else if (fits(CLOSING_GAP_MIN, false)) {
    showTrust = false;
    y = contentEnd + CLOSING_GAP_MIN;
  } else {
    doc.addPage();
    y = BOTTOM - (TRUST_H + 10 + FOOTER_H);
  }

  // A page that is nearly full closes flush with its foot rather than leaving a
  // sliver of paper under the signature line.
  const block = (showTrust ? TRUST_H + 10 : 0) + FOOTER_H;
  if (BOTTOM - (y + block) < 40) y = BOTTOM - block;

  if (showTrust) {
    trustRow(doc, y);
    y += TRUST_H + 10;
  }
  footer(doc, brand, qr, y);
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

/**
 * Streams a printable A4 tax invoice into `res`.
 *
 * Async on purpose: the branding, the logo, the product shots and the QR are all
 * resolved *before* the first byte is written, because a stream that has already
 * started cannot turn back into a JSON error. Everything remote is optional and
 * falls back to something drawn locally, so a slow Cloudinary never costs a
 * shopper their invoice.
 */
async function streamInvoice(order, res) {
  const brand = await getBranding().catch(() => ({
    siteName: env.appName,
    logoUrl: '',
    supportEmail: '',
    supportPhone: '',
    address: '',
    socials: [],
  }));

  const [logo, qr, ...shots] = await Promise.all([
    fetchImage(brand.logoUrl),
    QRCode.toBuffer(env.clientUrl, {
      type: 'png',
      margin: 0,
      width: 200,
      color: { dark: `${P.ink900}ff`, light: '#ffffffff' },
    }).catch((err) => {
      logger.warn(`Invoice QR could not be generated: ${err.message}`);
      return null;
    }),
    ...order.items.map((item) => fetchImage(thumb(item.image))),
  ]);

  const doc = new PDFDocument({ size: 'A4', margin: 0 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${order.invoiceNumber}.pdf"`);
  doc.pipe(res);

  doc.on('pageAdded', () => drawFrame(doc));
  drawFrame(doc);

  header(doc, brand, logo);
  titleBlock(doc, order);
  partiesCard(doc, order);
  closing(doc, brand, qr, totals(doc, order, itemsTable(doc, order, shots)));

  doc.end();
}

module.exports = { streamInvoice };
