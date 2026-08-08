import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';

export const store = configureStore({
  reducer: { auth: authReducer },
  middleware: (getDefault) => getDefault({ serializableCheck: false }),
  devTools: import.meta.env.DEV,
});
