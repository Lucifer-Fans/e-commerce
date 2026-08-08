import { useCallback, useMemo } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Avatar from '@mui/material/Avatar';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';

import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import ReceiptIcon from '@mui/icons-material/ReceiptLong';
import InventoryIcon from '@mui/icons-material/Inventory2';
import PeopleIcon from '@mui/icons-material/PeopleAlt';
import AddIcon from '@mui/icons-material/Add';
import WarningIcon from '@mui/icons-material/WarningAmber';
import RefreshIcon from '@mui/icons-material/Refresh';

import { dashboardApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import { useLiveRefetch } from '../realtime/useRealtime';
import { EVENTS } from '../realtime/events';
import { formatPrice, formatNumber, formatDate, titleCase, thumb } from '../utils/format';
import PageHeader from '../components/common/PageHeader';
import StatCard from '../components/common/StatCard';
import StatusChip from '../components/common/StatusChip';
import ErrorState from '../components/common/ErrorState';
import RevenueTrendCard from '../components/dashboard/RevenueTrendCard';
import BreakdownPieCard, { withPaletteColors } from '../components/dashboard/BreakdownPieCard';
import TopProductsCard from '../components/dashboard/TopProductsCard';
import RangeControls from '../components/dashboard/RangeControls';
import useRangeQuery from '../components/dashboard/useRangeQuery';

export default function Dashboard() {
  const navigate = useNavigate();

  // Each panel keeps its own window, so narrowing one doesn't disturb the others.
  const statusRange = useRangeQuery('month');
  const paymentRange = useRangeQuery('month');
  const topRange = useRangeQuery('month');

  const stats = useFetch(useCallback(() => dashboardApi.stats(), []), []);
  const statusBreakdown = useFetch(
    useCallback(() => dashboardApi.statusBreakdown(statusRange.query), [statusRange.queryKey]),
    [statusRange.queryKey],
  );
  const paymentPreference = useFetch(
    useCallback(() => dashboardApi.paymentPreference(paymentRange.query), [paymentRange.queryKey]),
    [paymentRange.queryKey],
  );
  const topProducts = useFetch(
    useCallback(() => dashboardApi.topProducts(6, topRange.query), [topRange.queryKey]),
    [topRange.queryKey],
  );
  const recentOrders = useFetch(useCallback(() => dashboardApi.recentOrders(6), []), []);
  const lowStock = useFetch(useCallback(() => dashboardApi.lowStock(6), []), []);

  const sections = [stats, statusBreakdown, paymentPreference, topProducts, recentOrders, lowStock];
  const failed = sections.filter((r) => r.error);
  const retryFailed = useCallback(() => failed.forEach((r) => r.refetch()), [failed]);

  /**
   * Every panel is an aggregate, so rather than mapping each event to the panels it
   * touches, the server sends one "your figures are stale" signal and the whole board
   * re-reads. The debounce inside useLiveRefetch collapses an order's burst of events
   * into a single pass.
   */
  const refreshAll = useCallback(() => sections.forEach((r) => r.refetch()), [sections]);
  useLiveRefetch(refreshAll, EVENTS.DASHBOARD_INVALIDATED, { delay: 600 });

  const s = stats.data?.data;
  const top = topProducts.data?.data?.products || [];
  const orders = recentOrders.data?.data?.orders || [];
  const lowStockItems = lowStock.data?.data?.products || [];

  const statusSlices = useMemo(
    () =>
      withPaletteColors(
        (statusBreakdown.data?.data?.breakdown || []).map((r) => ({ label: titleCase(r.status), value: r.count })),
      ),
    [statusBreakdown.data],
  );

  const paymentSlices = useMemo(
    () =>
      withPaletteColors(
        (paymentPreference.data?.data?.breakdown || []).map((r) => ({ label: r.label, value: r.count })),
      ),
    [paymentPreference.data],
  );

  const topStatus = statusSlices[0]?.label;
  const topPayment = paymentSlices[0]?.label;

  return (
    <Box>
      <PageHeader
        title="Dashboard"
        subtitle="Store performance at a glance"
        action={
          <Button variant="contained" size="large" startIcon={<AddIcon />} onClick={() => navigate('/products/new')}>
            Upload Product
          </Button>
        }
      />

      {failed.length > 0 && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          action={
            <Button size="small" color="inherit" startIcon={<RefreshIcon />} onClick={retryFailed}>
              Retry
            </Button>
          }
        >
          {failed.length === sections.length
            ? failed[0].error?.message || 'The dashboard could not be loaded.'
            : `${failed.length} of ${sections.length} dashboard panels failed to load — the figures below are incomplete.`}
        </Alert>
      )}

      {s?.products?.outOfStock > 0 && (
        <Alert
          severity="warning"
          icon={<WarningIcon />}
          sx={{ mb: 3 }}
          action={
            <Button size="small" component={RouterLink} to="/products?availability=out_of_stock">
              Review
            </Button>
          }
        >
          {s.products.outOfStock} product(s) are out of stock and cannot be ordered.
        </Alert>
      )}

      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            loading={stats.loading}
            title="Total revenue"
            value={formatPrice(s?.revenue?.total)}
            trend={s?.revenue?.growthPercent}
            icon={<CurrencyRupeeIcon />}
            color="success"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            loading={stats.loading}
            title="Total orders"
            value={formatNumber(s?.orders?.total)}
            caption={`${s?.orders?.pending || 0} awaiting fulfilment`}
            icon={<ReceiptIcon />}
            color="primary"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            loading={stats.loading}
            title="Products"
            value={formatNumber(s?.products?.total)}
            caption={
              s?.products?.totalSkus
                ? `${s.products.published || 0} published · ${s.products.totalSkus} SKUs · ${s.products.lowStockSkus || 0} low`
                : `${s?.products?.published || 0} published · ${s?.products?.lowStock || 0} low stock`
            }
            icon={<InventoryIcon />}
            color="info"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            loading={stats.loading}
            title="Customers"
            value={formatNumber(s?.users?.total)}
            caption={`${s?.users?.newLast30Days || 0} joined in the last 30 days`}
            icon={<PeopleIcon />}
            color="warning"
          />
        </Grid>
      </Grid>

      <Grid container spacing={2.5}>
        <Grid size={12}>
          <RevenueTrendCard />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <BreakdownPieCard
            title="Order status"
            donut
            data={statusSlices}
            loading={statusBreakdown.loading}
            footnote={topStatus ? `Most orders are currently "${topStatus}".` : undefined}
            action={<RangeControls range={statusRange} onRefresh={statusBreakdown.refetch} />}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <BreakdownPieCard
            title="Payment preference"
            data={paymentSlices}
            loading={paymentPreference.loading}
            footnote={topPayment ? `Customers prefer ${topPayment} for payments.` : undefined}
            action={<RangeControls range={paymentRange} onRefresh={paymentPreference.refetch} />}
          />
        </Grid>

        <Grid size={12}>
          <TopProductsCard
            products={top}
            loading={topProducts.loading}
            action={<RangeControls range={topRange} onRefresh={topProducts.refetch} />}
          />
        </Grid>

        <Grid size={{ xs: 12, lg: 7 }}>
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6">Recent orders</Typography>
                <Button size="small" component={RouterLink} to="/orders">
                  View all
                </Button>
              </Stack>
            </CardContent>
            <Divider />

            <Box>
              {recentOrders.loading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <Box key={i} sx={{ px: 2, py: 1.5 }}>
                    <Skeleton height={22} />
                  </Box>
                ))}

              {!recentOrders.loading && recentOrders.error && (
                <ErrorState
                  title="Couldn't load recent orders"
                  message={recentOrders.error.message}
                  onRetry={recentOrders.refetch}
                />
              )}

              {!recentOrders.loading && !recentOrders.error && orders.length === 0 && (
                <Typography variant="body2" color="text.disabled" sx={{ py: 5, textAlign: 'center' }}>
                  No orders yet
                </Typography>
              )}

              {orders.map((order) => (
                <Stack
                  key={order._id}
                  direction="row"
                  alignItems="center"
                  spacing={2}
                  onClick={() => navigate(`/orders/${order._id}`)}
                  sx={{
                    px: 2,
                    py: 1.5,
                    cursor: 'pointer',
                    borderBottom: 1,
                    borderColor: 'divider',
                    '&:last-of-type': { borderBottom: 0 },
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" fontWeight={700} noWrap>
                      {order.orderNumber}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {order.user?.name || 'Guest'} · {formatDate(order.createdAt)}
                    </Typography>
                  </Box>
                  <StatusChip status={order.orderStatus} />
                  <Typography variant="body2" fontWeight={700} sx={{ minWidth: 90, textAlign: 'right' }}>
                    {formatPrice(order.pricing.total)}
                  </Typography>
                </Stack>
              ))}
            </Box>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Box>
                  <Typography variant="h6">Low stock alerts</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Restock these before they sell out
                  </Typography>
                </Box>
                <Button size="small" component={RouterLink} to="/products">
                  Manage
                </Button>
              </Stack>
            </CardContent>
            <Divider />

            <Box>
              {lowStock.loading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <Box key={i} sx={{ px: 2, py: 1.5 }}>
                    <Skeleton height={22} />
                  </Box>
                ))}

              {!lowStock.loading && lowStock.error && (
                <ErrorState
                  title="Couldn't load stock alerts"
                  message={lowStock.error.message}
                  onRetry={lowStock.refetch}
                />
              )}

              {!lowStock.loading && !lowStock.error && lowStockItems.length === 0 && (
                <Typography variant="body2" color="text.disabled" sx={{ py: 5, textAlign: 'center' }}>
                  All products are well stocked
                </Typography>
              )}

              {/* Rows can be a whole product or a single SKU — a product sitting on 200
                  units can still be unsellable in size L, and that is the row worth acting
                  on, so the variant is named and the link goes to its parent product. */}
              {lowStockItems.map((product) => (
                <Stack
                  key={product._id}
                  direction="row"
                  alignItems="center"
                  spacing={1.5}
                  onClick={() => navigate(`/products/${product.productId || product._id}/edit`)}
                  sx={{
                    px: 2,
                    py: 1.25,
                    cursor: 'pointer',
                    borderBottom: 1,
                    borderColor: 'divider',
                    '&:last-of-type': { borderBottom: 0 },
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Avatar
                    variant="rounded"
                    src={thumb(product.images?.[0]?.url, 80)}
                    sx={{ width: 40, height: 40 }}
                  />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" noWrap>
                      {product.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap display="block">
                      {product.variantLabel && (
                        <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
                          {product.variantLabel} ·{' '}
                        </Box>
                      )}
                      {formatPrice(product.finalPrice)}
                    </Typography>
                  </Box>
                  <Chip
                    label={product.stock === 0 ? 'Out of stock' : `${product.stock} left`}
                    size="small"
                    color={product.stock === 0 ? 'error' : 'warning'}
                  />
                </Stack>
              ))}
            </Box>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
