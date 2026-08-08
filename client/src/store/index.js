import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import cartReducer from './cartSlice';
import wishlistReducer from './wishlistSlice';
import catalogReducer from './catalogSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    cart: cartReducer,
    wishlist: wishlistReducer,
    catalog: catalogReducer,
  },
  middleware: (getDefault) => getDefault({ serializableCheck: false }),
  devTools: import.meta.env.DEV,
});
