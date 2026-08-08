import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import { BarChart } from '@mui/x-charts/BarChart';

import { formatNumber, formatPrice } from '../../utils/format';
import { ACCENT, chartAxisSx, compactNumber } from './chartTokens';

const MAX_LABEL_CHARS = 26;
const CHAR_WIDTH = 7; // ≈ average advance of the 12px axis font

const truncate = (name = '', max = MAX_LABEL_CHARS) => (name.length > max ? `${name.slice(0, max - 1)}…` : name);

/** Zero-width space — invisible padding that keeps identical product names apart. */
const ZWSP = String.fromCharCode(0x200b);
const stripPadding = (label = '') => label.split(ZWSP).join('');

export default function TopProductsCard({ products = [], loading, action }) {
  // Highest seller on top, and enough room per row that labels never collide.
  const ranked = [...products].sort((a, b) => a.unitsSold - b.unitsSold);
  const height = Math.max(220, ranked.length * 52 + 60);

  // Band scales need unique categories — pad repeats with invisible characters.
  const labels = ranked.map((p, i) => (p.name || 'Unnamed product') + ZWSP.repeat(i));

  // Reserve exactly enough gutter for the longest tick so names are never clipped
  // off the left edge of the plot, while short lists don't waste the space.
  const longest = labels.reduce((max, l) => Math.max(max, truncate(stripPadding(l)).length), 0);
  const leftMargin = Math.min(250, Math.max(120, longest * CHAR_WIDTH + 22));

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5} sx={{ mb: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6">Top selling products</Typography>
            <Typography variant="body2" color="text.secondary">
              By units sold
            </Typography>
          </Box>
          {action}
        </Stack>

        {loading ? (
          <Skeleton variant="rectangular" height={260} sx={{ borderRadius: 2 }} />
        ) : ranked.length === 0 ? (
          <Typography variant="body2" color="text.disabled" sx={{ py: 8, textAlign: 'center' }}>
            No sales recorded in this period
          </Typography>
        ) : (
          <BarChart
            height={height}
            layout="horizontal"
            borderRadius={6}
            series={[
              {
                data: ranked.map((p) => p.unitsSold),
                label: 'Units sold',
                color: ACCENT,
                valueFormatter: (value, ctx) =>
                  `${formatNumber(value)} units · ${formatPrice(ranked[ctx?.dataIndex]?.revenue)}`,
              },
            ]}
            yAxis={[
              {
                scaleType: 'band',
                data: labels,
                categoryGapRatio: 0.45,
                // Ticks get the trimmed name; the tooltip shows it in full.
                valueFormatter: (label, ctx) =>
                  ctx?.location === 'tick' ? truncate(stripPadding(label)) : stripPadding(label),
              },
            ]}
            xAxis={[{ valueFormatter: compactNumber, tickMinStep: 1 }]}
            barLabel="value"
            grid={{ vertical: true }}
            margin={{ left: leftMargin, right: 24, top: 10, bottom: 28 }}
            slotProps={{ legend: { hidden: true } }}
            sx={{
              ...chartAxisSx,
              '& .MuiChartsAxis-tickLabel': { fill: '#475569', fontSize: 12 },
              '& .MuiBarLabel-root': { fill: '#ffffff', fontWeight: 700, fontSize: 12 },
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
