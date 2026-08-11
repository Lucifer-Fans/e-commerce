import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { catalogApi } from '../api/endpoints';

/** Categories drive the nav on every page, so they are fetched once and cached. */
export const fetchCategories = createAsyncThunk(
  'catalog/categories',
  async (_, { rejectWithValue }) => {
    try {
      const res = await catalogApi.categories();
      return res.data.categories;
    } catch (err) {
      return rejectWithValue(err);
    }
  },
  {
    /**
     * Cached-already guard. A *failed* load deliberately leaves `loaded` false, so
     * this stays open afterwards — re-entering the home page re-dispatches and the
     * nav repairs itself, rather than staying empty for the rest of the session
     * because the one attempt on boot happened to land on a cold API.
     */
    condition: (_, { getState }) => {
      const { catalog } = getState();
      return !catalog.loaded && !catalog.loading;
    },
  }
);

/**
 * Same request, without the cached-already guard — used when the socket reports that
 * an admin changed the taxonomy, where the whole point is to bypass the cache.
 */
export const refreshCategories = createAsyncThunk(
  'catalog/categories/refresh',
  async (_, { rejectWithValue }) => {
    try {
      const res = await catalogApi.categories();
      return res.data.categories;
    } catch (err) {
      return rejectWithValue(err);
    }
  }
);

const catalogSlice = createSlice({
  name: 'catalog',
  initialState: { categories: [], loading: false, loaded: false, error: null },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCategories.pending, (state) => {
        state.loading = true;
        // A retry in flight is not still-failed; clearing here is what lets the
        // strip swap its error state back to a skeleton.
        state.error = null;
      })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.loading = false;
        state.loaded = true;
        state.error = null;
        state.categories = action.payload;
      })
      .addCase(fetchCategories.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || 'Could not load categories';
      })
      /*
       * The socket-driven refresh shares the same three flags, so a manual retry can
       * dispatch it (bypassing the cache guard) and the strip reports it the same way
       * as a first load.
       */
      .addCase(refreshCategories.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(refreshCategories.fulfilled, (state, action) => {
        state.loading = false;
        state.loaded = true;
        state.error = null;
        state.categories = action.payload;
      })
      .addCase(refreshCategories.rejected, (state, action) => {
        state.loading = false;
        // A background socket refresh that fails must not blank a strip that is
        // already on screen — only report it when there is nothing to show.
        if (!state.categories.length) {
          state.error = action.payload?.message || 'Could not load categories';
        }
      });
  },
});

export default catalogSlice.reducer;
