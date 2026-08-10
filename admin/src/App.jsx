import { Suspense, useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { SnackbarProvider } from 'notistack';

import theme from './theme';
import { router } from './routes';
import { loadSession, sessionExpired } from './store/authSlice';
import RealtimeProvider from './realtime/RealtimeProvider';
import useOverlayScrollGuard from './hooks/useOverlayScrollGuard';

export default function App() {
  const dispatch = useDispatch();

  // Keeps the page still behind any open dialog, drawer or menu, touch included.
  useOverlayScrollGuard();

  useEffect(() => {
    dispatch(loadSession());
  }, [dispatch]);

  // Raised by the axios interceptor when refreshing the session finally fails.
  useEffect(() => {
    const onExpired = () => dispatch(sessionExpired());
    window.addEventListener('admin:auth-expired', onExpired);
    return () => window.removeEventListener('admin:auth-expired', onExpired);
  }, [dispatch]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SnackbarProvider
        maxSnack={3}
        autoHideDuration={3500}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {/* Inside SnackbarProvider — the realtime layer raises the new-order alerts. */}
        <RealtimeProvider>
          <Suspense
            fallback={
              <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
                <CircularProgress />
              </Box>
            }
          >
            <RouterProvider router={router} />
          </Suspense>
        </RealtimeProvider>
      </SnackbarProvider>
    </ThemeProvider>
  );
}
