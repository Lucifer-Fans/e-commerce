import api from './client';

/* Every network call the storefront makes lives here, so components never build URLs. */

export const authApi = {
  register: (payload) => api.post('/auth/register', payload),
  // Registration hands back no session — these two are what finish it.
  verifyEmail: (payload) => api.post('/auth/verify-email', payload),
  resendOtp: (payload) => api.post('/auth/resend-otp', payload),
  login: (payload) => api.post('/auth/login', payload),
  googleLogin: (credential) => api.post('/auth/google', { credential }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  forgotPassword: (payload) => api.post('/auth/forgot-password', payload),
  resetPassword: (token, payload) => api.post(`/auth/reset-password/${token}`, payload),
  changePassword: (payload) => api.patch('/auth/change-password', payload),
  // First password for a Google account — no current password exists to prove.
  setPassword: (payload) => api.post('/auth/set-password', payload),
};

/**
 * The devices this account is signed in on. Every call is scoped server-side to the
 * caller, so there is no id to pass and no other account's sessions to reach.
 */
export const sessionApi = {
  list: () => api.get('/auth/sessions'),
  revoke: (sessionId) => api.delete(`/auth/sessions/${sessionId}`),
  /**
   * Signs out everywhere. `keepCurrent` leaves this browser signed in — the milder
   * "tidy up my old devices"; the default takes this one down too, which is what
   * someone reaching for this button after losing a phone actually wants.
   */
  revokeAll: ({ keepCurrent = false } = {}) =>
    api.delete('/auth/sessions', { params: keepCurrent ? { keepCurrent: 'true' } : undefined }),
};

export const userApi = {
  updateProfile: (payload) => api.patch('/users/me', payload),
  deactivate: () => api.delete('/users/me'),

  /**
   * Persists the interface language so the choice follows the account to any
   * device. Its own route because it fires on a click, not a form submit.
   */
  updateLanguage: (language) => api.patch('/users/me/language', { language }),

  uploadAvatar: (file, { onProgress } = {}) => {
    const form = new FormData();
    form.append('image', file);
    return api.post('/users/me/avatar', form, {
      onUploadProgress: (event) => {
        if (!onProgress || !event.total) return;
        onProgress(Math.round((event.loaded * 100) / event.total));
      },
    });
  },
  removeAvatar: () => api.delete('/users/me/avatar'),
};

export const uploadApi = {
  /**
   * One photo or clip per request, so each tile in the review uploader can show
   * its own progress and fail on its own without taking the others down.
   */
  media: (file, { kind = 'reviews', onProgress } = {}) => {
    const form = new FormData();
    form.append('file', file);
    form.append('kind', kind);
    return api.post('/uploads/media', form, {
      onUploadProgress: (event) => {
        if (!onProgress || !event.total) return;
        onProgress(Math.round((event.loaded * 100) / event.total));
      },
    });
  },
};

export const catalogApi = {
  categories: () => api.get('/categories'),
  category: (idOrSlug) => api.get(`/categories/${idOrSlug}`),
  banners: (placement = 'hero') => api.get('/banners', { params: { placement } }),
};

export const productApi = {
  list: (params) => api.get('/products', { params }),
  filterMeta: (params) => api.get('/products/filters', { params }),
  search: (q) => api.get('/products/search', { params: { q } }),
  homeFeed: () => api.get('/products/home-feed'),
  detail: (idOrSlug) => api.get(`/products/${idOrSlug}`),
  related: (id) => api.get(`/products/${id}/related`),
  // Every combination of a product, including the sold-out ones the selector shows disabled.
  variants: (productId) => api.get(`/products/${productId}/variants`),
  byIds: (ids) => api.post('/products/by-ids', { ids }),
  reviews: (productId, params) => api.get(`/products/${productId}/reviews`, { params }),
  createReview: (productId, payload) => api.post(`/products/${productId}/reviews`, payload),
};

export const cartApi = {
  get: () => api.get('/cart'),
  addItem: (payload) => api.post('/cart/items', payload),
  updateItem: (itemId, quantity) => api.patch(`/cart/items/${itemId}`, { quantity }),
  removeItem: (itemId) => api.delete(`/cart/items/${itemId}`),
  saveForLater: (itemId, savedForLater) =>
    api.patch(`/cart/items/${itemId}/save-for-later`, { savedForLater }),
  // "Actually, make that a Large" — swaps the SKU on an existing line.
  changeVariant: (itemId, variantId) => api.patch(`/cart/items/${itemId}/variant`, { variantId }),
  clear: () => api.delete('/cart'),
  applyCoupon: (code) => api.post('/cart/coupon', { code }),
  removeCoupon: () => api.delete('/cart/coupon'),
  merge: (items) => api.post('/cart/merge', { items }),
};

export const wishlistApi = {
  get: () => api.get('/wishlist'),
  ids: () => api.get('/wishlist/ids'),
  add: (productId, variantId) => api.post('/wishlist', { productId, variantId }),
  remove: (productId) => api.delete(`/wishlist/${productId}`),
  moveToCart: (productId, variantId) =>
    api.post(`/wishlist/${productId}/move-to-cart`, { variantId }),
};

export const addressApi = {
  list: () => api.get('/addresses'),
  create: (payload) => api.post('/addresses', payload),
  update: (id, payload) => api.patch(`/addresses/${id}`, payload),
  remove: (id) => api.delete(`/addresses/${id}`),
  setDefault: (id) => api.patch(`/addresses/${id}/default`),
};

export const orderApi = {
  checkoutSummary: (payload) => api.post('/orders/checkout-summary', payload),
  create: (payload) => api.post('/orders', payload),
  list: (params) => api.get('/orders', { params }),
  detail: (id) => api.get(`/orders/${id}`),
  /**
   * `payload` is either `{ reasonId }` for one of the store's published reasons
   * or `{ reason }` for the sentence typed under "Other". The server resolves the
   * id to its label, so nothing the dialog displays is trusted as the record.
   */
  cancel: (id, payload) => api.patch(`/orders/${id}/cancel`, payload),
  cancellationReasons: () => api.get('/cancellation-reasons'),
  invoiceUrl: (id) => `${import.meta.env.VITE_API_URL}/orders/${id}/invoice`,
};

export const paymentApi = {
  config: () => api.get('/payments/config'),
  createOrder: (orderId) => api.post('/payments/create-order', { orderId }),
  verify: (payload) => api.post('/payments/verify', payload),
  recordFailure: (payload) => api.post('/payments/failed', payload),
};

export const couponApi = {
  available: () => api.get('/coupons/available'),
};

export const settingApi = {
  get: () => api.get('/settings'),
};

export const contactApi = {
  submit: (payload) => api.post('/inquiries', payload),
};

export const newsletterApi = {
  /** Idempotent — re-submitting an address that is already on the list still succeeds. */
  subscribe: (email) => api.post('/newsletter', { email }),
};

export const careerApi = {
  /** Open roles, experience options and the HR contact card — all admin-managed. */
  config: () => api.get('/careers/config'),

  apply: (values, { onProgress } = {}) => {
    const form = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      if (key === 'resume' || value === undefined || value === null || value === '') return;
      form.append(key, value);
    });
    if (values.resume) form.append('resume', values.resume);

    return api.post('/careers/applications', form, {
      onUploadProgress: (event) => {
        if (!onProgress || !event.total) return;
        onProgress(Math.round((event.loaded * 100) / event.total));
      },
    });
  },
};
