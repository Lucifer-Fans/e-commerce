import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import { PieChart } from '@mui/x-charts/PieChart';

import { formatNumber } from '../../utils/format';
import { CATEGORICAL, OTHER_COLOR } from './chartTokens';

/**
 * Keeps identity stable: the Nth slice always gets the Nth categorical hue, and
 * anything past the palette collapses into a single neutral "Other".
 */
export function withPaletteColors(items, limit = CATEGORICAL.length) {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, limit).map((item, i) => ({ ...item, color: CATEGORICAL[i] }));
  const tail = sorted.slice(limit);

  if (tail.length === 0) return head;
  return [
    ...head,
    {
      label: `Other (${tail.length})`,
      value: tail.reduce((sum, item) => sum + item.value, 0),
      color: OTHER_COLOR,
    },
  ];
}

export default function BreakdownPieCard({
  title,
  subtitle,
  data = [],
  loading,
  donut = false,
  footnote,
  height = 260,
  action,
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const percent = (value) => (total ? Math.round((value / total) * 1000) / 10 : 0);

  const slices = data.map((item, i) => ({
    id: item.label ?? i,
    value: item.value,
    label: item.label,
    color: item.color,
  }));

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6">{title}</Typography>
            {subtitle && (
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          {action}
        </Stack>

        {loading ? (
          <Skeleton variant="rectangular" height={height} sx={{ borderRadius: 2, mt: 2 }} />
        ) : total === 0 ? (
          <Typography variant="body2" color="text.disabled" sx={{ py: 8, textAlign: 'center' }}>
            Nothing recorded in this period
          </Typography>
        ) : (
          <>
            <PieChart
              height={height}
              margin={{ top: 10, bottom: 10, left: 10, right: 10 }}
              series={[
                {
                  data: slices,
                  innerRadius: donut ? 70 : 0,
                  outerRadius: 105,
                  // A 2px surface gap keeps neighbouring slices from bleeding together.
                  paddingAngle: 1.5,
                  cornerRadius: donut ? 4 : 2,
                  highlightScope: { faded: 'global', highlighted: 'item' },
                  faded: { innerRadius: donut ? 70 : 0, additionalRadius: -6, color: '#cbd5e1' },
                  arcLabel: (item) => (percent(item.value) >= 8 ? `${percent(item.value)}%` : ''),
                  arcLabelMinAngle: 22,
                  valueFormatter: (item) => `${formatNumber(item.value)} (${percent(item.value)}%)`,
                },
              ]}
              slotProps={{ legend: { hidden: true } }}
              sx={{ '& .MuiPieArcLabel-root': { fill: '#ffffff', fontWeight: 700, fontSize: 12 } }}
            />

            <Stack direction="row" flexWrap="wrap" justifyContent="center" sx={{ mt: 1, gap: 1.25 }}>
              {data.map((item) => (
                <Stack key={item.label} direction="row" alignItems="center" spacing={0.75}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: item.color, flexShrink: 0 }} />
                  <Typography variant="caption" color="text.secondary">
                    {item.label} · <b>{formatNumber(item.value)}</b>
                  </Typography>
                </Stack>
              ))}
            </Stack>

            {footnote && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5, textAlign: 'center' }}>
                {footnote}
              </Typography>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
