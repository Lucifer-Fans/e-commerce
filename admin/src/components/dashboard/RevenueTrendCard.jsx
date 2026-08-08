import { useCallback, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Skeleton from '@mui/material/Skeleton';
import Popover from '@mui/material/Popover';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ArrowUpIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownIcon from '@mui/icons-material/ArrowDownward';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { LineChart } from '@mui/x-charts/LineChart';

import { dashboardApi } from '../../api/endpoints';
import useFetch from '../../hooks/useFetch';
import { useLiveRefetch } from '../../realtime/useRealtime';
import { EVENTS } from '../../realtime/events';
import { formatPrice, formatNumber } from '../../utils/format';
import { ACCENT, POSITIVE, NEGATIVE, chartAxisSx, compactMoney, compactNumber } from './chartTokens';

const METRICS = [
  { key: 'revenue', label: 'Revenue', money: true },
  { key: 'orders', label: 'Orders', money: false },
  { key: 'customers', label: 'Customers', money: false },
  { key: 'aov', label: 'AOV', money: true },
];

const RANGES = [
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'all', label: 'All time' },
];

const DEFAULT_METRIC = 'revenue';
const DEFAULT_RANGE = 'month';

const today = () => new Date().toISOString().slice(0, 10);

/** Bucket keys arrive as YYYY-MM-DD / YYYY-MM / YYYY — label each in its own shape. */
function labelFor(key, granularity) {
  if (granularity === 'year') return key;
  const [y, m, d] = key.split('-');
  const date = new Date(Number(y), Number(m || 1) - 1, Number(d || 1));
  if (granularity === 'month') return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function RevenueTrendCard() {
  const [metric, setMetric] = useState(DEFAULT_METRIC);
  const [rangeKey, setRangeKey] = useState(DEFAULT_RANGE);
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [draft, setDraft] = useState({ from: '', to: today() });
  const [anchorEl, setAnchorEl] = useState(null);

  const query = useMemo(
    () => (rangeKey === 'custom' ? { range: 'custom', from: custom.from, to: custom.to } : { range: rangeKey }),
    [rangeKey, custom],
  );
  const queryKey = JSON.stringify(query);

  const sales = useFetch(useCallback(() => dashboardApi.salesChart(query), [queryKey]), [queryKey]);

  // The trend redraws as orders land, so the chart matches the stat cards above it.
  useLiveRefetch(sales.refetch, EVENTS.DASHBOARD_INVALIDATED, { delay: 600 });

  const payload = sales.data?.data;
  const series = payload?.series || [];
  const granularity = payload?.range?.granularity || 'day';
  const active = METRICS.find((m) => m.key === metric);

  const total = payload?.totals?.[metric] ?? 0;
  const growth = payload?.growth?.[metric] ?? 0;
  const showGrowth = payload?.range?.key !== 'all';
  const up = growth >= 0;

  const values = series.map((d) => d[metric] ?? 0);
  const labels = series.map((d) => labelFor(d.date, granularity));
  const hasData = values.some((v) => v > 0);

  // A dense window would stack labels on top of each other — thin them to ~6 ticks.
  const tickStep = Math.max(1, Math.ceil(series.length / 6));

  const formatValue = (value) => (active.money ? formatPrice(value, metric === 'aov') : formatNumber(value));

  const isDefault = metric === DEFAULT_METRIC && rangeKey === DEFAULT_RANGE;

  // Back to the default metric + window; if nothing changed, just refetch so the
  // button is still useful for pulling in orders placed since the page loaded.
  const reset = () => {
    if (isDefault) {
      sales.refetch();
      return;
    }
    setMetric(DEFAULT_METRIC);
    setRangeKey(DEFAULT_RANGE);
    setCustom({ from: '', to: '' });
    setDraft({ from: '', to: today() });
  };

  const applyCustom = () => {
    if (!draft.from) return;
    setCustom({ from: draft.from, to: draft.to || today() });
    setRangeKey('custom');
    setAnchorEl(null);
  };

  return (
    <Card>
      <CardContent sx={{ pb: 1.5 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', md: 'center' }}
          spacing={1.5}
        >
          <Box>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="h6">{active.label} growth</Typography>
              {showGrowth && !sales.loading && (
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={0.25}
                  sx={{
                    px: 0.75,
                    py: 0.25,
                    borderRadius: 1,
                    bgcolor: up ? 'rgba(22,163,74,.10)' : 'rgba(220,38,38,.10)',
                    border: 1,
                    borderColor: up ? 'rgba(22,163,74,.30)' : 'rgba(220,38,38,.30)',
                    color: up ? POSITIVE : NEGATIVE,
                  }}
                >
                  {up ? <ArrowUpIcon sx={{ fontSize: 14 }} /> : <ArrowDownIcon sx={{ fontSize: 14 }} />}
                  <Typography variant="caption" fontWeight={700}>
                    {Math.abs(growth)}%
                  </Typography>
                </Stack>
              )}
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Performance insights for the selected period
            </Typography>
          </Box>

          <Stack direction="row" alignItems="center" spacing={1}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={metric}
              onChange={(_e, value) => value && setMetric(value)}
              sx={{ '& .MuiToggleButton-root': { px: 1.5, py: 0.5, fontSize: 13 } }}
            >
              {METRICS.map((m) => (
                <ToggleButton key={m.key} value={m.key}>
                  {m.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Tooltip title={isDefault ? 'Refresh' : 'Reset to revenue · last 30 days'}>
              <IconButton
                size="small"
                onClick={reset}
                color={isDefault ? 'default' : 'primary'}
                sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5 }}
              >
                <RestartAltIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
      </CardContent>

      <Divider />

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={1.5}
        sx={{ px: 2, py: 1.5, bgcolor: '#f8fafc' }}
      >
        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0.6 }}>
            Total for period
          </Typography>
          {sales.loading ? (
            <Skeleton width={140} height={32} />
          ) : (
            <Typography variant="h5">{formatValue(total)}</Typography>
          )}
        </Box>

        <Stack direction="row" spacing={0.5} flexWrap="wrap">
          {RANGES.map((r) => (
            <Button
              key={r.key}
              size="small"
              variant={rangeKey === r.key ? 'contained' : 'text'}
              color={rangeKey === r.key ? 'primary' : 'inherit'}
              onClick={() => setRangeKey(r.key)}
              sx={{ borderRadius: 5, minWidth: 0, px: 1.5, color: rangeKey === r.key ? undefined : 'text.secondary' }}
            >
              {r.label}
            </Button>
          ))}
          <Button
            size="small"
            variant={rangeKey === 'custom' ? 'contained' : 'text'}
            color={rangeKey === 'custom' ? 'primary' : 'inherit'}
            onClick={(e) => setAnchorEl(e.currentTarget)}
            sx={{ borderRadius: 5, minWidth: 0, px: 1.5, color: rangeKey === 'custom' ? undefined : 'text.secondary' }}
          >
            {rangeKey === 'custom' && custom.from ? `${custom.from} → ${custom.to}` : 'Custom'}
          </Button>
        </Stack>
      </Stack>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Stack spacing={1.5} sx={{ p: 2, width: 260 }}>
          <Typography variant="subtitle2">Custom date range</Typography>
          <TextField
            type="date"
            label="From"
            value={draft.from}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            inputProps={{ max: draft.to || today() }}
          />
          <TextField
            type="date"
            label="To"
            value={draft.to}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: draft.from || undefined, max: today() }}
          />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button size="small" color="inherit" onClick={() => setAnchorEl(null)}>
              Cancel
            </Button>
            <Button size="small" variant="contained" onClick={applyCustom} disabled={!draft.from}>
              Apply
            </Button>
          </Stack>
        </Stack>
      </Popover>

      <CardContent sx={{ pt: 2 }}>
        {sales.loading ? (
          <Skeleton variant="rectangular" height={260} sx={{ borderRadius: 2 }} />
        ) : !hasData ? (
          <Typography variant="body2" color="text.disabled" sx={{ py: 10, textAlign: 'center' }}>
            No {active.label.toLowerCase()} recorded in this period
          </Typography>
        ) : (
          <LineChart
            height={280}
            series={[
              {
                data: values,
                label: active.label,
                area: true,
                curve: 'monotoneX',
                color: ACCENT,
                showMark: false,
                valueFormatter: (value) => formatValue(value),
              },
            ]}
            xAxis={[
              {
                scaleType: 'point',
                data: labels,
                tickInterval: (_value, index) => index % tickStep === 0,
              },
            ]}
            yAxis={[{ valueFormatter: active.money ? compactMoney : compactNumber }]}
            grid={{ horizontal: true }}
            margin={{ left: 62, right: 16, top: 16, bottom: 28 }}
            slotProps={{ legend: { hidden: true } }}
            sx={{
              ...chartAxisSx,
              '& .MuiAreaElement-root': { fillOpacity: 0.14 },
              '& .MuiLineElement-root': { strokeWidth: 2.5 },
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
