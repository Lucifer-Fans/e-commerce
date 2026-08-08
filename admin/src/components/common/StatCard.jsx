import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';

/** KPI tile used across the dashboard header row. */
export default function StatCard({
  title,
  value,
  icon,
  color = 'primary',
  trend,
  caption,
  loading = false,
}) {
  if (loading) {
    return (
      <Card>
        <CardContent>
          <Skeleton variant="text" width="55%" height={18} />
          <Skeleton variant="text" width="75%" height={38} />
          <Skeleton variant="text" width="40%" height={16} />
        </CardContent>
      </Card>
    );
  }

  const positive = Number(trend) >= 0;

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.4}>
              {title}
            </Typography>
            <Typography variant="h4" sx={{ mt: 0.5, mb: 0.5 }} noWrap>
              {value}
            </Typography>

            {trend !== undefined && trend !== null ? (
              <Stack direction="row" alignItems="center" spacing={0.5}>
                {positive ? (
                  <TrendingUpIcon sx={{ fontSize: 16, color: 'success.main' }} />
                ) : (
                  <TrendingDownIcon sx={{ fontSize: 16, color: 'error.main' }} />
                )}
                <Typography
                  variant="caption"
                  fontWeight={700}
                  color={positive ? 'success.main' : 'error.main'}
                >
                  {positive ? '+' : ''}
                  {trend}%
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  vs previous 30 days
                </Typography>
              </Stack>
            ) : (
              caption && (
                <Typography variant="caption" color="text.secondary">
                  {caption}
                </Typography>
              )
            )}
          </Box>

          <Box
            sx={{
              display: 'grid',
              placeItems: 'center',
              width: 48,
              height: 48,
              borderRadius: 2,
              flexShrink: 0,
              bgcolor: `${color}.main`,
              color: '#fff',
              opacity: 0.92,
            }}
          >
            {icon}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
