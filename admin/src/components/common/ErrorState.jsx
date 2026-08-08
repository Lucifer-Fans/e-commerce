import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RefreshIcon from '@mui/icons-material/Refresh';

export default function ErrorState({
  title = 'Something went wrong',
  message = 'We could not load this data. Please try again.',
  onRetry,
}) {
  return (
    <Box sx={{ py: 8, px: 3, textAlign: 'center' }}>
      <ErrorOutlineIcon sx={{ fontSize: 52, color: 'error.main', mb: 1.5 }} />
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mx: 'auto', mb: 3, maxWidth: 420 }}>
        {message}
      </Typography>
      {onRetry && (
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </Box>
  );
}
