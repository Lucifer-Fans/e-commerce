import { useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Avatar from '@mui/material/Avatar';
import LinearProgress from '@mui/material/LinearProgress';
import Timeline from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';

import EditIcon from '@mui/icons-material/EditOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBackIosNew';

import { orderApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import { useLiveRefetch, useRealtimeRoom } from '../realtime/useRealtime';
import { ORDER_EVENTS, rooms } from '../realtime/events';
import { formatPrice, formatDateTime, thumb, titleCase } from '../utils/format';
import PageHeader from '../components/common/PageHeader';
import StatusChip from '../components/common/StatusChip';
import ErrorState from '../components/common/ErrorState';
import UpdateStatusDialog from '../components/orders/UpdateStatusDialog';

function InfoCard({ title, children, action }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" textTransform="uppercase" letterSpacing={0.4}>
            {title}
          </Typography>
          {action}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [updating, setUpdating] = useState(false);

  const { data, loading, error, refetch } = useFetch(
    useCallback(() => orderApi.detail(id), [id]),
    [id]
  );

  // Two admins can have the same order open, and the buyer may cancel it from the
  // storefront — either way this view follows along.
  useRealtimeRoom(rooms.order(id));
  useLiveRefetch(refetch, ORDER_EVENTS, {
    filter: (payload) => !payload?.order?._id || payload.order._id === id,
  });

  const order = data?.data?.order;

  if (loading) return <LinearProgress />;
  if (error || !order) {
    return <ErrorState title="Order not found" message={error?.message} onRetry={refetch} />;
  }

  const address = order.shippingAddress;
  const pricing = order.pricing;

  // Subtotal is billed from the discounted selling price, so the coupon is the
  // only deduction: subtotal − coupon + shipping = total. The product discount
  // was banked before the order existed; it is reported under the total as a
  // saving, never as a row, or this column stops matching what was charged.
  const priceRows = [
    ['Subtotal', formatPrice(pricing.subtotal, true)],
    pricing.couponDiscount > 0 && [
      `Coupon (${pricing.couponCode})`,
      `− ${formatPrice(pricing.couponDiscount, true)}`,
    ],
    ['Shipping', pricing.shipping ? formatPrice(pricing.shipping, true) : 'FREE'],
  ].filter(Boolean);

  const savings = (pricing.discount || 0) + (pricing.couponDiscount || 0);
  // Orders placed before `mrpTotal` was stored still carry the gap it came from.
  const mrpTotal = pricing.mrpTotal || pricing.subtotal + (pricing.discount || 0);

  return (
    <Box>
      <PageHeader
        title={order.orderNumber}
        subtitle={`Placed ${formatDateTime(order.createdAt)}`}
        breadcrumbs={[{ label: 'Orders', to: '/orders' }, { label: order.orderNumber }]}
        action={
          <Stack direction="row" spacing={1.5}>
            <Button color="inherit" startIcon={<ArrowBackIcon sx={{ fontSize: 13 }} />} onClick={() => navigate('/orders')}>
              Back
            </Button>
            <Button
              variant="contained"
              startIcon={<EditIcon />}
              disabled={['cancelled', 'returned'].includes(order.orderStatus)}
              onClick={() => setUpdating(true)}
            >
              Update status
            </Button>
          </Stack>
        }
      />

      <Stack direction="row" spacing={1.5} sx={{ mb: 3 }}>
        <StatusChip status={order.orderStatus} />
        <StatusChip status={order.paymentStatus} kind="payment" />
        <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
          {order.paymentMethod === 'cod' ? 'Cash on delivery' : 'Online (Razorpay)'}
        </Typography>
      </Stack>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card sx={{ mb: 2.5 }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" textTransform="uppercase" letterSpacing={0.4}>
                Items ({order.items.length})
              </Typography>
            </CardContent>
            <Divider />

            {order.items.map((item, index) => (
              <Stack
                key={index}
                direction="row"
                spacing={2}
                alignItems="center"
                sx={{ px: 2.5, py: 2, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}
              >
                <Avatar variant="rounded" src={thumb(item.image, 96)} sx={{ width: 56, height: 56 }} />

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600}>
                    {item.name}
                  </Typography>
                  {/* The SKU that must actually be picked, packed and — if returned — restocked. */}
                  {item.variantLabel && (
                    <Typography variant="caption" display="block" fontWeight={700} color="text.primary">
                      {item.variantLabel}
                      {item.variantSku && (
                        <Box component="span" sx={{ ml: 1, fontWeight: 400, fontFamily: 'monospace', color: 'text.secondary' }}>
                          {item.variantSku}
                        </Box>
                      )}
                      {item.weight?.value && (
                        <Box component="span" sx={{ ml: 1, fontWeight: 400, color: 'text.secondary' }}>
                          · {item.weight.value}
                          {item.weight.unit || 'g'}
                        </Box>
                      )}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    {[item.brand, item.categoryName, item.subCategoryName].filter(Boolean).join(' · ')}
                  </Typography>
                  <Typography variant="caption" display="block" color="text.secondary">
                    {formatPrice(item.finalPrice, true)} × {item.quantity}
                    {item.discountPercent > 0 && ` · ${Math.round(item.discountPercent)}% off`}
                  </Typography>
                </Box>

                <Typography variant="body2" fontWeight={700}>
                  {formatPrice(item.lineTotal, true)}
                </Typography>
              </Stack>
            ))}
          </Card>

          <InfoCard title="Status history">
            <Timeline dense disablePadding>
              {[...(order.statusHistory || [])].reverse().map((entry, index) => (
                <ListItem key={index} disableGutters sx={{ py: 0.75 }}>
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center">
                        <StatusChip status={entry.status} />
                        <Typography variant="caption" color="text.secondary">
                          {formatDateTime(entry.changedAt)}
                        </Typography>
                      </Stack>
                    }
                    secondary={entry.note}
                    secondaryTypographyProps={{ variant: 'caption', sx: { mt: 0.5 } }}
                  />
                </ListItem>
              ))}
            </Timeline>
          </InfoCard>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2.5}>
            <InfoCard title="Customer">
              <Typography variant="body2" fontWeight={700}>
                {order.user?.name || address.fullName}
              </Typography>
              {order.user?.email && (
                <Typography variant="body2" color="text.secondary">
                  {order.user.email}
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                {order.user?.phone || address.phone}
              </Typography>
            </InfoCard>

            <InfoCard title="Shipping address">
              <Typography variant="body2" fontWeight={700}>
                {address.fullName}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {address.addressLine1}
                {address.addressLine2 && `, ${address.addressLine2}`}
                {address.landmark && `, ${address.landmark}`}
                <br />
                {address.city}, {address.state} — {address.pincode}
                <br />
                {address.country}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                Phone: {address.phone}
              </Typography>
            </InfoCard>

            {(order.trackingNumber || order.expectedDeliveryDate) && (
              <InfoCard title="Shipment">
                {order.trackingNumber && (
                  <Typography variant="body2">
                    Tracking: <strong>{order.trackingNumber}</strong>
                  </Typography>
                )}
                {order.courierPartner && (
                  <Typography variant="body2" color="text.secondary">
                    Courier: {order.courierPartner}
                  </Typography>
                )}
                {order.expectedDeliveryDate && (
                  <Typography variant="body2" color="text.secondary">
                    Expected: {formatDateTime(order.expectedDeliveryDate)}
                  </Typography>
                )}
              </InfoCard>
            )}

            <InfoCard title="Payment summary">
              <Stack spacing={1}>
                {priceRows.map(([label, value]) => (
                  <Stack key={label} direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">
                      {label}
                    </Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {value}
                    </Typography>
                  </Stack>
                ))}
              </Stack>

              <Divider sx={{ my: 1.5, borderStyle: 'dashed' }} />

              <Stack direction="row" justifyContent="space-between">
                <Typography variant="subtitle2" fontWeight={800}>
                  Total
                </Typography>
                <Typography variant="subtitle2" fontWeight={800}>
                  {formatPrice(pricing.total, true)}
                </Typography>
              </Stack>

              {savings > 0 && (
                <Typography
                  variant="caption"
                  fontWeight={600}
                  sx={{ mt: 1.5, display: 'block', color: 'success.main' }}
                >
                  Saved {formatPrice(savings, true)} · MRP {formatPrice(mrpTotal, true)}
                </Typography>
              )}

              {order.payment && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
                  {titleCase(order.payment.status)}
                  {order.payment.method && ` · ${order.payment.method.toUpperCase()}`}
                  {order.payment.razorpayPaymentId && ` · ${order.payment.razorpayPaymentId}`}
                </Typography>
              )}
            </InfoCard>
          </Stack>
        </Grid>
      </Grid>

      {updating && (
        <UpdateStatusDialog
          order={order}
          onClose={() => setUpdating(false)}
          onUpdated={() => {
            setUpdating(false);
            refetch();
          }}
        />
      )}
    </Box>
  );
}
