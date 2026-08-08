import { Component } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import HomeIcon from '@mui/icons-material/Home';

/**
 * Catches render-time crashes so one broken panel doesn't blank the console.
 * Must stay a class — there is no hook equivalent for componentDidCatch.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Swap for your reporting service in production.
    console.error('Admin render error:', error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <Box sx={{ py: 8, px: 3, textAlign: 'center' }}>
        <ErrorOutlineIcon sx={{ fontSize: 56, color: 'error.main', mb: 1.5 }} />
        <Typography variant="h6" gutterBottom>
          {this.props.title || 'This screen hit an unexpected error'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mx: 'auto', mb: 3, maxWidth: 460 }}>
          Retrying usually fixes it. If it keeps happening, reload the page or report the details below.
        </Typography>

        <Stack direction="row" spacing={1.5} justifyContent="center">
          <Button variant="contained" startIcon={<RefreshIcon />} onClick={this.reset}>
            Try again
          </Button>
          <Button variant="outlined" onClick={() => window.location.reload()}>
            Reload page
          </Button>
          <Button variant="text" startIcon={<HomeIcon />} href="/">
            Dashboard
          </Button>
        </Stack>

        {import.meta.env.DEV && (
          <Paper
            variant="outlined"
            sx={{
              mt: 5,
              mx: 'auto',
              maxWidth: 760,
              p: 2,
              textAlign: 'left',
              bgcolor: 'grey.900',
              color: 'error.light',
              overflow: 'auto',
              maxHeight: 300,
            }}
          >
            <Typography component="pre" variant="caption" sx={{ m: 0, whiteSpace: 'pre-wrap' }}>
              {error.stack || String(error)}
            </Typography>
          </Paper>
        )}
      </Box>
    );
  }
}
