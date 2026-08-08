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
      })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.loading = false;
        state.loaded = true;
        state.categories = action.payload;
      })
      .addCase(fetchCategories.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || null;
      })
      .addCase(refreshCategories.fulfilled, (state, action) => {
        state.loaded = true;
        state.categories = action.payload;
      });
  },
});

export default catalogSlice.reducer;
