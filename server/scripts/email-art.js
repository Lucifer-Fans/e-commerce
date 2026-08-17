/**
 * Cuts the `order-*.png` artwork the order-placed email needs.
 *
 * Nothing in this repo can rasterise an SVG (no sharp/resvg/canvas anywhere),
 * so the marks are drawn here as coverage-sampled shapes and written straight
 * to PNG with zlib. Two jobs:
 *   1. draw     — the hero illustration and the one benefit glyph we lack
 *   2. recolour — re-cut an existing single-colour mark in another tint
 *
 * Run from the server package:
 *   node scripts/email-art.js src/assets/email src/assets/email
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Defaults to the folder the emails actually read from, so an argument-less run
// recuts every order-*.png in place.
const ASSETS = path.join(__dirname, '../src/assets/email');
const OUT = process.argv[2] || ASSETS;
const SRC = process.argv[3] || ASSETS;
fs.mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------------------------ *
 * PNG codec (8-bit RGBA, no interlace — every asset in the folder)
 * ------------------------------------------------------------------ */
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function decodePng(file) {
  const buf = fs.readFileSync(file);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (buf[24] !== 8 || buf[25] !== 6 || buf[28] !== 0) throw new Error(`${file}: unsupported PNG`);

  const parts = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') parts.push(buf.subarray(off + 8, off + 8 + len));
    off += len + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(parts));

  // Undo the per-scanline filters.
  const px = Buffer.alloc(w * h * 4);
  const stride = w * 4;
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? px[y * stride + x - 4] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? px[(y - 1) * stride + x - 4] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = v & 0xff;
    }
  }
  return { w, h, px };
}

function encodePng(file, { w, h, px }) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none — these are tiny images
    px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  // Written aside and renamed into place, because a mark is read by something
  // else the moment it exists: the mail server attaches these and the invoice
  // embeds them. A direct write leaves a window where the file on disk is a
  // truncated header, and a reader that lands in it does not get an error it can
  // retry — it gets a PNG with no signature and reports "unknown image format".
  // rename() is atomic within a filesystem, so a reader sees the old cut or the
  // new one and never a half of either.
  const staging = `${file}.tmp`;
  fs.writeFileSync(staging, png);
  fs.renameSync(staging, file);
  console.log(`  ${path.basename(file)}  ${w}x${h}`);
}

/* ------------------------------------------------------------------ *
 * Recolour
 * ------------------------------------------------------------------ */

/**
 * Re-cuts a single-colour mark in another tint, optionally thickening it.
 *
 * The alpha channel carries the whole shape, so repainting every opaque pixel
 * keeps the antialiasing intact — but only for a mark that was one colour to
 * begin with. `grow` dilates that coverage by taking the strongest alpha within
 * a radius, which is how a glyph cut at one stroke weight is brought up to
 * another: `shield-check` is drawn 2.6/44 where the step icons are 2/24, and
 * side by side in the benefits row the difference reads as a mistake.
 */
function recut(src, dst, hex, grow = 0) {
  const img = decodePng(src);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const { w, h, px } = img;
  const alpha = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = px[i * 4 + 3];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = alpha[y * w + x];
      for (let dy = -grow; dy <= grow && a < 255; dy++) {
        for (let dx = -grow; dx <= grow && a < 255; dx++) {
          if (dx * dx + dy * dy > grow * grow) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          a = Math.max(a, alpha[ny * w + nx]);
        }
      }
      const i = (y * w + x) * 4;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = a;
    }
  }
  encodePng(dst, img);
}

/* ------------------------------------------------------------------ *
 * Rasteriser — shapes as coverage predicates, 4x4 supersampled
 * ------------------------------------------------------------------ */
class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = Buffer.alloc(w * h * 4);
  }

  /** Painter's algorithm: `shape(x, y)` is true inside the mark. */
  fill(shape, hex, alpha = 1) {
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    this.paint(shape, () => rgb, alpha);
  }

  /**
   * The same, ramped between two tints along the segment (x0,y0)→(x1,y1).
   *
   * The order hero's bags are drawn as flat faces of a box, and a box lit from
   * one side needs its faces to shade rather than step — the handles in
   * particular read as plastic only because they lighten towards the top of the
   * arc. Sampling the ramp per pixel is cheap here: these are 400px cuts.
   */
  fillGrad(shape, from, to, [x0, y0], [x1, y1], alpha = 1) {
    const a = [1, 3, 5].map((i) => parseInt(from.slice(i, i + 2), 16));
    const b = [1, 3, 5].map((i) => parseInt(to.slice(i, i + 2), 16));
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1;
    this.paint(
      shape,
      (x, y) => {
        const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
        return [0, 1, 2].map((c) => a[c] + (b[c] - a[c]) * t);
      },
      alpha
    );
  }

  /** Shared body of `fill`/`fillGrad`: 4x4 supersampled coverage, `colourAt` per pixel. */
  paint(shape, colourAt, alpha = 1) {
    const N = 4;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        let hits = 0;
        for (let sy = 0; sy < N; sy++) {
          for (let sx = 0; sx < N; sx++) {
            if (shape(x + (sx + 0.5) / N, y + (sy + 0.5) / N)) hits++;
          }
        }
        if (!hits) continue;
        const a = (hits / (N * N)) * alpha;
        const src = colourAt(x + 0.5, y + 0.5);
        const i = (y * this.w + x) * 4;
        const da = this.px[i + 3] / 255;
        const out = a + da * (1 - a);
        for (let c = 0; c < 3; c++) {
          this.px[i + c] = Math.round((src[c] * a + this.px[i + c] * da * (1 - a)) / out);
        }
        this.px[i + 3] = Math.round(out * 255);
      }
    }
  }

  save(file) {
    encodePng(path.join(OUT, file), { w: this.w, h: this.h, px: this.px });
  }
}

/* Shape predicates ------------------------------------------------- */
const circle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const ellipse = (cx, cy, rx, ry, deg = 0) => {
  const t = (deg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const u = dx * cos + dy * sin;
    const v = -dx * sin + dy * cos;
    return (u / rx) ** 2 + (v / ry) ** 2 <= 1;
  };
};
const rect = (x0, y0, w, h) => (x, y) => x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h;
const roundRect = (x0, y0, w, h, r) => (x, y) => {
  if (x < x0 || x > x0 + w || y < y0 || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const and = (a, b) => (x, y) => a(x, y) && b(x, y);
const not = (a, b) => (x, y) => a(x, y) && !b(x, y);
const or = (...shapes) => (x, y) => shapes.some((shape) => shape(x, y));
/** Four-point sparkle: two thin ellipses crossed, so the arms taper to points. */
const sparkle = (cx, cy, r) => or(ellipse(cx, cy, r * 0.28, r), ellipse(cx, cy, r, r * 0.28));
/**
 * Angular slice measured clockwise from twelve o'clock — used to open the gap
 * in the returns arrow's ring, which no combination of boxes cuts cleanly.
 */
const wedge = (cx, cy, from, to) => (x, y) => {
  const deg = (Math.atan2(x - cx, cy - y) * 180) / Math.PI;
  const a = (deg + 360) % 360;
  return from <= to ? a >= from && a <= to : a >= from || a <= to;
};
/** Thick stroke along a polyline — used for the tick and the bag handle. */
const stroke = (pts, w) => (x, y) => {
  const hw = w / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((x - ax) * dx + (y - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx - x;
    const py = ay + t * dy - y;
    if (px * px + py * py <= hw * hw) return true;
  }
  return false;
};

/**
 * Triangle by half-plane sign test — the returns arrow needs a solid arrowhead,
 * and a stroked chevron reads as a tick at 26px.
 */
const triangle = ([ax, ay], [bx, by], [cx, cy]) => {
  const side = (px, py, x0, y0, x1, y1) => (x1 - x0) * (py - y0) - (y1 - y0) * (px - x0);
  return (x, y) => {
    const d1 = side(x, y, ax, ay, bx, by);
    const d2 = side(x, y, bx, by, cx, cy);
    const d3 = side(x, y, cx, cy, ax, ay);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
};

/**
 * Convex quadrilateral, as the two triangles its first corner spans. The order
 * hero's bags are boxes seen from one corner, so every face they show — the
 * front panel, the side panel, the slice of rim across the top — is a four-sided
 * shape with no two edges parallel, which no rectangle predicate covers.
 */
const quad = (a, b, c, d) => or(triangle(a, b, c), triangle(a, c, d));

/**
 * A bag strap: straight legs rising from `base` to a semicircular turn at `top`,
 * `w` thick. The legs matter. An elliptical ring of the same height curves the
 * whole way down and meets the bag at a slant, which reads as the cane handle of
 * a basket; a real carrier strap leaves its rivet vertically and only bends at
 * the crown. Built as a rounded rectangle less a smaller one, both running well
 * past `base` so the legs stay open where the clip cuts them.
 */
const strapArch = (cx, base, halfW, top, w) => {
  const r = halfW + w / 2;
  const outer = roundRect(cx - halfW - w / 2, top, halfW * 2 + w, base - top + 30, r);
  const inner = roundRect(cx - halfW + w / 2, top + w, halfW * 2 - w, base - top + 30, r - w);
  return and(not(outer, inner), (x, y) => y <= base);
};

/**
 * Turns a shape by `deg` about (cx, cy) — the sample point is rotated the other
 * way and tested against the upright shape, which is what lets the chain link be
 * laid out as two horizontal capsules and then tipped onto its diagonal.
 */
const rotate = (shape, cx, cy, deg) => {
  const t = (-deg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    return shape(cx + dx * cos - dy * sin, cy + dx * sin + dy * cos);
  };
};

/**
 * Palette — the brand blues from tailwind.config.js and the periwinkle tints
 * the storefront pairs with them. `teal` is the one hue outside the design
 * system: it belongs to the success badge inside the illustration only, where
 * it has to read as "done" against a panel already full of brand blue, and it
 * never appears in the email's own markup.
 */
const A = {
  // The pale end of the brand ramp — the tint an avatar disc and an envelope's
  // folded flaps are drawn on inside the account illustrations.
  brand100: '#dbeafe',
  brand600: '#2563eb',
  // The deep end of the same ramp, and the tint the reset envelope's back flap
  // is folded in — the two shades that give one flat mark its depth.
  brand700: '#1d4ed8',
  // tailwind `accent.dark` — the gold the invoice rules and its "billed to"
  // avatar are drawn in. Nothing in the email suite uses it; the invoice leads
  // with navy and gold the way the mails lead with navy and blue.
  accent700: '#d97706',
  // tailwind `warning` — the amber the "need help?" card and its shield are
  // drawn in. A shade deeper than the panel tint behind them so a 30px glyph
  // still reads against it.
  amber700: '#b45309',
  // Order hero — the box faces. A shopping bag seen from one corner shows three
  // planes, and each needs its own tint or the mark flattens back into a
  // silhouette: paper-white front, royal-blue side, navy for the rim and the
  // opening behind it.
  bagFront: '#ffffff',
  bagFrontShade: '#e9eefa',
  bagSide: '#3a5ce4',
  bagSideDeep: '#1e3a8a',
  bagRim: '#1c357e',
  bagSmall: '#c6d1f4',
  bagSmallShade: '#aebeee',
  bagSmallRim: '#2f4bc4',
  // Straps run light at the crown and deepen down the legs, and their rivets are
  // a shade darker again with a lighter pin — a strap the same tint all the way
  // down reads as a drawn outline rather than as something you could hook a
  // finger under.
  //
  // The crown is a *light blue*, not an off-white. It has to carry against three
  // things at once: the white panel the legs cross, the pale blob the arch rises
  // into, and the tint the email panel sits on. Take it much past this and the
  // handle disappears into all three at the point it is furthest from the bag —
  // which is exactly where the eye looks to read the shape.
  handleLight: '#cdd9f5',
  handleDeep: '#8095e0',
  handleSmall: '#5d78dd',
  handleSmallTop: '#c3d0f4',
  rivet: '#a8bbee',
  rivetPin: '#e3eafc',
  rivetSmall: '#7b93e0',
  rivetSmallPin: '#c3d0f4',
  // The blob behind the bags, and the confetti scattered round them. The two
  // hues outside the blue ramp — amber and leaf — are three dots between them;
  // they are what stop the scatter reading as a second, dimmer illustration.
  blob: '#eef1fb',
  amber: '#f5c33f',
  sky: '#7cc0f2',
  leaf: '#a8d472',
  sparkle: '#c7d2f7',
  sparkleSoft: '#dbe2fa',
  teal: '#14b8a6',
  white: '#ffffff',
  // tailwind `danger` — the tracker's terminal step on a cancelled order, and
  // the only place the order mails paint anything red.
  red600: '#dc2626',
  // The success ramp from tailwind.config.js. The inquiry-reply mail answers in
  // green the way the storefront marks anything resolved, so its two marks are
  // cut here rather than in brand blue.
  green100: '#dcfce7',
  green600: '#16a34a',
  // Slate-700 — the headset itself is hardware, not an accent, so it stays a
  // neutral a step lighter than the ink the copy is set in.
  slate700: '#334155',
  slate500: '#64748b',
};

/* ------------------------------------------------------------------ *
 * The marks
 * ------------------------------------------------------------------ */

/**
 * The order-placed hero: two shopping bags standing on a soft periwinkle blob,
 * confetti scattered round them and the success badge straddling the pair. The
 * badge is drawn *into* this file rather than layered over it in HTML — email
 * has no reliable way to overlap two images, and Outlook has none at all.
 *
 * The bags are boxes seen from slightly left of and below the corner, so each
 * shows three faces: the paper-white front, the royal-blue side panel, and the
 * slice of navy rim across the open top. That last one is what makes them read
 * as bags rather than as blocks — a shopping bag is defined by its opening.
 * Everything is drawn back to front, the handle before the body it enters, so
 * the body covers the joint.
 *
 * Cut at 2x (400x310) and scaled to 200x155 by the width/height attributes.
 */
function orderHero() {
  const c = new Canvas(400, 310);

  /**
   * One bag: two straps, the navy slice of its open mouth, the side panel and
   * the front panel. `back` is the strap stitched to the far side of the bag, so
   * it is painted before the mouth swallows its lower half; `front` and its two
   * rivets go on last, over the panel they are stitched to. Everything between
   * is the box itself, painted far face first.
   */
  const bag = ({ x0, x1, top, bottom, depth, lift, r, rim, side, sideDeep, front, frontShade,
                 strapDeep, strapLight, rivet, rivetPin,
                 strapHalfW, strapTop, strapW, strapBase }) => {
    const cx = (x0 + x1) / 2;

    // The back strap is the same strap on the far panel: right and up, and
    // painted first, because the mouth is about to swallow everything below the
    // rim line. It steps a third of the bag's depth rather than the whole of it —
    // true perspective would put it clear of the front strap and the pair would
    // read as four separate straps, where what they have to read as is one strap
    // and its twin behind.
    const ramp = (shape, base, tip) =>
      c.fillGrad(shape, strapDeep, strapLight, [cx, base], [cx, tip]);
    ramp(
      strapArch(cx + depth * 0.35, strapBase - lift, strapHalfW, strapTop - lift, strapW),
      strapBase - lift,
      strapTop - lift
    );

    c.fill(quad([x0, top], [x1, top], [x1 + depth, top - lift], [x0 + depth, top - lift]), rim);
    // The side panel carries the whole light source: brightest where it turns
    // away from the front, deepest at the far edge. Ramped along the diagonal
    // rather than straight across, so the corner furthest from the viewer is the
    // darkest point on the bag.
    c.fillGrad(
      quad([x1, top], [x1 + depth, top - lift], [x1 + depth, bottom - lift], [x1, bottom]),
      side,
      sideDeep,
      [x1, top],
      [x1 + depth, bottom]
    );
    c.fillGrad(roundRect(x0, top, x1 - x0, bottom - top, r), front, frontShade, [x0, 0], [x1, 0]);

    // Front strap and the two rivets it hangs off, over the panel they are
    // stitched to. The rivets are drawn as a disc with a lighter pin rather than
    // as a plain dot: they are the only thing in the mark that says the strap is
    // fixed *to* the bag and not just crossing in front of it.
    ramp(strapArch(cx, strapBase, strapHalfW, strapTop, strapW), strapBase, strapTop);
    for (const rx of [cx - strapHalfW, cx + strapHalfW]) {
      c.fill(circle(rx, strapBase, strapW * 0.72), rivet);
      c.fill(circle(rx, strapBase, strapW * 0.32), rivetPin);
    }
  };

  // Backdrop: three overlapping discs rather than one, so the silhouette has the
  // uneven lobes of a blob instead of the geometry of a circle.
  c.fill(or(ellipse(258, 136, 106, 96), circle(322, 152, 58), circle(200, 118, 62)), A.blob);

  // Confetti — weighted to the left, where the copy's headline ends, with a
  // sparser scatter down the right so the mark is not lopsided. Amber and leaf
  // are three dots between them; they are what stop the scatter reading as a
  // second, dimmer illustration in the same blue as the first.
  c.fill(sparkle(90, 45, 14), A.amber);
  c.fill(sparkle(116, 90, 11), A.sky);
  c.fill(sparkle(80, 127, 9), A.handleSmall);
  c.fill(sparkle(62, 170, 12), A.sky);
  c.fill(sparkle(358, 192, 11), A.bagSide);
  c.fill(circle(140, 42, 5), A.sparkle);
  c.fill(circle(48, 90, 5), A.sparkle);
  c.fill(circle(38, 146, 5), A.sparkleSoft);
  c.fill(circle(42, 234, 6), A.leaf);
  c.fill(circle(310, 42, 6), A.sky);
  c.fill(circle(350, 59, 6), A.amber);
  c.fill(circle(340, 140, 5), A.sparkleSoft);

  // The pool the pair stands in — the one thing keeping them from floating.
  c.fill(ellipse(220, 279, 128, 13), A.blob);

  // Rear bag: white front, royal side, navy mouth.
  bag({
    x0: 162, x1: 272, top: 109, bottom: 274, depth: 60, lift: 13, r: 10,
    rim: A.bagRim, side: A.bagSide, sideDeep: A.bagSideDeep,
    front: A.bagFront, frontShade: A.bagFrontShade,
    strapDeep: A.handleDeep, strapLight: A.handleLight,
    rivet: A.rivet, rivetPin: A.rivetPin,
    strapHalfW: 26, strapTop: 64, strapW: 14, strapBase: 133,
  });

  // Front bag, paler and a step lower, overlapping the first — the pair reads as
  // a small haul rather than as one bag and its shadow.
  bag({
    x0: 94, x1: 186, top: 164, bottom: 268, depth: 16, lift: 12, r: 9,
    rim: A.bagSmallRim, side: A.bagSmallShade, sideDeep: A.bagSmallRim,
    front: A.bagSmall, frontShade: A.bagSmallShade,
    strapDeep: A.handleSmall, strapLight: A.handleSmallTop,
    rivet: A.rivetSmall, rivetPin: A.rivetSmallPin,
    strapHalfW: 18, strapTop: 146, strapW: 11, strapBase: 190,
  });

  // Success badge, straddling both bags — the one mark in the illustration that
  // is not blue, so the eye lands on it before it reads anything else.
  c.fill(circle(202, 234, 46), A.teal);
  c.fill(stroke([[180, 236], [195, 251], [226, 218]], 13), A.white);

  c.save('order-hero.png');
}

/**
 * Circular arrow for "Easy Returns" — the one benefit glyph the folder has no
 * cut of, drawn to the same 2px-stroke-on-24px weight as the step icons so the
 * four sit level. 52x52, shown at 26.
 */
function returnsArrow() {
  const c = new Canvas(52, 52);
  // 3.9px of ring on a 52px cut is the 2/26 the step icons are drawn at.
  c.fill(not(not(circle(26, 27, 17), circle(26, 27, 13.1)), wedge(26, 27, 318, 40)), A.brand600);
  c.fill(triangle([8, 13], [24, 7], [22, 23]), A.brand600);
  c.save('order-return.png');
}

/**
 * Reply arrow for the "Our Response" card — MUI's `ReplyOutlined`, the mark the
 * admin clicks to write the message this email carries, re-cut solid: an
 * arrowhead pointing back at the reader with the tail sweeping away beneath it.
 * The tail is a quarter of a ring rather than a stroked curve so its weight
 * stays even all the way round. 52x52, shown at 26.
 */
function replyArrow() {
  const c = new Canvas(52, 52);
  // 4.4px of ring on a 52px cut is the 2/24 weight the row glyphs are drawn at.
  c.fill(and(not(circle(18, 46, 24), circle(18, 46, 19.6)), wedge(18, 46, 0, 90)), A.green600);
  c.fill(triangle([4, 22], [20, 11], [20, 33]), A.green600);
  c.save('inquiry-reply.png');
}

/**
 * The illustration beside the reply itself: a headset with a chat bubble
 * drifting out of it, on a pale green disc — "a person answered this", where
 * the mail's opening artwork says "we got it". Same construction as the order
 * hero: everything is drawn into the one file, because email cannot reliably
 * overlap two images. Cut at 2x (300x300) and shown at 150.
 */
function responseHeadset() {
  const c = new Canvas(300, 300);

  c.fill(circle(150, 152, 138), A.green100);

  // Headband: the top of a ring, opened just past the horizontal so it meets
  // the ear cups rather than stopping short of them.
  c.fill(
    and(not(circle(150, 160, 96), circle(150, 160, 78)), wedge(150, 160, 250, 110)),
    A.slate700
  );
  c.fill(roundRect(41, 152, 44, 86, 22), A.slate700);
  c.fill(roundRect(215, 152, 44, 86, 22), A.slate700);

  // Green accents — the same "we are live" green the response card is tinted
  // in. The ear pad goes on the left cup, which the bubble does not cover.
  c.fill(circle(150, 64, 13), A.green600);
  c.fill(roundRect(48, 164, 26, 62, 13), A.green600);

  // Chat bubble, tail first so the body covers where the two meet.
  c.fill(triangle([158, 236], [200, 240], [152, 276]), A.white);
  c.fill(roundRect(142, 186, 108, 66, 24), A.white);
  for (const x of [172, 196, 220]) c.fill(circle(x, 219, 7.5), A.slate500);

  c.save('inquiry-response.png');
}

/**
 * The lock-out mail's illustration: a shut padlock with a clock face tucked into
 * its lower left, drawn on the same 420 grid and in the same two brand blues as
 * the reset envelope beside it — the two messages arrive at the same moment in a
 * reader's day, and they should look like they came from the same desk.
 *
 * The clock, not a warning triangle, is the whole point of the mark: the pause
 * lifts itself after a few minutes, and an alarm glyph would say "you have been
 * attacked" to the several-out-of-ten readers who simply mistyped a password.
 * It is drawn *into* this file for the reason the order badge is — email cannot
 * dependably overlap two images. 420x420, shown at 210.
 */
function accountLocked() {
  const c = new Canvas(420, 420);

  // Drawn to fill the 420 the way the envelope does. It matters more here than
  // it looks: the panel is centred on a fixed 210px box, so every point of
  // margin baked into the artwork becomes a band of empty tint above the
  // heading — the mark's own padding and the panel's padding stack.
  //
  // Shackle in the deeper blue, body in brand: one flat mark reads as a
  // silhouette, and the reset envelope gets its depth the same way. The clip
  // runs past the ring's centre to the body's top edge so the legs finish inside
  // the body rather than a few pixels short of it.
  c.fill(and(not(circle(218, 150, 72), circle(218, 150, 44)), rect(0, 0, 420, 158)), A.brand700);

  const body = roundRect(112, 150, 212, 170, 30);
  const keyhole = or(circle(218, 210, 20), triangle([205, 210], [231, 210], [218, 262]));
  c.fill(not(body, keyhole), A.brand600);

  // Clock, on a white ring so it lifts off the lock rather than punching a hole
  // in it. Hands at ten past twelve: the one setting where neither runs along the
  // ring's edge or hides under the other, so both stay legible at 105px.
  c.fill(circle(104, 306, 86), A.white);
  c.fill(circle(104, 306, 73), A.brand700);
  c.fill(stroke([[104, 306], [104, 258]], 13), A.white);
  c.fill(stroke([[104, 306], [146, 324]], 13), A.white);

  // The reset mail's rays, in the same three positions — the family resemblance
  // is the point.
  c.fill(stroke([[352, 27], [352, 55]], 11), A.brand600);
  c.fill(stroke([[373, 52], [392, 37]], 11), A.brand600);
  c.fill(stroke([[375, 78], [402, 78]], 11), A.brand600);

  c.save('account-locked.png');
}

/**
 * Padlock for the reset mail's button — a plain lock rather than the masthead's
 * shield, because the button is an action and the shield is a claim about who
 * sent this. Cut in white: it only ever sits on the brand-blue button, and the
 * keyhole is punched *through* to transparency so the button's own colour shows
 * in it, which is one fewer edge to line up. 44x44, shown at 22.
 */
function buttonLock() {
  const c = new Canvas(44, 44);

  // Shackle: the top half of a ring, 3.3px thick — the 2/24 stroke the storefront
  // icons are drawn at, scaled to this cut.
  c.fill(and(not(circle(22, 21, 9.6), circle(22, 21, 6.3)), rect(0, 0, 44, 21)), A.white);

  // Body, less the keyhole.
  const body = roundRect(8.5, 20, 27, 19.5, 4.6);
  const keyhole = or(circle(22, 27.4, 2.7), stroke([[22, 28], [22, 32.6]], 2.8));
  c.fill(not(body, keyhole), A.white);

  c.save('lock-white.png');
}

/**
 * Chain link for the "copy and paste this link" box — two interlocking capsules
 * tipped onto the diagonal every link glyph is drawn on. Built horizontally and
 * rotated, since the rasteriser's rounded rect is axis-aligned. 44x44, shown at
 * 18 on the pale disc beside the URL.
 */
function chainLink() {
  const c = new Canvas(44, 44);

  const ring = (x0) => not(roundRect(x0, 15, 22, 14, 7), roundRect(x0 + 4.2, 19.2, 13.6, 5.6, 2.8));
  c.fill(rotate(or(ring(4), ring(18)), 22, 22, -45), A.brand600);

  c.save('link-brand.png');
}

/**
 * The cross that closes the tracker on a cancelled order. Drawn on the same
 * 48x48 grid as the `step-*.png` glyphs beside it and at their 2px-on-24 stroke,
 * so the terminal circle carries a mark of the same weight as the four before
 * it. White only: this step is never anything but the filled red disc.
 */
function cancelCross() {
  const c = new Canvas(48, 48);
  c.fill(or(stroke([[17, 17], [31, 31]], 4), stroke([[31, 17], [17, 31]], 4)), A.white);
  c.save('step-cancel-white.png');
}

/**
 * The panel mark for the "your account has been deactivated" mail: a profile
 * card with the shutter half down and a red cross badge across its corner.
 *
 * Deliberately not the padlock the lock-out mail wears. That message is about a
 * wait; this one is about a door the reader themselves closed, and the thing that
 * has to read at a glance is *which* door — an account, with a person in it. The
 * cross is the only red anywhere in the suite outside a cancelled order, and it
 * earns it here: this is the one account mail that reports something ending.
 *
 * 420x420, shown at 210.
 */
function accountDeactivated() {
  const c = new Canvas(420, 420);

  // The soft disc every account illustration stands on.
  c.fill(circle(210, 208, 186), A.blob);

  // Browser card: navy chrome bar with its three dots, white body under it.
  c.fill(roundRect(58, 74, 300, 250, 22), A.white);
  c.fill(and(roundRect(58, 74, 300, 250, 22), rect(0, 74, 420, 44)), A.bagRim);
  for (const x of [82, 102, 122]) c.fill(circle(x, 96, 6), A.white, 0.9);

  // The account inside it: avatar, then the three bars that stand for its details.
  c.fill(circle(128, 176, 34), A.brand100);
  c.fill(circle(128, 167, 13), A.brand600);
  c.fill(and(circle(128, 196, 22), rect(0, 0, 420, 196)), A.brand600);
  c.fill(roundRect(178, 158, 148, 15, 7.5), A.bagFrontShade);
  c.fill(roundRect(178, 186, 108, 15, 7.5), A.bagFrontShade);
  c.fill(roundRect(84, 232, 242, 15, 7.5), A.bagFrontShade);
  c.fill(roundRect(84, 262, 170, 15, 7.5), A.bagFrontShade);

  // The badge straddles the card's corner, on a white ring so it lifts off both
  // the card and the disc rather than merging with either.
  c.fill(circle(316, 292, 74), A.white);
  c.fill(circle(316, 292, 60), A.red600);
  c.fill(or(stroke([[294, 270], [338, 314]], 13), stroke([[338, 270], [294, 314]], 13)), A.white);

  c.save('account-deactivated.png');
}

/**
 * The panel mark for the reactivation link: an open envelope with the account
 * card rising out of it and a green tick badge on the corner.
 *
 * The envelope is the reset mail's own subject — "we sent this to your inbox" —
 * and the tick is what makes this one the opposite of the mark above it. A reader
 * who has met both should be able to tell, before reading a word, which of the
 * two arrived. 420x420, shown at 210.
 */
function accountReactivate() {
  const c = new Canvas(420, 420);

  c.fill(circle(210, 210, 186), A.blob);

  // The card lifting out, drawn first so the envelope's front panel covers its
  // foot — that overlap is the whole of the "coming out of" illusion. It clears
  // the envelope's rim by enough that both bars stay readable; a card tucked any
  // lower reads as a letter already posted, which is the opposite message.
  c.fill(roundRect(126, 52, 168, 154, 16), A.white);
  c.fill(circle(210, 100, 24), A.brand100);
  c.fill(circle(210, 94, 9), A.brand600);
  c.fill(and(circle(210, 114, 15), rect(0, 0, 420, 114)), A.brand600);
  c.fill(roundRect(150, 142, 120, 13, 6.5), A.bagFrontShade);
  c.fill(roundRect(168, 166, 84, 13, 6.5), A.bagFrontShade);

  // Envelope, back to front: the back wall, the two side panels the diagonals
  // cut, then the front. The front is the body *less* a wide V — that notch is
  // what makes the shape an open envelope rather than a filled arrow.
  const shell = roundRect(64, 190, 292, 172, 20);
  c.fill(shell, A.brand100);
  c.fill(and(shell, triangle([64, 190], [356, 190], [210, 300])), A.bagSmall);
  c.fill(not(shell, triangle([56, 182], [364, 182], [210, 322])), A.brand600);

  // Tick badge, ringed in white like the cross above.
  c.fill(circle(322, 320, 68), A.white);
  c.fill(circle(322, 320, 55), A.green600);
  c.fill(stroke([[298, 320], [316, 338], [348, 303]], 13), A.white);

  c.save('account-reactivate.png');
}

/**
 * Percent sign for the reactivation mail's benefits row — two rings and the bar
 * between them, cut on the same 44x44 grid and the same stroke weight as the
 * shield and the headset it sits beside.
 */
function percentMark() {
  const c = new Canvas(44, 44);
  c.fill(not(circle(14, 14, 6.4), circle(14, 14, 3.4)), A.brand600);
  c.fill(not(circle(30, 30, 6.4), circle(30, 30, 3.4)), A.brand600);
  c.fill(stroke([[32, 10], [12, 34]], 3.4), A.brand600);
  c.save('percent-brand.png');
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */
console.log('drawing:');
orderHero();
returnsArrow();
replyArrow();
responseHeadset();
buttonLock();
chainLink();
accountLocked();
accountDeactivated();
accountReactivate();
percentMark();
cancelCross();

// The shield is cut in periwinkle for the illustrations; the order mail's
// benefits row and the reset mail's security note both need it in brand blue,
// and a shade heavier, to sit level with the glyphs beside them.
console.log('recolouring:');
recut(path.join(SRC, 'shield-check.png'), path.join(OUT, 'shield-check-brand.png'), A.brand600, 1);

// The tracker draws each glyph three ways — brand for a step already behind the
// order, muted grey for one still ahead, and white for the step the order is
// sitting on, whose circle is a filled brand disc. Only the white cuts are
// missing from the folder, so they are taken from the brand ones here rather
// than redrawn.
for (const name of ['clipboard', 'package', 'truck', 'location', 'home']) {
  recut(path.join(SRC, `step-${name}.png`), path.join(OUT, `step-${name}-white.png`), A.white);
}
// A returned order closes on the same circular arrow the benefits row uses.
recut(path.join(SRC, 'order-return.png'), path.join(OUT, 'step-return-white.png'), A.white);

// The tracker's tiles sit the glyph on a *tint* of its step's accent rather than
// white-on-a-filled-disc, so every accent the tracker can paint needs a cut of
// its own. Brand blue is the folder's default cut and grey is the `-muted` one;
// red is the one it lacks, and it is only ever worn by the terminal step of a
// cancelled or returned order — so those two marks are all that is cut here.
recut(path.join(OUT, 'step-cancel-white.png'), path.join(OUT, 'step-cancel-red.png'), A.red600);
recut(path.join(SRC, 'order-return.png'), path.join(OUT, 'step-return-red.png'), A.red600);

// invoice.service.js draws from this same folder — a PDF has no more use for an
// SVG than an email does. Three tints it needs and the mails do not: a white
// calendar for the navy disc beside the invoice date, the user glyph in gold for
// the "billed & shipped to" avatar, and a brand-blue padlock for the trust row
// (the only cut of that lock is the white one the reset button wears).
recut(path.join(SRC, 'inquiry-calendar.png'), path.join(OUT, 'inquiry-calendar-white.png'), A.white);
recut(path.join(SRC, 'inquiry-user.png'), path.join(OUT, 'inquiry-user-accent.png'), A.accent700);
recut(path.join(OUT, 'lock-white.png'), path.join(OUT, 'lock-brand.png'), A.brand600);

// The account-lifecycle mails re-use three marks the folder only had in other
// tints: the shopping bag and the person glyph in brand blue for the benefits
// row and the "your account details" heading, and the shield in amber for the
// "need help?" card, which is the one note in the suite painted warm rather
// than blue — it is an offer of help, not a security claim.
recut(path.join(SRC, 'inquiry-bag.png'), path.join(OUT, 'bag-brand.png'), A.brand600, 1);
recut(path.join(SRC, 'inquiry-user.png'), path.join(OUT, 'user-brand.png'), A.brand600, 1);
recut(path.join(SRC, 'shield-check.png'), path.join(OUT, 'shield-check-amber.png'), A.amber700, 1);
