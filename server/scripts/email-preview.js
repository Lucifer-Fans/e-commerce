/**
 * Renders every template in src/services/mail.service.js to a browsable HTML
 * file, without sending anything.
 *
 *   node scripts/email-preview.js          # render, then print the index path
 *   node scripts/email-preview.js --open   # ...and open it in the browser
 *   node scripts/email-preview.js --no-db  # skip Mongo; use env fallback branding
 *
 * Nothing about the templates is duplicated here. The script stands a fake
 * transport in front of nodemailer, calls the real senders with fixtures, and
 * writes whatever they composed — so a preview can never drift from what the
 * server actually sends.
 *
 * The one edit made to the captured HTML is the image source: a message's
 * artwork travels as `cid:` attachments, which a browser cannot resolve, so
 * each reference is rewritten to the file on disk that mail.service attached
 * for it. That mapping comes from the attachment list itself, so a template
 * that starts using a new mark needs no change here.
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const nodemailer = require('nodemailer');

const env = require('../src/config/env');

const OUT_DIR = path.join(__dirname, '../.email-preview');
/** Where the rewritten <img> points, relative to a file in OUT_DIR. */
const ASSET_HREF = '../src/assets/email';

const args = process.argv.slice(2);
const useDb = !args.includes('--no-db');
const shouldOpen = args.includes('--open');

/* ------------------------------------------------------------------ *
 * Capture
 *
 * env.mailEnabled must be true or mail.service never builds a transport,
 * and both must be set *before* the service is required: it creates its
 * transport once, at module load.
 * ------------------------------------------------------------------ */

const captured = [];
env.mailEnabled = true;
nodemailer.createTransport = () => ({
  sendMail: async (message) => {
    captured.push(message);
    return { messageId: 'preview' };
  },
});

/* ------------------------------------------------------------------ *
 * Branding
 *
 * getBranding() reads the admin's Organization settings, so a preview
 * against the real database shows the real logo, support line and social
 * chips. Without one, mongoose would buffer the query for ten seconds
 * before giving up; disabling buffering makes it fail immediately and the
 * service falls back to its env defaults, which is the other thing worth
 * previewing anyway.
 * ------------------------------------------------------------------ */

async function connectDb() {
  if (!useDb || !env.mongoUri) return false;
  const mongoose = require('mongoose');
  try {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
    return true;
  } catch (err) {
    console.warn(`  ! Mongo unavailable (${err.message.split('\n')[0]}) — using fallback branding`);
    mongoose.set('bufferCommands', false);
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const day = 24 * 60 * 60 * 1000;
/** Fixed offsets from a fixed instant, so re-running produces the same files. */
const NOW = new Date('2026-05-12T14:32:00+05:30').getTime();
const ago = (days) => new Date(NOW - days * day);
/** Interview slots are appointments, so their fixtures have to sit in the future. */
const ahead = (days, hour = 11, minute = 0) => {
  const at = new Date(NOW + days * day);
  at.setHours(hour, minute, 0, 0);
  return at;
};

const ORDER_ID = '6631f0a2c4d5e6f70123abcd';

const address = {
  fullName: 'Ananya Sharma',
  addressLine1: 'Flat 402, Sunrise Residency',
  addressLine2: '17th Cross, HSR Layout Sector 3',
  landmark: 'Opposite BDA Complex',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560102',
  country: 'India',
  phone: '+91 98450 12345',
};

const items = [
  {
    name: 'Aurora Wireless Over-Ear Headphones',
    variantLabel: 'Midnight Blue',
    quantity: 1,
    lineTotal: 8499,
    image: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
  },
  {
    name: 'Braided USB-C Fast Charging Cable (2 m)',
    variantLabel: '',
    quantity: 2,
    lineTotal: 798,
    image: '',
  },
  {
    name: 'Travel Case for Over-Ear Headphones',
    variantLabel: 'Charcoal',
    quantity: 1,
    lineTotal: 1299,
    image: 'https://res.cloudinary.com/demo/image/upload/shoes.jpg',
  },
];

/**
 * The item table above sums to `subtotal` — every line billed at its discounted
 * selling price — and from there the coupon is the only deduction:
 * `subtotal − couponDiscount + shipping = total`. `mrpTotal` and `discount` are
 * the display pair, the pre-discount original and the saving already inside
 * `subtotal`, so they sit outside that sum.
 */
const pricing = {
  mrpTotal: 11396,
  subtotal: 10596,
  discount: 800,
  couponDiscount: 500,
  couponCode: 'WELCOME500',
  shipping: 0,
  total: 10096,
};

/** The audit trail an order carries by the time it reaches `status`. */
const historyUpTo = (status) => {
  const path = ['pending', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
  const end = path.indexOf(status);
  const walked = end === -1 ? path : path.slice(0, end + 1);
  return walked.map((step, index) => ({ status: step, changedAt: ago(walked.length - index) }));
};

/**
 * An order sitting on `status`. Tracking and delivery facts are only attached
 * once they would truthfully exist, so each preview shows the blocks that
 * status actually renders rather than every block at once.
 */
const orderAt = (status, extra = {}) => {
  const reached = (step) => historyUpTo(status).some((row) => row.status === step);
  const shipped = reached('shipped');

  return {
    _id: ORDER_ID,
    orderNumber: 'ORD-2026-004178',
    createdAt: ago(6),
    orderStatus: status,
    paymentMethod: 'razorpay',
    paymentStatus: 'paid',
    items,
    pricing,
    shippingAddress: address,
    statusHistory: historyUpTo(status),
    ...(shipped ? { trackingNumber: 'BD1174829913IN', courierPartner: 'BlueDart' } : {}),
    ...(shipped && status !== 'delivered' ? { expectedDeliveryDate: ago(-2) } : {}),
    ...(status === 'delivered' ? { deliveredAt: ago(1) } : {}),
    ...extra,
  };
};

const CUSTOMER = { to: 'ananya.sharma@example.com', name: 'Ananya' };

/**
 * Every preview: a file name, the label the index shows, and the call that
 * produces it. One entry per distinct rendering, which is why the status mail
 * appears seven times — the tracker, the status card and the logistics block
 * each look different at each stop, and those differences are the whole point
 * of looking.
 */
const CASES = [
  {
    file: 'password-reset',
    group: 'Account',
    label: 'Password reset',
    note: 'Hero banner, link box, security note',
    run: (mail) =>
      mail.sendPasswordResetEmail({
        ...CUSTOMER,
        resetUrl: `${env.clientUrl}/reset-password/9f2c1a7e4b8d0c6f3a5e2d1b8c7f4a9e0d3b6c2a`,
      }),
  },
  {
    file: 'email-verification',
    group: 'Account',
    label: 'Email verification code',
    note: 'Sign-up OTP — code block, no links anywhere',
    run: (mail) =>
      mail.sendEmailVerificationEmail({
        ...CUSTOMER,
        code: '048261',
        minutes: env.otp.expiryMinutes,
      }),
  },
  {
    file: 'account-locked',
    group: 'Account',
    label: 'Account locked',
    note: 'Lockout window + reset escape hatch',
    run: (mail) => mail.sendAccountLockedEmail({ ...CUSTOMER, minutes: env.login.lockMinutes }),
  },
  {
    file: 'order-placed',
    group: 'Orders',
    label: 'Order confirmation',
    note: 'Details, summary, trust row — no tracker',
    run: (mail) => mail.sendOrderConfirmationEmail({ ...CUSTOMER, order: orderAt('confirmed') }),
  },
  ...[
    ['confirmed', 'Status — confirmed', 'Tracker on step 1'],
    ['packed', 'Status — packed', 'Tracker on step 2'],
    ['shipped', 'Status — shipped', 'Tracking number + expected delivery appear'],
    ['out_for_delivery', 'Status — out for delivery', 'Shipped column renames itself'],
    ['delivered', 'Status — delivered', 'Green accent, delivered-on date'],
  ].map(([status, label, note]) => ({
    file: `order-status-${status.replace(/_/g, '-')}`,
    group: 'Orders',
    label,
    note,
    run: (mail) => mail.sendOrderStatusEmail({ ...CUSTOMER, order: orderAt(status) }),
  })),
  {
    file: 'order-status-cancelled',
    group: 'Orders',
    label: 'Status — cancelled',
    note: 'Red terminal step, refund line, no parcel art',
    run: (mail) =>
      mail.sendOrderStatusEmail({
        ...CUSTOMER,
        order: orderAt('cancelled', {
          statusHistory: [...historyUpTo('packed'), { status: 'cancelled', changedAt: ago(1) }],
          paymentStatus: 'refunded',
          cancelledAt: ago(1),
          cancellationReason: 'Cancelled at your request — the item was no longer needed.',
        }),
      }),
  },
  {
    file: 'order-status-returned',
    group: 'Orders',
    label: 'Status — returned',
    note: 'Delivered column kept, red terminal step after it',
    run: (mail) =>
      mail.sendOrderStatusEmail({
        ...CUSTOMER,
        order: orderAt('returned', {
          statusHistory: [...historyUpTo('delivered'), { status: 'returned', changedAt: ago(0) }],
          paymentStatus: 'refunded',
          deliveredAt: ago(3),
          cancelledAt: ago(0),
          cancellationReason: 'Return completed — the headphones arrived with a damaged ear cup.',
        }),
      }),
  },
  {
    file: 'inquiry-ack',
    group: 'Enquiries',
    label: 'Enquiry acknowledgement',
    note: 'White masthead, own shell, "what happens next"',
    run: (mail) =>
      mail.sendInquiryAckEmail({
        to: 'rohan.mehta@example.com',
        name: 'Rohan Mehta',
        email: 'rohan.mehta@example.com',
        phone: '+91 99870 44521',
        subject: 'Bulk order for 40 headsets',
        message:
          'Hi team,\n\nWe are kitting out a new support floor and need roughly 40 of the Aurora ' +
          'over-ear headsets by the end of next month.\n\nCould you share bulk pricing and ' +
          'whether a formal invoice is available?\n\nThanks,\nRohan',
        receivedAt: ago(0),
      }),
  },
  {
    file: 'inquiry-reply',
    group: 'Enquiries',
    label: 'Enquiry reply',
    note: 'Admin response card + the original message quoted back',
    run: (mail) =>
      mail.sendInquiryReplyEmail({
        to: 'rohan.mehta@example.com',
        name: 'Rohan Mehta',
        subject: 'Bulk order for 40 headsets',
        reply:
          'Hi Rohan,\n\nThanks for reaching out. We can absolutely cover 40 units by the end of ' +
          'next month, and orders above 25 units qualify for our bulk tier — that is 18% off the ' +
          'listed price, with a formal invoice raised against your company.\n\nI have attached ' +
          'nothing here on purpose: reply to this mail with your billing details and delivery pin ' +
          'code and we will send a formal quote the same day.',
        originalMessage:
          'We are kitting out a new support floor and need roughly 40 of the Aurora over-ear ' +
          'headsets by the end of next month. Could you share bulk pricing and whether a formal ' +
          'invoice is available?',
        receivedAt: ago(2),
      }),
  },
  {
    file: 'application-ack',
    group: 'Careers',
    label: 'Application acknowledgement',
    note: 'Hiring steps, HR card, footer support line suppressed',
    run: (mail) =>
      mail.sendApplicationAckEmail({
        to: 'priya.nair@example.com',
        name: 'Priya Nair',
        position: 'Senior Frontend Engineer',
        department: 'Engineering',
        appliedAt: ago(0),
      }),
  },
  // One fixture per status the panel can set. `new` has none: it is the state an
  // application is created in and sends no mail of its own.
  ...[
    { status: 'shortlisted', note: 'Brand accent, tracker at stage 2, interview steps' },
    {
      status: 'interviewed',
      note: 'Periwinkle accent, tracker at stage 3, no appointment — the "details to follow" copy',
    },
    { status: 'hired', note: 'Success accent, tracker complete, onboarding steps' },
    { status: 'rejected', note: 'Terminal accent, no tracker, open-roles panel' },
  ].map(({ status, note }) => ({
    file: `application-${status}`,
    group: 'Careers',
    label: `Application status — ${status}`,
    note,
    run: (mail) =>
      mail.sendApplicationStatusEmail({
        to: 'priya.nair@example.com',
        name: 'Priya Nair',
        position: 'Senior Frontend Engineer',
        department: 'Engineering',
        appliedAt: ago(6),
        status,
        hrEmail: 'careers@example.com',
      }),
  })),

  // The two shapes the scheduled invitation takes. They differ in more than a
  // row: the online one prints a joining link and a button, the in-person one an
  // address and none — so both are worth looking at.
  ...[
    {
      file: 'application-interview-scheduled',
      label: 'Interview scheduled — in person',
      note: 'Appointment card with venue, interviewer, instructions',
      interview: {
        scheduledAt: ahead(4, 11, 30),
        mode: 'in-person',
        location: 'Springwala HQ, 4th Floor, Prestige Tech Park, Bengaluru 560103',
        interviewer: 'Rahul Mehta, Engineering Lead',
        contactPhone: '+91 98450 12345',
        durationMins: 45,
        instructions:
          'Please carry a photo ID and reach reception ten minutes early.\n' +
          'The round covers your recent frontend work and a short live exercise.',
      },
    },
    {
      file: 'application-interview-online',
      label: 'Interview scheduled — online',
      note: 'Joining link row plus the join button; no venue row',
      interview: {
        scheduledAt: ahead(2, 16, 0),
        mode: 'online',
        meetingLink: 'https://meet.google.com/abc-defg-hij',
        interviewer: 'Rahul Mehta, Engineering Lead',
        durationMins: 30,
      },
    },
  ].map(({ file, label, note, interview }) => ({
    file,
    group: 'Careers',
    label,
    note,
    run: (mail) =>
      mail.sendApplicationStatusEmail({
        to: 'priya.nair@example.com',
        name: 'Priya Nair',
        position: 'Senior Frontend Engineer',
        department: 'Engineering',
        appliedAt: ago(6),
        status: 'interviewed',
        interview,
        hrEmail: 'careers@example.com',
      }),
  })),
];

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

const escapeHtml = (value = '') =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );

/** `cid:` is meaningless to a browser — point each mark at the file on disk. */
const inlineCids = (html, attachments = []) => {
  let out = html;
  for (const attachment of attachments) {
    out = out.split(`cid:${attachment.cid}`).join(`${ASSET_HREF}/${attachment.filename}`);
  }
  return out;
};

const INDEX_STYLE = `
  :root{color-scheme:light dark}
  *{box-sizing:border-box}
  body{margin:0;padding:40px 20px;background:#f1f5f9;color:#0f172a;
       font:400 15px/1.6 Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
  .wrap{max-width:820px;margin:0 auto}
  h1{margin:0 0 6px;font-size:28px;letter-spacing:-.5px}
  .sub{margin:0 0 32px;color:#64748b;font-size:14px}
  h2{margin:32px 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#64748b}
  ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}
  li{background:#fff;border:1px solid #e2e8f0;border-radius:12px}
  a.card{display:flex;gap:14px;align-items:baseline;flex-wrap:wrap;
         padding:14px 18px;text-decoration:none;color:inherit}
  a.card:hover{background:#f8fafc}
  .name{font-weight:700}
  .note{color:#64748b;font-size:13px}
  .subj{width:100%;color:#475569;font-size:13px}
  .subj b{color:#0f172a;font-weight:600}
  .txt{font-size:12px;color:#2563eb;text-decoration:none;padding:0 18px 14px;display:inline-block}
  footer{margin:36px 0 0;color:#94a3b8;font-size:12px;text-align:center}
  @media (prefers-color-scheme:dark){
    body{background:#0b1120;color:#e2e8f0}
    li{background:#111c33;border-color:#1e293b}
    a.card:hover{background:#16233d}
    .subj b{color:#f8fafc}
  }`;

const indexPage = (rendered, branding) => {
  const groups = [...new Set(rendered.map((entry) => entry.group))];

  const section = (group) => `
    <h2>${escapeHtml(group)}</h2>
    <ul>
      ${rendered
        .filter((entry) => entry.group === group)
        .map(
          (entry) => `
        <li>
          <a class="card" href="${entry.file}.html">
            <span class="name">${escapeHtml(entry.label)}</span>
            <span class="note">${escapeHtml(entry.note)}</span>
            <span class="subj">Subject: <b>${escapeHtml(entry.subject)}</b></span>
          </a>
          <a class="txt" href="${entry.file}.txt">plain-text version &rarr;</a>
        </li>`
        )
        .join('')}
    </ul>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Email previews</title><style>${INDEX_STYLE}</style></head>
<body>
  <div class="wrap">
    <h1>Email previews</h1>
    <p class="sub">
      ${rendered.length} rendering${rendered.length === 1 ? '' : 's'} of the templates in
      <code>src/services/mail.service.js</code>. Branding: <b>${escapeHtml(branding)}</b>.
      Narrow the window to check the mobile breakpoints &mdash; 640px, 520px and 400px.
    </p>
    ${groups.map(section).join('')}
    <footer>Regenerate with <code>npm run email:preview</code>. Nothing here was sent.</footer>
  </div>
</body></html>`;
};

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main() {
  const connected = await connectDb();
  // Required only after the transport has been faked and the DB decided.
  const mail = require('../src/services/mail.service');

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const rendered = [];
  for (const preview of CASES) {
    captured.length = 0;
    await preview.run(mail);

    const message = captured[0];
    if (!message) {
      console.warn(`  ! ${preview.file} composed nothing — skipped`);
      continue;
    }

    fs.writeFileSync(
      path.join(OUT_DIR, `${preview.file}.html`),
      inlineCids(message.html, message.attachments)
    );
    fs.writeFileSync(path.join(OUT_DIR, `${preview.file}.txt`), message.text || '(no plain-text part)');

    rendered.push({ ...preview, subject: message.subject });
    console.log(`  ✓ ${preview.file}.html — ${message.subject}`);
  }

  const indexPath = path.join(OUT_DIR, 'index.html');
  fs.writeFileSync(
    indexPath,
    indexPage(rendered, connected ? 'live Organization settings' : 'env fallback')
  );

  console.log(`\n${rendered.length} previews → ${indexPath}`);

  if (connected) await require('mongoose').disconnect();
  if (shouldOpen) {
    // `start` is a cmd builtin, hence the shell; `open`/`xdg-open` are binaries.
    const opener =
      process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', indexPath]]
        : process.platform === 'darwin'
        ? ['open', [indexPath]]
        : ['xdg-open', [indexPath]];
    execFile(opener[0], opener[1]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
