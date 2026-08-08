import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authApi } from '../api/endpoints';
import { setAccessToken, getAccessToken } from '../api/client';

export const login = createAsyncThunk('auth/login', async (payload, { rejectWithValue }) => {
  try {
    const res = await authApi.login(payload);
    setAccessToken(res.data.accessToken);
    return res.data.user;
  } catch (err) {
    return rejectWithValue(err);
  }
});

export const loadSession = createAsyncThunk('auth/loadSession', async (_, { rejectWithValue }) => {
  if (!getAccessToken()) return rejectWithValue(null);
  try {
    const res = await authApi.me();
    // A non-admin token must never unlock this panel, even if it is valid.
    if (res.data.user.role !== 'admin') throw new Error('Not an admin account');
    return res.data.user;
  } catch {
    setAccessToken(null);
    return rejectWithValue(null);
  }
});

export const logout = createAsyncThunk('auth/logout', async () => {
  try {
    await authApi.logout();
  } finally {
    setAccessToken(null);
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    isAuthenticated: false,
    initialising: true,
    loading: false,
    error: null,
    // The server's tag for the last failure, when it sent one. Lets the sign-in
    // form tell a lockout apart from an ordinary wrong password without matching
    // on message text, which is prose and changes.
    errorCode: null,
  },
  reducers: {
    sessionExpired: (state) => {
      state.user = null;
      state.isAuthenticated = false;
    },
    clearError: (state) => {
      state.error = null;
      state.errorCode = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.errorCode = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
        state.isAuthenticated = true;
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || 'Login failed';
        state.errorCode = action.payload?.code || null;
      })
      .addCase(loadSession.pending, (state) => {
        state.initialising = true;
      })
      .addCase(loadSession.fulfilled, (state, action) => {
        state.initialising = false;
        state.user = action.payload;
        state.isAuthenticated = true;
      })
      .addCase(loadSession.rejected, (state) => {
        state.initialising = false;
        state.user = null;
        state.isAuthenticated = false;
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.isAuthenticated = false;
      });
  },
});

export const { sessionExpired, clearError } = authSlice.actions;
export default authSlice.reducer;
