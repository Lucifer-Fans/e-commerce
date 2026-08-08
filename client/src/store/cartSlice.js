import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { cartApi } from '../api/endpoints';

const EMPTY_TOTALS = {
  itemCount: 0, mrpTotal: 0, subtotal: 0, discount: 0, couponDiscount: 0,
  shipping: 0, total: 0, savings: 0, amountForFreeShipping: 0,
};

const call = (name, fn) =>
  createAsyncThunk(`cart/${name}`, async (arg, { rejectWithValue }) => {
    try {
      const res = await fn(arg);
      return res.data.cart;
    } catch (err) {
      return rejectWithValue(err);
    }
  });

export const fetchCart = call('fetch', () => cartApi.get());
export const addToCart = call('add', (payload) => cartApi.addItem(payload));
export const updateCartItem = call('update', ({ itemId, quantity }) => cartApi.updateItem(itemId, quantity));
export const removeCartItem = call('remove', (itemId) => cartApi.removeItem(itemId));
export const toggleSaveForLater = call('saveForLater', ({ itemId, savedForLater }) =>
  cartApi.saveForLater(itemId, savedForLater)
);
export const changeCartItemVariant = call('changeVariant', ({ itemId, variantId }) =>
  cartApi.changeVariant(itemId, variantId)
);
export const clearCart = call('clear', () => cartApi.clear());
export const applyCoupon = call('applyCoupon', (code) => cartApi.applyCoupon(code));
export const removeCoupon = call('removeCoupon', () => cartApi.removeCoupon());

const cartSlice = createSlice({
  name: 'cart',
  initialState: {
    items: [],
    savedForLater: [],
    coupon: null,
    totals: EMPTY_TOTALS,
    hasUnavailableItems: false,
    loading: false,
    // Tracked separately so a quantity change spins only that row, not the page.
    mutatingIds: [],
    error: null,
  },
  reducers: {
    resetCart: (state) => {
      state.items = [];
      state.savedForLater = [];
      state.coupon = null;
      state.totals = EMPTY_TOTALS;
    },
    /** A cart pushed over the socket after another tab or device changed it. */
    cartReceived: (state, action) => {
      const cart = action.payload;
      if (!cart) return;
      state.items = cart.items || [];
      state.savedForLater = cart.savedForLater || [];
      state.coupon = cart.coupon || null;
      state.totals = cart.totals || EMPTY_TOTALS;
      state.hasUnavailableItems = Boolean(cart.hasUnavailableItems);
      state.error = null;
    },
    beginMutation: (state, action) => {
      state.mutatingIds.push(action.payload);
    },
    endMutation: (state, action) => {
      state.mutatingIds = state.mutatingIds.filter((id) => id !== action.payload);
    },
  },
  extraReducers: (builder) => {
    const applyCart = (state, action) => {
      state.loading = false;
      state.error = null;
      const cart = action.payload;
      if (!cart) return;
      state.items = cart.items || [];
      state.savedForLater = cart.savedForLater || [];
      state.coupon = cart.coupon || null;
      state.totals = cart.totals || EMPTY_TOTALS;
      state.hasUnavailableItems = Boolean(cart.hasUnavailableItems);
    };

    builder
      .addCase(fetchCart.pending, (state) => {
        state.loading = true;
      })
      .addMatcher(
        (action) => action.type.startsWith('cart/') && action.type.endsWith('/fulfilled'),
        applyCart
      )
      .addMatcher(
        (action) => action.type.startsWith('cart/') && action.type.endsWith('/rejected'),
        (state, action) => {
          state.loading = false;
          state.error = action.payload?.message || null;
        }
      );
  },
});

export const { resetCart, cartReceived, beginMutation, endMutation } = cartSlice.actions;

export const selectCartCount = (state) =>
  state.cart.items.reduce((sum, item) => sum + item.quantity, 0);

export default cartSlice.reducer;
