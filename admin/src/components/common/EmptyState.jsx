import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';

export default function EmptyState({
  icon,
  title = 'Nothing here yet',
  message,
  actionLabel,
  onAction,
  sx,
}) {
  return (
    <Box sx={{ py: 8, px: 3, textAlign: 'center', ...sx }}>
      <Box
        sx={{
          mx: 'auto',
          mb: 2,
          display: 'grid',
          placeItems: 'center',
          width: 72,
          height: 72,
          borderRadius: '50%',
          bgcolor: 'action.hover',
          color: 'text.disabled',
        }}
      >
        {icon || <Inventory2OutlinedIcon sx={{ fontSize: 34 }} />}
      </Box>

      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      {message && (
        <Typography variant="body2" color="text.secondary" sx={{ mx: 'auto', mb: 3, maxWidth: 420 }}>
          {message}
        </Typography>
      )}
      {actionLabel && onAction && (
        <Button variant="contained" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Box>
  );
}
