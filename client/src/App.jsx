import { Suspense, useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Toaster } from 'react-hot-toast';
import { HelmetProvider } from 'react-helmet-async';
import { router } from './routes';
import LanguageProvider from './i18n/LanguageProvider';
import WelcomeLanguageDialog from './components/language/WelcomeLanguageDialog';
import { loadSession, sessionExpired } from './store/authSlice';
import { fetchCategories } from './store/catalogSlice';
import { fetchCart, resetCart } from './store/cartSlice';
import { fetchWishlistIds, resetWishlist } from './store/wishlistSlice';
import RealtimeProvider from './realtime/RealtimeProvider';
import SettingsProvider from './settings/SettingsProvider';

export default function App() {
  const dispatch = useDispatch();
  const { isAuthenticated, initialising } = useSelector((s) => s.auth);

  // Boot: restore the session and load the nav taxonomy in parallel.
  useEffect(() => {
    dispatch(loadSession());
    dispatch(fetchCategories());
  }, [dispatch]);

  // Personalised data follows the session, not the initial mount.
  useEffect(() => {
    if (initialising) return;
    if (isAuthenticated) {
      dispatch(fetchCart());
      dispatch(fetchWishlistIds());
    } else {
      dispatch(resetCart());
      dispatch(resetWishlist());
    }
  }, [dispatch, isAuthenticated, initialising]);

  // The axios interceptor raises this when a refresh attempt finally fails.
  useEffect(() => {
    const onExpired = () => {
      dispatch(sessionExpired());
      dispatch(resetCart());
      dispatch(resetWishlist());
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [dispatch]);

  return (
    <HelmetProvider>
      {/* The `common` namespace is already resolved by the time this renders; the
          boundary only catches route namespaces still streaming in. */}
      <Suspense fallback={null}>
        <LanguageProvider>
          <RealtimeProvider>
            {/* Inside RealtimeProvider so an admin's save reaches the storefront live. */}
            <SettingsProvider>
              <RouterProvider router={router} />
            </SettingsProvider>
          </RealtimeProvider>

          <WelcomeLanguageDialog />
        </LanguageProvider>
      </Suspense>

      <Toaster
        position="bottom-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#0f172a',
            color: '#fff',
            fontSize: '14px',
            borderRadius: '10px',
            padding: '10px 16px',
          },
          success: { iconTheme: { primary: '#16a34a', secondary: '#fff' } },
          error: { duration: 4500, iconTheme: { primary: '#dc2626', secondary: '#fff' } },
        }}
      />
    </HelmetProvider>
  );
}
