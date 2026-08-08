import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { wishlistApi } from '../api/endpoints';

export const fetchWishlist = createAsyncThunk('wishlist/fetch', async (_, { rejectWithValue }) => {
  try {
    const res = await wishlistApi.get();
    return res.data.wishlist;
  } catch (err) {
    return rejectWithValue(err);
  }
});

export const fetchWishlistIds = createAsyncThunk('wishlist/ids', async (_, { rejectWithValue }) => {
  try {
    const res = await wishlistApi.ids();
    return res.data.ids;
  } catch (err) {
    return rejectWithValue(err);
  }
});

/**
 * Optimistic toggle: the heart flips immediately and rolls back only if the
 * request fails, so the card never feels laggy.
 */
export const toggleWishlist = createAsyncThunk(
  'wishlist/toggle',
  async (arg, { getState, dispatch, rejectWithValue }) => {
    // Accepts a bare id (every existing caller) or `{ productId, variantId }` from a page
    // where the shopper has an option selected.
    const { productId, variantId } = typeof arg === 'string' ? { productId: arg } : arg;

    const wasWishlisted = getState().wishlist.ids.includes(productId);
    dispatch(wishlistSlice.actions.optimisticToggle(productId));

    try {
      if (wasWishlisted) await wishlistApi.remove(productId);
      else await wishlistApi.add(productId, variantId);
      return { productId, added: !wasWishlisted };
    } catch (err) {
      dispatch(wishlistSlice.actions.optimisticToggle(productId));
      return rejectWithValue(err);
    }
  }
);

const wishlistSlice = createSlice({
  name: 'wishlist',
  initialState: { items: [], ids: [], loading: false, error: null },
  reducers: {
    optimisticToggle: (state, action) => {
      const id = action.payload;
      state.ids = state.ids.includes(id) ? state.ids.filter((x) => x !== id) : [...state.ids, id];
    },
    resetWishlist: (state) => {
      state.items = [];
      state.ids = [];
    },
    /** A wishlist pushed over the socket after another tab or device changed it. */
    wishlistReceived: (state, action) => {
      const wishlist = action.payload;
      if (!wishlist) return;
      state.items = wishlist.items || [];
      state.ids = (wishlist.items || []).map((i) => i.product._id);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWishlist.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchWishlist.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.items || [];
        state.ids = (action.payload.items || []).map((i) => i.product._id);
      })
      .addCase(fetchWishlist.rejected, (state) => {
        state.loading = false;
      })
      .addCase(fetchWishlistIds.fulfilled, (state, action) => {
        state.ids = action.payload || [];
      })
      .addCase(toggleWishlist.fulfilled, (state, action) => {
        // Keep the detailed list in sync when an item is removed from the wishlist page.
        if (!action.payload.added) {
          state.items = state.items.filter((i) => i.product._id !== action.payload.productId);
        }
      });
  },
});

export const { resetWishlist, wishlistReceived } = wishlistSlice.actions;
export default wishlistSlice.reducer;
