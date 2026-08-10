# API Reference

Base URL: `http://localhost:5000/api/v1`

Every response uses one envelope:

```jsonc
// success
{ "success": true, "message": "OK", "data": { ... }, "meta": { ... } }
// failure
{ "success": false, "message": "Human readable reason", "errors": [{ "field": "email", "message": "..." }] }
```

**Auth** — send `Authorization: Bearer <accessToken>`. The refresh token lives in an
httpOnly cookie; `POST /auth/refresh` rotates the pair. Both React apps handle this
automatically in their axios interceptor.

Legend: 🔓 public · 🔒 signed in · 🛡️ admin only

---

## Auth — `/auth`

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/register` | 🔓 | Create an account and email a code — **no tokens**; see below |
| POST | `/verify-email` | 🔓 | `{ email, otp }` — finishes the sign-up and returns tokens |
| POST | `/resend-otp` | 🔓 | `{ email }` — a new code (always 200 — no account enumeration) |
| POST | `/login` | 🔓 | Shopper login |
| POST | `/admin/login` | 🔓 | Admin login (rejects non-admins with 403) |
| POST | `/refresh` | 🔓 | Rotate the token pair using the cookie; the session it belongs to is kept |
| POST | `/logout` | 🔒 | End this device's session |
| GET | `/me` | 🔒 | Current user, plus the `sessionId` this request arrived on |
| GET | `/sessions` | 🔒 | Devices this account is signed in on |
| DELETE | `/sessions/:sessionId` | 🔒 | Sign one device out — **404** if it isn't yours |
| DELETE | `/sessions` | 🔒 | Sign out everywhere, this device included; `?keepCurrent=true` spares it |
| POST | `/forgot-password` | 🔓 | Email a reset link (always 200 — no account enumeration) |
| POST | `/reset-password/:token` | 🔓 | Set a new password; revokes all sessions |
| POST | `/set-password` | 🔒 | First password for a Google-created account; rejects accounts that already have one |
| PATCH | `/change-password` | 🔒 | Change password; revokes all other sessions |

Rate limits: 10 attempts / 15 min on login & register, 15 / 15 min on the two OTP routes,
5 / hour on password reset (production values).

### Email verification

Registering does **not** sign anyone in. It writes the account, mails a 6-digit code and
answers with where that code went:

```jsonc
{
  "email": "shopper@example.com",
  "codeLength": 6,
  "expiresInMinutes": 10,
  "resendAvailableInSeconds": 60,
  "devOtp": "048261"   // non-production only, and only when SMTP is not configured
}
```

`POST /auth/verify-email` is what turns that into a session — it returns the same
`{ user, accessToken, expiresIn, sessionId }` payload every other login route does.

Until it does, the account carries `emailVerificationPending` and every sign-in route
refuses it with **403 `EMAIL_NOT_VERIFIED`**, mailing a fresh code on the way out (subject
to the 60-second cooldown). The refusal comes *after* the password is checked, so neither
form can be used to ask which addresses have a sign-up waiting on them.

Failure codes worth branching on: `OTP_INVALID` (wrong, attempts remain — the message
counts them down), `OTP_EXPIRED`, `OTP_UNUSABLE` (attempts spent), `OTP_COOLDOWN`,
`OTP_RESEND_LIMIT`, `ALREADY_VERIFIED`.

Two things are deliberately *not* gated on `isEmailVerified`: accounts predating this flow
(they were never issued a code, and `emailVerificationPending` is false for them), and Google
sign-in, which proves the address itself and so completes a pending sign-up rather than being
blocked by it. Re-registering an address whose sign-up was never verified replaces the pending
details and sends a new code, so an abandoned attempt cannot squat an address forever.

Defaults are configurable: `OTP_LENGTH`, `OTP_EXPIRY_MINUTES` (10), `OTP_MAX_ATTEMPTS` (5),
`OTP_RESEND_COOLDOWN_SECONDS` (60), `OTP_MAX_RESENDS` (5).

### Login sessions

Every successful login writes a row to `sessions` and both tokens carry its `sid`. The auth
middleware checks that session on each request, so revoking one takes effect on that device's
**next call** rather than whenever its 15-minute access token would have lapsed.

`GET /auth/sessions` answers with the caller's own sessions only — most recently used first,
`isCurrent` marking the one that made the request:

```jsonc
{
  "sessions": [{
    "id": "8b63a17f-0776-43fb-a87d-90d69f991cb1",  // pass this to DELETE
    "device": { "name": "Samsung SM-G990E", "type": "mobile", "vendor": "Samsung", "model": "SM-G990E" },
    "browser": { "name": "Chrome", "version": "120.0" },
    "os": { "name": "Android", "version": "13" },
    "location": { "city": "Chennai", "region": "Tamil Nadu", "country": "India", "countryCode": "IN" },
    "ip": "49.37.x.x",
    "client": "storefront",          // or "admin" — which front-end signed in
    "signInMethod": "password",      // or "google"
    "loginAt": "2026-05-10T17:46:00.000Z",
    "lastActiveAt": "2026-08-06T01:17:00.000Z",
    "expiresAt": "2026-09-05T17:46:00.000Z",
    "isCurrent": true
  }],
  "currentSessionId": "8b63a17f-0776-43fb-a87d-90d69f991cb1"
}
```

`device`, `browser` and `os` come from the User-Agent header, parsed in-house
(`utils/userAgent.js`). `location` is an approximate geo-IP lookup and is `null` whenever the
address is private or the lookup fails — it is never required for anything.

A session ends when it is revoked, when its refresh token runs out (`JWT_REFRESH_EXPIRES`,
30 days), or when it goes idle past `SESSION_INACTIVITY_DAYS` (30). Reads ignore an idle
session immediately; an hourly sweep marks it `expired` and a TTL index drops the row at
`expiresAt`. An account holds at most `SESSION_MAX_PER_USER` (20) live sessions — a new login
is always accepted and the least recently used is dropped.

Password change, password reset and an admin block all revoke **every** session on the account.
Presenting an already-rotated refresh token revokes the session it belongs to: a replay means
someone else holds a copy.

> **Upgrading:** refresh tokens issued before this existed carry no `sid` and are refused with
> "Please log in again to continue" — everyone signs in once after deploy. Access tokens without
> a `sid` keep working until they expire on their own (≤15 min).

## Users — `/users`

| Method | Path | Access | Purpose |
|---|---|---|---|
| PATCH | `/me` | 🔒 | Update name and phone |
| POST | `/me/avatar` | 🔒 | Upload a profile photo (multipart, field `image`, ≤5 MB) — replaces and cleans up the previous one |
| DELETE | `/me/avatar` | 🔒 | Remove the profile photo; falls back to the initial-letter avatar |
| DELETE | `/me` | 🔒 | Deactivate the account (soft delete) |
| GET | `/` | 🛡️ | List users — `search`, `role`, `status`, `from`, `to`, `page`, `limit`; includes order count and lifetime spend |
| GET | `/:id` | 🛡️ | One user plus their 10 most recent orders |
| PATCH | `/:id/status` | 🛡️ | `active` / `blocked` (cannot target yourself) |
| PATCH | `/:id/role` | 🛡️ | `user` / `admin` (cannot target yourself) |

## Categories — `/categories`, `/subcategories`

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/categories` | 🔓 | Nav feed with sub-categories nested |
| GET | `/categories/:idOrSlug` | 🔓 | One category |
| POST | `/categories` | 🛡️ | Create |
| PATCH | `/categories/:id` | 🛡️ | Update |
| DELETE | `/categories/:id` | 🛡️ | Delete — **409** if any product still references it |
| GET | `/categories/:categoryId/subcategories` | 🔓 | Children of a category |
| GET | `/subcategories?category=` | 🔓 | Flat list |
| POST/PATCH/DELETE | `/subcategories/:id?` | 🛡️ | CRUD |

Categories and sub-categories both carry an optional `image: { url, publicId }`. Upload it
through `POST /uploads/image` with `kind=categories`, then send the returned object on the
create/update call. Sending an empty `image` clears it, and the previous Cloudinary asset is
destroyed on save.

## Brands — `/brands`

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/` | 🔓 | Active brands, ordered — `featured=true` narrows it; `includeInactive=true` (🛡️) adds hidden ones plus a `productCount` per brand |
| GET | `/:idOrSlug` | 🔓 | One brand |
| POST | `/` | 🛡️ | Create — **409** on a duplicate name (case-insensitive) |
| PATCH | `/:id` | 🛡️ | Update — a rename rewrites `Product.brand` on every product carrying the old name |
| DELETE | `/:id` | 🛡️ | Delete — **409** if any product still uses it |

A brand holds `name`, `slug`, `description`, `logo { url, publicId }` (upload with
`kind=brands`), `website`, `displayOrder`, `isActive` and `isFeatured`.

> Products store the brand as a **name string** (`Product.brand`), not a reference — that is
> what the listing filter, the search index and the order snapshots read. This collection is
> the curated list behind that string: it supplies the logo, the ordering and the options the
> admin product form offers. `GET /products/filters` joins the two, returning each brand's
> `slug` and `logo` alongside its name and count.

## Products — `/products`

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/` | 🔓 | Listing (see filters below) |
| GET | `/filters` | 🔓 | Price bounds, brands and sub-category counts for the current filter set |
| GET | `/search?q=` | 🔓 | Live-search suggestions (2+ chars, max 8 products) |
| GET | `/home-feed` | 🔓 | All homepage rails in one round trip |
| POST | `/by-ids` | 🔓 | Resolve the client's recently-viewed ids, order preserved |
| GET | `/:idOrSlug` | 🔓 | Product detail (increments view count) |
| GET | `/:id/related` | 🔓 | Related products |
| GET | `/:productId/reviews` | 🔓 | Reviews — `sort`, `rating`, `page` |
| POST | `/:productId/reviews` | 🔒 | Write a review (one per user per product) |
| POST | `/` | 🛡️ | Create |
| PATCH | `/:id` | 🛡️ | Update (removed images are deleted from Cloudinary) |
| DELETE | `/:id` | 🛡️ | Delete product, its images and its reviews |
| PATCH | `/:id/status` | 🛡️ | `draft` / `published` / `archived` |
| PATCH | `/:id/stock` | 🛡️ | Set stock (rejected for a product stocked per variant) |

**Listing query parameters**

`page` `limit` `sort` `search` `category` `subCategory` `brand` `tags`
`minPrice` `maxPrice` `minDiscount` `minRating` `availability` `featured` `topSelling`
`status` + `adminView=true` (admin only — includes drafts)

`category` / `subCategory` accept an ObjectId **or** a slug, comma-separated for multiple.

`sort`: `newest` `oldest` `price_asc` `price_desc` `rating` `popular` `discount` `name_asc` `name_desc`

> `finalPrice` is always derived server-side from `price` and `discountPercent`.
> A client-supplied `finalPrice` is silently discarded.

For a product with variants, `price`, `discountPercent`, `finalPrice` and `stock` on the
**product** are a rollup — the cheapest active SKU's pricing and the total stock across every
active SKU — so all of the filters, sorts and rails above keep working unchanged. Listings
additionally carry `hasVariants`, `variantAttributes` and `variantSummary`
(`count`, `activeCount`, `inStockCount`, `minPrice`, `maxPrice`, `minMrp`, `maxDiscountPercent`).

## Variants — `/products/:productId/variants` and `/variants`

Every unique combination of attributes is its own SKU with its own stock, price, MRP,
discount, images, weight, dimensions and availability.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/products/:productId/variants` | 🔓 | Every combination + the attribute definition |
| POST | `/products/:productId/variants` | 🛡️ | Add one combination |
| PUT | `/products/:productId/variants` | 🛡️ | Replace the whole set (what the wizard sends) |
| POST | `/products/:productId/variants/generate` | 🛡️ | Generate every combination the attributes imply |
| PATCH | `/products/:productId/variant-attributes` | 🛡️ | Define the axes of variation |
| PATCH | `/variants/:id` | 🛡️ | Update one SKU (price, stock, images, weight, dimensions) |
| PATCH | `/variants/:id/stock` | 🛡️ | Quick restock |
| DELETE | `/variants/:id` | 🛡️ | Remove one SKU |
| GET | `/variants/admin/low-stock` | 🛡️ | Per-SKU inventory alerts |

**Attribute definition** — the set is open. Any name works (`Color`, `Size`, `Storage`,
`RAM`, `Waist`, `Shoe Size`, anything a future catalogue needs) and the storefront renders
whatever arrives:

```jsonc
{
  "attributes": [
    { "name": "Color", "inputType": "swatch",           // auto | chip | swatch | image
      "values": [{ "label": "Black", "hex": "#111111" }, { "label": "Blue" }] },
    { "name": "Size", "values": [{ "label": "M" }, { "label": "L" }] }
  ]
}
```

Notes:

- The read is **public and complete**: sold-out and deactivated combinations are returned
  too, because the storefront shows them disabled rather than hiding them.
- Generating is **additive** — a combination that already exists keeps its SKU, price, stock
  and images, so adding one colour never resets the other twenty SKUs.
- `PUT` is a reconciliation: rows are matched by `_id` or by attribute fingerprint, and any
  combination missing from the payload is deleted (its Cloudinary assets released).
- Every write resyncs the parent product's rollup. Uniqueness is enforced by a database
  index on `(product, attributeKey)`, not by the controller.
- Max 6 attributes and 500 combinations per product.

## Cart — `/cart` (all 🔒)

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Cart with live-priced totals |
| POST | `/items` | Add `{ productId, variantId?, quantity }` |
| PATCH | `/items/:itemId` | Change quantity |
| DELETE | `/items/:itemId` | Remove |
| PATCH | `/items/:itemId/save-for-later` | Toggle save-for-later |
| PATCH | `/items/:itemId/variant` | Swap the chosen SKU — `{ variantId }` |
| DELETE | `/` | Empty the cart |
| POST | `/coupon` | Apply `{ code }` |
| DELETE | `/coupon` | Remove the coupon |
| POST | `/merge` | Fold a guest cart in after login |

The cart response flags `priceChanged`, `inStock`, `quantityExceedsStock` per line and
recomputes totals from live prices on every read.

`totals` bills the discounted selling price: `subtotal` is `Σ finalPrice × quantity` over
the billable lines, and `subtotal − couponDiscount + shipping = total`. `mrpTotal` and
`discount` are display-only companions (the pre-discount original and the saving already
inside `subtotal`) — deducting `discount` from `subtotal` double-counts it. `savings` is
`discount + couponDiscount`. Coupons are validated and computed against `subtotal`, so
out-of-stock lines never count toward a `minOrderAmount` or a percentage discount.

`variantId` is **required** for any product that has variants — omitting it returns a 400
naming the missing attributes ("Please choose a color and a size…"). Line identity is
`product + variant`, so Black/M and Blue/L are two independent rows that are priced and
depleted separately. Each line carries `variant` (`_id`, `sku`, `label`, `attributes`),
`variantSku`, `image` (the SKU's own photo, falling back to the product gallery), and its
own `price` / `finalPrice` / `stock`.

## Wishlist — `/wishlist` (all 🔒)

`GET /` · `GET /ids` · `POST /` · `DELETE /:productId` · `POST /:productId/move-to-cart` · `DELETE /`

The wishlist stays keyed by product — one heart per product — but remembers the SKU the
shopper was viewing (`POST /` accepts `{ productId, variantId? }`), so `move-to-cart`
restores that exact option instead of asking again.

## Addresses — `/addresses` (all 🔒)

`GET /` · `POST /` · `PATCH /:id` · `DELETE /:id` · `PATCH /:id/default`

Max 10 per account. The first address is automatically the default; exactly one default is always maintained.

## Orders — `/orders`

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/checkout-summary` | 🔒 | Priced preview before payment |
| POST | `/` | 🔒 | Place order — decrements stock atomically |
| GET | `/` | 🔒 | Own order history |
| GET | `/:id` | 🔒/🛡️ | Owner or admin only |
| GET | `/:id/invoice` | 🔒/🛡️ | Streams a PDF invoice |
| PATCH | `/:id/cancel` | 🔒 | Cancel (up to `shipped`); restores stock |
| GET | `/admin/all` | 🛡️ | All orders — `status`, `paymentStatus`, `search`, `from`, `to` |
| GET | `/admin/statuses` | 🛡️ | Status list and the legal transition map |
| PATCH | `/:id/status` | 🛡️ | Advance the status |

**Status flow** — the server rejects any transition not in this map:

```
pending          → confirmed, cancelled
confirmed        → packed, cancelled
packed           → shipped, cancelled
shipped          → out_for_delivery, cancelled
out_for_delivery → delivered, cancelled
delivered        → returned
cancelled        → (terminal)
returned         → (terminal)
```

Moving to `cancelled` or `returned` restores stock and marks a paid order as refunded.
Marking a COD order `delivered` sets its payment status to `paid`.

## Payments — `/payments`

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/config` | 🔓 | Public key and whether online payment is enabled |
| POST | `/create-order` | 🔒 | Create a Razorpay order for an existing order |
| POST | `/verify` | 🔒 | Verify the HMAC signature, then confirm the order |
| POST | `/failed` | 🔒 | Record a failed/abandoned attempt |
| POST | `/webhook` | 🔓 | Razorpay server callback (raw-body signature check) |
| POST | `/:id/refund` | 🛡️ | Refund a captured payment |

Verification is defence in depth: HMAC signature check (timing-safe) **and** an
amount cross-check against Razorpay's own record of the payment.

## Coupons — `/coupons`

`GET /available` 🔓 · `GET /` 🛡️ · `POST /` 🛡️ · `PATCH /:id` 🛡️ · `DELETE /:id` 🛡️

## Banners — `/banners`

`GET /` 🔓 (filters by `placement` and the active schedule) · `POST /` 🛡️ · `PATCH /:id` 🛡️ · `PATCH /reorder` 🛡️ · `DELETE /:id` 🛡️

## Reviews — `/reviews`

`GET /mine` 🔒 · `PATCH /:id` 🔒 (owner) · `DELETE /:id` 🔒 owner or 🛡️ · `POST /:id/helpful` 🔓

## Uploads — `/uploads` (all 🔒)

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/image` | 🔒 | Single file, field name `image` |
| POST | `/images` | 🛡️ | Up to 5 files, field name `images` |
| DELETE | `/*` | 🛡️ | Delete by Cloudinary publicId (scoped to this store's folder) |

JPG / PNG / WEBP / AVIF, max 5MB each. Returns `{ url, publicId, width, height, format, bytes }`.
Returns **503** when Cloudinary credentials are absent.

## Dashboard — `/dashboard` (all 🛡️)

`/stats` · `/sales-chart?days=` · `/order-status-breakdown` · `/top-products` ·
`/category-performance` · `/recent-orders` · `/low-stock`

## Settings — `/settings`

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/` | 🔓 | Organization settings — store identity, contact, branding, SEO, social |
| PATCH | `/` | 🛡️ | Partial update; unsent fields are left alone |

One singleton document (collection `store_settings`) holding four sections:

```jsonc
{
  "general": { "siteName": "", "contactEmail": "", "contactNumber": "", "companyAddress": "", "mapEmbedUrl": "" },
  "seo":     { "metaTitle": "", "metaDescription": "", "metaKeywords": ["springs", "..."] },
  "branding":{ "logo": { "url": "", "publicId": "" }, "favicon": { "url": "", "publicId": "" } },
  "social":  { "instagram": "", "twitter": "", "whatsapp": "", "facebook": "", "linkedin": "" },
  "fieldHistory": { "general.siteName": "2026-08-04T09:21:51.950Z" }
}
```

- `seo.metaKeywords` accepts an array or a comma-separated string; it always reads back as an array.
- `fieldHistory` stamps each leaf the moment its value actually changes — that is what the admin
  panel prints as *Last updated* beside every input. Re-sending an unchanged value does not restamp it.
- Upload `logo`/`favicon` through `POST /uploads/image` with `kind=branding`, then send the returned
  `{ url, publicId }`. Replacing or clearing an asset deletes the previous one from Cloudinary on save.
- Social links must be absolute `https://` URLs; `whatsapp` also accepts a plain phone number.
- `general.mapEmbedUrl` takes a Google Maps *embed* link, or the whole `<iframe>` snippet — the API
  keeps just the `src`. The storefront embeds it on Contact Us and derives the footer's "open in
  Maps" link from the `!2d<lng>!3d<lat>` coordinates inside it, falling back to `companyAddress`.
- The `careers` block (`hrEmail`, `hrPhone`) lives on the same document but is **not** editable here —
  it belongs to HR and is written through `PATCH /careers/config`.

## Inquiries — `/inquiries`

Contact-form messages. The storefront writes, the admin panel reads.

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/` | 🔓 | Submit the "Get in touch" form; sends the visitor an acknowledgement email |
| GET | `/` | 🛡️ | Inbox — `search`, `range` (`all`/`today`/`7d`/`30d`/`year`), `sort` (`newest`/`oldest`), `status` (`read`/`unread`), `page`, `limit` |
| GET | `/stats` | 🛡️ | KPI tiles for every tab: `total`, `unread`, `subscribers`, `activeSubscribers`, `careerApplications`, `newApplications` |
| GET | `/:id` | 🛡️ | One message — **marks it read** as a side effect |
| PATCH | `/:id/read` | 🛡️ | `{ isRead }` — flip read state by hand |
| POST | `/:id/reply` | 🛡️ | `{ message }` — emails the customer and stores the reply on the enquiry |
| DELETE | `/:id` | 🛡️ | Delete permanently |

- Public submission is rate limited to 8 per hour per IP (production).
- A reply is always recorded, even if SMTP is down; `reply.delivered` says whether it actually left,
  and the success message names the difference.

## Newsletter — `/newsletter`

Sign-ups from the storefront footer.

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/` | 🔓 | Subscribe — `{ email }` |
| GET | `/` | 🛡️ | List — `search`, `status` (`all`/`subscribed`/`unsubscribed`), `sort`, `page`, `limit`; also returns `subscribedCount` |
| PATCH | `/:id/status` | 🛡️ | `{ status }` — `subscribed` / `unsubscribed` |
| DELETE | `/:id` | 🛡️ | Remove the record entirely |

- Subscribing is **idempotent**: an address already on the list succeeds without creating a
  duplicate, and a previously unsubscribed address is re-subscribed. The response is identical in
  all three cases, so the form cannot be used to probe who is on the list.
- Unsubscribing keeps the record and flips `status`, preserving the original `subscribedAt`.
- Rate limited to 8 per hour per IP (production), same budget as the other public forms.

## Careers — `/careers`

Job postings and applications. Positions and the HR contact card are admin-managed, so
the storefront careers page hardcodes nothing.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/config` | 🔓 | Open positions + experience options + HR contact, in one call |
| POST | `/applications` | 🔓 | Apply (multipart, field `resume`, PDF/DOC/DOCX ≤5 MB) |
| PATCH | `/config` | 🛡️ | `{ hrEmail, hrPhone }` — the careers page's "Contact HR" card |
| GET | `/positions` | 🛡️ | All roles, open and closed |
| POST | `/positions` | 🛡️ | Add a role |
| PATCH | `/positions/:id` | 🛡️ | Update / open / close a role |
| DELETE | `/positions/:id` | 🛡️ | Remove a role (applications keep their position as text) |
| GET | `/applications` | 🛡️ | List — `status`, `position`, `experience`, `search`, `sort`, `page`, `limit` |
| GET | `/applications/:id` | 🛡️ | One applicant — **marks it reviewed** as a side effect |
| GET | `/applications/:id/resume?disposition=` | 🛡️ | Streams the résumé — `inline` (default) to preview, `attachment` to download |
| PATCH | `/applications/:id/status` | 🛡️ | `{ status, notes }` — `new`/`shortlisted`/`interviewed`/`rejected`/`hired` |
| DELETE | `/applications/:id` | 🛡️ | Delete the application and its stored résumé |

- Experience values: `intern`, `fresher`, `1-3`, `3-5`, `5+` — `GET /config` returns their labels,
  so the form and the admin filters can never drift apart.
- An application is only accepted for a position that is currently **open**.
- Résumés are stored as Cloudinary `raw` assets, but their URL **never leaves the server** — a CV is
  personal data, and Cloudinary restricts raw delivery anyway. Responses expose only
  `resume: { fileName, bytes, format, hasFile }`; the bytes come from the admin-guarded
  `/resume` route above, which signs a short-lived download server-side and pipes it back.
  Upload returns **503** when Cloudinary credentials are absent.

---

## Error codes

| Code | Meaning |
|---|---|
| 400 | Bad request — business rule violated (out of stock, illegal status transition) |
| 401 | Missing, invalid or expired token |
| 403 | Authenticated but not permitted |
| 404 | Not found |
| 409 | Conflict — duplicate, or a delete blocked by references |
| 422 | Validation failed — `errors[]` names each field |
| 429 | Rate limited |
| 503 | An optional integration (Cloudinary / Razorpay) is not configured |
