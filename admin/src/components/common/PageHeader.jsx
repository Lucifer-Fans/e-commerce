import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import { Link as RouterLink } from 'react-router-dom';

/** Consistent page title block: heading, description, breadcrumbs and page actions. */
export default function PageHeader({ title, subtitle, breadcrumbs = [], action }) {
  return (
    <Box sx={{ mb: 3 }}>
      {breadcrumbs.length > 0 && (
        <Breadcrumbs sx={{ mb: 1, fontSize: 13 }}>
          <Link component={RouterLink} to="/" underline="hover" color="text.secondary">
            Dashboard
          </Link>
          {breadcrumbs.map((crumb, index) =>
            crumb.to && index < breadcrumbs.length - 1 ? (
              <Link
                key={crumb.label}
                component={RouterLink}
                to={crumb.to}
                underline="hover"
                color="text.secondary"
              >
                {crumb.label}
              </Link>
            ) : (
              <Typography key={crumb.label} color="text.primary" fontSize={13} fontWeight={600}>
                {crumb.label}
              </Typography>
            )
          )}
        </Breadcrumbs>
      )}

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'center' }}
        spacing={2}
      >
        <Box>
          <Typography variant="h4">{title}</Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {action}
      </Stack>
    </Box>
  );
}
