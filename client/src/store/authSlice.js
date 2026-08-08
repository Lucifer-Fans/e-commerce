import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authApi, userApi } from '../api/endpoints';
import { setAccessToken, getAccessToken } from '../api/client';

export const login = createAsyncThunk('auth/login', async (payload, { rejectWithValue }) => {
  try {
    const res = await authApi.login(payload);
    setAccessToken(res.data.accessToken);
    return res.data;
  } catch (err) {
    return rejectWithValue(err);
  }
});

export const googleLogin = createAsyncThunk(
  'auth/googleLogin',
  async (credential, { rejectWithValue }) => {
    try {
      const res = await authApi.googleLogin(credential);
      setAccessToken(res.data.accessToken);
      return res.data;
    } catch (err) {
      return rejectWithValue(err);
    }
  }
);

/**
 * Creates the account but does *not* sign anyone in: the API answers a sign-up
 * with where it sent the code and how long that code lasts, and the session only
 * exists once `verifyEmail` below hands the code back.
 */
export const register = createAsyncThunk('auth/register', async (payload, { rejectWithValue }) => {
  try {
    const res = await authApi.register(payload);
    return res.data;
  } catch (err) {
    return rejectWithValue(err);
  }
});

/** The other half of registering — and the only place a sign-up becomes a session. */
export const verifyEmail = createAsyncThunk(
  'auth/verifyEmail',
  async (payload, { rejectWithValue }) => {
    try {
      const res = await authApi.verifyEmail(payload);
      setAccessToken(res.data.accessToken);
      return res.data;
    } catch (err) {
      return rejectWithValue(err);
    }
  }
);

/** Restores the session on a hard refresh. Silence on failure is intentional. */
export const loadSession = createAsyncThunk('auth/loadSession', async (_, { rejectWithValue }) => {
  if (!getAccessToken()) return rejectWithValue(null);
  try {
    const res = await authApi.me();
    return res.data;
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

export const updateProfile = createAsyncThunk(
  'auth/updateProfile',
  async (payload, { rejectWithValue }) => {
    try {
      const res = await userApi.updateProfile(payload);
      return res.data.user;
    } catch (err) {
      return rejectWithValue(err);
    }
  }
);

export const uploadAvatar = createAsyncThunk(
  'auth/uploadAvatar',
  async ({ file, onProgress }, { rejectWithValue }) => {
    try {
      const res = await userApi.uploadAvatar(file, { onProgress });
      return res.data.user;
    } catch (err) {
      return rejectWithValue(err);
    }
  }
);

export const removeAvatar = createAsyncThunk(
  'auth/removeAvatar',
  async (_, { rejectWithValue }) => {
    try {
      const res = await userApi.removeAvatar();
      return res.data.user;
    } catch (err) {
      return rejectWithValue(err);
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    /**
     * Which login session this browser is. The devices screen marks it as "This
     * device", and it is how a revoke broadcast aimed at the whole account is
     * recognised as aimed at us.
     */
    sessionId: null,
    isAuthenticated: false,
    /**
     * The sign-up waiting on a code: `{ email, codeLength, expiresInMinutes,
     * resendAvailableInSeconds, devOtp? }`, or null. It carries the address from
     * the register form to the verify screen, and a login refused as unverified
     * fills it in the same way on its way there.
     */
    pendingVerification: null,
    // `initialising` gates the router until we know whether a session exists,
    // so protected routes don't flash the login page on refresh.
    initialising: true,
    loading: false,
    error: null,
    /**
     * The server's tag for the last failure, when it sent one. Lets the login form
     * tell a lockout apart from an ordinary wrong password without reading the
     * message text, which is prose and changes.
     */
    errorCode: null,
  },
  reducers: {
    /** Adopts a user object returned by a call that owns its own request lifecycle. */
    setUser: (state, action) => {
      state.user = action.payload;
    },
    clearAuthError: (state) => {
      state.error = null;
      state.errorCode = null;
    },
    /** Set by a login the API refused as unverified, so the code screen knows who. */
    setPendingVerification: (state, action) => {
      state.pendingVerification = { email: action.payload };
    },
    sessionExpired: (state) => {
      state.user = null;
      state.sessionId = null;
      state.isAuthenticated = false;
    },
  },
  extraReducers: (builder) => {
    const pending = (state) => {
      state.loading = true;
      state.error = null;
      state.errorCode = null;
    };
    // Login, register and Google sign-in all return the same `{ user, sessionId }`.
    const authFulfilled = (state, action) => {
      state.loading = false;
      state.user = action.payload.user;
      state.sessionId = action.payload.sessionId || null;
      state.isAuthenticated = true;
      // Whatever was waiting on a code has just been answered, one way or another.
      state.pendingVerification = null;
    };
    const rejected = (state, action) => {
      state.loading = false;
      state.error = action.payload?.message || 'Something went wrong';
      state.errorCode = action.payload?.code || null;
    };

    builder
      .addCase(login.pending, pending)
      .addCase(login.fulfilled, authFulfilled)
      .addCase(login.rejected, rejected)
      .addCase(googleLogin.pending, pending)
      .addCase(googleLogin.fulfilled, authFulfilled)
      .addCase(googleLogin.rejected, rejected)
      .addCase(register.pending, pending)
      // Deliberately not `authFulfilled`: a sign-up is not a session. All this
      // returns is where the code went, which is what the verify screen renders.
      .addCase(register.fulfilled, (state, action) => {
        state.loading = false;
        state.pendingVerification = action.payload;
      })
      .addCase(register.rejected, rejected)
      .addCase(verifyEmail.pending, pending)
      .addCase(verifyEmail.fulfilled, authFulfilled)
      .addCase(verifyEmail.rejected, rejected)
      .addCase(loadSession.pending, (state) => {
        state.initialising = true;
      })
      .addCase(loadSession.fulfilled, (state, action) => {
        state.initialising = false;
        state.user = action.payload.user;
        state.sessionId = action.payload.sessionId || null;
        state.isAuthenticated = true;
      })
      .addCase(loadSession.rejected, (state) => {
        state.initialising = false;
        state.user = null;
        state.sessionId = null;
        state.isAuthenticated = false;
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.sessionId = null;
        state.isAuthenticated = false;
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.user = action.payload;
      })
      .addCase(uploadAvatar.fulfilled, (state, action) => {
        state.user = action.payload;
      })
      .addCase(removeAvatar.fulfilled, (state, action) => {
        state.user = action.payload;
      });
  },
});

export const { setUser, clearAuthError, setPendingVerification, sessionExpired } =
  authSlice.actions;
export default authSlice.reducer;
