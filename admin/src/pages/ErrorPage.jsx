import { useRouteError, isRouteErrorResponse, useNavigate, Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import HomeIcon from '@mui/icons-material/Home';

/**
 * Router-level `errorElement`. Replaces React Router's raw "Unexpected
 * Application Error" screen for anything a boundary inside the tree misses —
 * lazy-chunk load failures, loader throws, crashes in the layout itself.
 */
export default function ErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();

  const isResponse = isRouteErrorResponse(error);
  const status = isResponse ? error.status : undefined;

  // A failed dynamic import means the deployed chunk hash moved under an open tab.
  const isChunkError = /dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(
    error?.message || '',
  );

  let title = 'Something went wrong';
  let message = 'An unexpected error stopped this page from rendering.';

  if (status === 404) {
    title = 'Page not found';
    message = 'That admin route does not exist. It may have been renamed or removed.';
  } else if (status === 401 || status === 403) {
    title = 'Not authorised';
    message = 'Your account does not have permission to view this page.';
  } else if (isChunkError) {
    title = 'A new version was deployed';
    message = 'Part of the app failed to load because it was updated. Reload to get the latest version.';
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3 }}>
      <Box sx={{ textAlign: 'center', maxWidth: 800, width: '100%' }}>
        <ErrorOutlineIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />

        {status && (
          <Typography variant="h3" fontWeight={800} color="text.disabled" sx={{ mb: 1 }}>
            {status}
          </Typography>
        )}

        <Typography variant="h5" fontWeight={700} gutterBottom>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mx: 'auto', mb: 4, maxWidth: 460 }}>
          {message}
        </Typography>

        <Stack direction="row" spacing={1.5} justifyContent="center" flexWrap="wrap" useFlexGap>
          <Button variant="contained" startIcon={<RefreshIcon />} onClick={() => window.location.reload()}>
            Reload page
          </Button>
          <Button variant="outlined" onClick={() => navigate(-1)}>
            Go back
          </Button>
          <Button variant="text" startIcon={<HomeIcon />} component={RouterLink} to="/">
            Dashboard
          </Button>
        </Stack>

        {import.meta.env.DEV && error && (
          <Paper
            variant="outlined"
            sx={{
              mt: 5,
              p: 2,
              textAlign: 'left',
              bgcolor: 'grey.900',
              color: 'error.light',
              overflow: 'auto',
              maxHeight: 320,
            }}
          >
            <Typography component="pre" variant="caption" sx={{ m: 0, whiteSpace: 'pre-wrap' }}>
              {error.stack || error.data || String(error)}
            </Typography>
          </Paper>
        )}
      </Box>
    </Box>
  );
}
