# Architecture

Three independent deployables sharing one MongoDB database and one REST API.

```
Customer (client, :5173) ─┐
                          ├──► REST API (server, :5000) ──► MongoDB
Admin    (admin,  :5174) ─┘                             └─► Cloudinary
                                                        └─► Razorpay
```

The two React apps never talk to MongoDB, Cloudinary or Razorpay directly. Every write
goes through the API, which is the only place authorisation, validation and pricing live.

---

## Data model

| Collection | Purpose | Notable design |
|---|---|---|
| `users` | Accounts | Password hashed with bcrypt; OTP fields present but unused |
| `sessions` | One signed-in device | Rotating refresh-token hash, parsed device/browser/OS, IP and approximate location, `lastActiveAt`; TTL index on `expiresAt` self-cleans |
| `categories` | Top-level taxonomy | Slugged, ordered, virtual-populates its children |
| `subcategories` | Second level | Unique on `(category, slug)` — "Accessories" may exist under several parents |
| `products` | Catalogue | Embedded `features[]`, `images[]`, `faqs[]`, `highlights[]`; `finalPrice` derived; denormalised rating aggregate |
| `productvariants` | One row per sellable combination | Own SKU, price, stock, images, weight and dimensions; unique on `(product, attributeKey)` |
| `addresses` | Delivery addresses | Exactly one default per user, enforced by a pre-save hook |
| `carts` | One per user | Stores `priceAtAdd` to detect price drift; `savedForLater` flag; line identity is `product + variant` |
| `wishlists` | One per user | One entry per product; remembers the variant that was being viewed |
| `coupons` | Promotions | `check()` and `computeDiscount()` live on the model, so cart and checkout can't disagree |
| `orders` | Placed orders | **Fully denormalised line items** |
| `payments` | Razorpay records | Signature, provider payload and refund state kept for reconciliation |
| `reviews` | Product reviews | Unique on `(product, user)`; post-write hooks resync the product's rating |
| `banners` | Hero slider | Placement + schedule window |
| `store_settings` | Organization settings | Single document (`key: "store"`); per-field `fieldHistory` timestamps. Collection name pinned because the default `MONGO_URI` has no database name and a bare `settings` collides with other projects sharing the cluster |

### Why order items are snapshots

An order stores the product's name, image, brand, category, price and discount **as
they were at purchase time**. Renaming a product, repricing it or deleting it outright
must never rewrite a historical order or a printed invoice. The `product` ObjectId is
kept for linking, but nothing in the order display depends on that document still existing.

### Variants are rows, and the product is their rollup

A product that varies (Black/M, Blue/L, Graphite/256 GB) gets one `productvariants` row per
combination. They live in their own collection rather than as a sub-document array because a
product with 5 colours × 6 sizes × 3 capacities is 90 rows that need their own indexes, their
own atomic `$inc` on stock, and to stay cheap to page through in the admin.

The attribute *definition* — what the selector renders — stays on the product as
`variantAttributes`. The set is completely open: any name the admin types becomes a real
attribute, and the storefront paints it as a colour swatch, an image thumbnail or a text chip
based on the data, so a new attribute needs no code change on either side.

**The parent product is kept as a rollup**, and this is what let the system land without
touching any existing feature. `variant.service.syncProductAggregates()` runs after every
variant write and rewrites the product's `stock` (total across active SKUs), `price` and
`discountPercent` (the cheapest active SKU's), plus a `variantSummary`. Every pre-existing
query — the price filter, the `price_asc` sort, the availability filter, the homepage rails,
the search, the dashboard tiles — keeps reading exactly the fields it always read, and now
means "from ₹x" and "stock across all options" without knowing variants exist.

The uniqueness of a combination is a **database** guarantee: `attributeKey` is a fingerprint
sorted by attribute slug (`color:black|size:m`), and `(product, attributeKey)` is a unique
index. Reordering the attributes in the admin therefore cannot mint a duplicate.

### Money has exactly one owner

`server/src/services/pricing.service.js` is the only place that computes totals. The cart
endpoint, the checkout summary and the order document all call `calculateTotals()`, so the
number a shopper sees in the cart is arithmetically the same number they are charged.

The discounted selling price *is* the price. Every line is billed at `finalPrice`, so the
subtotal is already net of the product discount and there is exactly one deduction after it:

```
subtotal (Σ finalPrice × qty) − couponDiscount + shipping = total
```

`mrpTotal` and `discount` are outside that sum — the struck-through original and the
"you saved" figure, never a row in the column. Showing the product discount as a deduction
under a subtotal that already contains it double-counts it, so the cart, checkout, order
page, admin order view, order mail and the PDF invoice all render the four figures above
and state the saving once, below the total. The coupon is priced against
`eligibleSubtotal()` over the *billable* basket — out-of-stock lines are excluded and
over-ordered ones clamped to stock — so a coupon can never be measured against goods the
order will not charge for.

Two matching guards sit alongside it:

- `finalPrice` is recomputed in a Mongoose `pre('validate')` hook from `price` and
  `discountPercent`. Controllers explicitly `delete payload.finalPrice` before saving.
- The order is rebuilt from live product documents at checkout, not from what the client posts.

### Stock is decremented conditionally, on the exact SKU

`server/src/services/inventory.service.js` is the only place stock moves — orders,
cancellations, returns and refunds all call it.

```js
ProductVariant.updateOne({ _id, stock: { $gte: quantity }, isActive: true },
                         { $inc: { stock: -quantity } })
```

If another shopper drained the stock between the checkout summary and the order write,
`matchedCount` is 0 and the whole order aborts. The write runs inside a transaction when
the deployment is a replica set; on a single-node MongoDB it falls back to a compensating
path that rolls back the decrements it already made.

For a varied product the SKU row is the authority — it is what gates the sale — and the
parent's rollup is moved by the same amount in the same call, so a returned Black/M never
makes Blue/L look available and `Product.stock` never drifts from the sum of its variants.
Order lines carry `variant`, `variantSku`, `variantLabel` and a snapshot of the chosen pairs,
which is what lets returns, warehouse picking and per-SKU analytics name the unit that
actually moved rather than only the product.

---

## Backend layout

```
server/src/
├── config/       env (fails fast on boot), db, cloudinary
├── models/       Mongoose schemas — validation, hooks, virtuals, indexes
├── validators/   express-validator chains, one file per domain
├── middleware/   auth, RBAC, validate, sanitize, rate limits, upload, error handler
├── services/     token, mail, pricing, razorpay, invoice — no Express types here
├── controllers/  request → service/model → response envelope
├── routes/       URL shape + which middleware guards it
├── realtime/     Socket.IO gateway, event names, domain broadcast helpers
└── seed/         starting dataset and the seeding script
```

**Layer rule.** Controllers know about HTTP; services don't. That is what makes
`pricing.service.js` reusable from the cart, the checkout preview and the order writer.

---

## Realtime

Both front-ends hold an open Socket.IO connection, so the UI reflects a write the
moment it happens instead of on the next navigation. REST stays the only way to
*change* anything — the socket is a notification channel, never a second write path.

**Rooms** decide who sees what. Membership is assigned by the server from the verified
handshake identity; a client can only ever *ask* for the two rooms that carry no
private data.

| Room | Members | Carries |
|---|---|---|
| `public` | every connection, signed in or not | catalogue, stock, banners, categories, settings |
| `user:<id>` | one shopper, all their tabs and devices | cart, wishlist, profile, their orders |
| `admins` | every connected admin | order feed, user changes, dashboard invalidation |
| `product:<id>` | whoever has that product open | stock, price and rating for that product |
| `order:<id>` | the buyer plus admins on that order | status, tracking, payment |

**Auth is optional and degrades.** A visitor with no token still joins `public`, so the
storefront is live before login. A token that is present but invalid or expired is
treated as anonymous rather than refused — an expired access token costs you the
personal rooms, not the whole connection.

**Payload rule.** Anything whose shape depends on paging or filters (list pages) is
sent as a small hint and the client refetches; anything the client can render as-is
(a cart, an order summary) is pushed whole. That keeps list pages correct without the
server having to know each client's current query.

**Echo suppression.** Writes carry an `X-Socket-Id` header. The server tags its
broadcast with that id, and the originating tab ignores its own echo — so an
optimistic update is never overwritten by the round trip that confirmed it.

**Overlapping rooms are deduped.** An order change targets `admins`, `order:<id>` and
`user:<id>` in a single chained emit, because a buyer viewing their own order is in
two of those rooms and must still be told exactly once.

**Broadcasts never break a request.** Every helper in `realtime/broadcast.js` is
wrapped so a realtime failure is logged, not thrown, and every emit is a no-op when
the gateway isn't running — which is what lets the seed script import controllers
without starting a server.

### Security

| Concern | Handling |
|---|---|
| Passwords | bcrypt, 12 rounds, `select: false` |
| Sessions | Short-lived JWT access token + rotating refresh token in an httpOnly cookie; both carry the `sid` of a row in `sessions` |
| Revocation | Per-device, checked on every request — signing a device out stops it on its next call, not when its access token lapses. Password change, reset and block revoke the whole account |
| Refresh replay | A rotated-away refresh token that comes back revokes its session outright: a replay means somebody else holds a copy |
| Session expiry | Absolute at the refresh token's lifetime, idle at `SESSION_INACTIVITY_DAYS`; hourly sweep marks them, a TTL index removes them |
| Token race | `passwordChangedAt` invalidates access tokens issued before a password change |
| NoSQL injection | Custom sanitiser strips `$`-prefixed and dotted keys from body, query and params |
| XSS | `xss` allow-list; rich-text fields keep formatting tags, everything else is stripped |
| Headers | Helmet |
| Rate limiting | Tiered — global, auth, password reset, uploads |
| Parameter pollution | `hpp` with an allow-list for genuinely repeatable filters |
| CORS | Explicit origin allow-list with credentials |
| Payments | Timing-safe HMAC comparison, plus an amount cross-check against Razorpay |
| Enumeration | Login and forgot-password give identical answers for known and unknown emails |
| Errors | Non-operational errors are logged in full and reported to clients as a generic message in production |

---

## Storefront (`client/`)

```
src/
├── api/          axios instance + one module of endpoint functions
├── store/        Redux Toolkit: auth, cart, wishlist, catalog
├── hooks/        useFetch, useDebounce, useClickOutside, useCartActions
├── components/   common · layout · product · cart · checkout · home · auth
├── pages/        route components (all lazy-loaded)
├── routes/       router definition + ProtectedRoute
├── realtime/     socket singleton, provider, subscription hooks
└── utils/        formatting, constants, recently-viewed, razorpay loader
```

**What lives in Redux.** Only state that is genuinely global and mutated from many places:
the session, the cart, wishlist ids, and the category tree. Page-local data uses `useFetch`,
which keeps loading/error handling uniform without pushing every response into a global store.

**The URL is the filter state.** `ProductList` reads every filter from `useSearchParams`,
so a filtered view is shareable, bookmarkable and survives refresh and the back button.

**Auth flow.** The axios interceptor catches a 401, refreshes once (concurrent 401s share
a single refresh promise rather than stampeding), and replays the original request. If the
refresh fails it emits `auth:expired`, which `App.jsx` turns into a Redux reset.

**Staying live.** `RealtimeProvider` owns everything shared — cart, wishlist, profile,
order toasts and the category nav — and reconnects under the new identity whenever the
session changes. Pages subscribe for themselves with `useLiveRefetch(refetch, events)`,
which debounces so one order's burst of stock events causes a single reload. Personal
state is also re-read on every reconnect, in case the socket was away long enough to
miss a write.

**Performance.** Every route is `React.lazy`; vendor chunks are split in `vite.config.js`;
images go through Cloudinary transform URLs; the hero's first slide is eager with
`fetchpriority="high"` while everything else is lazy; `ProductCard` is memoised.

**SEO.** `react-helmet-async` per route, with Open Graph, Twitter cards and JSON-LD
(`Product` with offers and aggregate rating, `WebSite` with a search action).

---

## Admin panel (`admin/`)

Material UI throughout, one `theme.js` driving every surface.

**The 4-step upload wizard** (`pages/ProductForm.jsx`) is the centrepiece:

1. **Basic info** — name, taxonomy, pricing with live auto-calculated final price, description, tags
2. **Features** — unlimited key/value rows that become the storefront's specification table, plus highlights and FAQs
3. **Images** — drag & drop to Cloudinary, up to 5, numbered slots with reorder / replace / delete and per-file progress
4. **Preview** — full review including a live storefront card mock, then publish or save as draft

Each step validates before you can advance, but the stepper is non-linear so you can jump
back freely. The same component handles create and edit — edit mode hydrates from the API.

`ImageUploader` is deliberately array-based and takes a `max` prop, which is why the banner
editor reuses it verbatim with `max={1}`.

**Live by default.** Every table and the dashboard subscribe through the same
`useLiveRefetch` hook, so orders, stock and registrations arrive without a refresh. The
dashboard is the exception to per-resource events: its panels are all aggregates, so the
server sends one `dashboard:invalidated` signal and the whole board re-reads. A new order
also raises a snackbar, and the topbar carries a Live/Offline dot — once nothing polls,
a silent socket drop would otherwise be indistinguishable from a quiet day.

`Settings.jsx` deliberately does *not* auto-refetch: it adopts another admin's save only
while its own form is clean, so an in-progress edit is never overwritten.

---

## Extending it

The seams are already in place for the roadmap items:

- **Inventory** — `stock`, `lowStockThreshold` and the dashboard's low-stock query exist; add warehouses as a sub-document
- **Analytics** — the dashboard controller is pure aggregation; add pipelines, no schema change
- **Notifications** — `mail.service.js` already fires on order events; swap in a queue and add SMS/push alongside
- **Multi-vendor** — `Product.createdBy` is populated; add a `vendor` ref and scope the admin queries by it
- **PWA** — the client is a static Vite build; add `vite-plugin-pwa` and a manifest
- **OTP login** — `User.otp` (hash, channel, expiry, attempts) and the verified flags already exist
