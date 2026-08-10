# Premium MERN E-Commerce Platform

Three independent applications, one shared MongoDB database.

```
e-commerce/
├── server/     Express + Mongoose REST API (JWT, Cloudinary, Razorpay, Socket.IO)
├── client/     Customer storefront  — React + Vite + Tailwind + Redux Toolkit
└── admin/      Admin panel          — React + Vite + Material UI
```

Both front-ends hold an open Socket.IO connection to the API, so carts, stock, orders
and the admin dashboard update themselves without a refresh. It needs no extra
configuration — the socket is served from the same origin as `VITE_API_URL`, and the
existing `CLIENT_URL` / `ADMIN_URL` CORS allow-list covers it. See
[ARCHITECTURE.md](ARCHITECTURE.md#realtime) for the room and payload rules.

## Quick start

```bash
# 1. API
cd server
# create .env — Mongo URI, Cloudinary, Razorpay, JWT secrets
npm install
npm run seed                # categories, subcategories, banners, demo products, admin user
npm run dev                 # http://localhost:5000

# 2. Storefront
cd ../client
# create .env — VITE_API_URL, VITE_APP_NAME, VITE_SITE_URL
npm install && npm run start  # http://localhost:5173

# 3. Admin panel
cd ../admin
# create .env — VITE_API_URL, VITE_APP_NAME, VITE_STOREFRONT_URL
npm install && npm run start  # http://localhost:5174
```

Seeded admin credentials: `admin@shop.com` / `Admin@123`

## Nothing is hardcoded

Categories, subcategories, brands, hero slides, products, features, images, pricing, coupons and
shipping rules all live in MongoDB and are editable from the admin panel. The seed script
only provides a starting dataset — delete it and the storefront renders from whatever the
admin creates.

## Documentation

- [`docs/API.md`](docs/API.md) — every endpoint, auth requirement and payload
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — data model, folder layout, design decisions
