import { Link as RouterLink, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import HomeIcon from '@mui/icons-material/Home';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <Box sx={{ py: 10, textAlign: 'center' }}>
      <Typography variant="h2" fontWeight={900} color="primary.main" sx={{ mb: 1 }}>
        404
      </Typography>
      <Typography variant="h6" gutterBottom>
        This admin page doesn&apos;t exist
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mx: 'auto', mb: 4, maxWidth: 420 }}>
        The link may be outdated, or the page was moved. Pick a destination from the sidebar or head back.
      </Typography>

      <Stack direction="row" spacing={1.5} justifyContent="center">
        <Button variant="contained" startIcon={<HomeIcon />} component={RouterLink} to="/">
          Go to dashboard
        </Button>
        <Button variant="outlined" onClick={() => navigate(-1)}>
          Go back
        </Button>
      </Stack>
    </Box>
  );
}
