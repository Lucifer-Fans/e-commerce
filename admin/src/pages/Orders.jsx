import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import InputAdornment from '@mui/material/InputAdornment';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Button from '@mui/material/Button';

import SearchIcon from '@mui/icons-material/Search';
import VisibilityIcon from '@mui/icons-material/VisibilityOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';

import { orderApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import useDebounce from '../hooks/useDebounce';
import { useLiveRefetch } from '../realtime/useRealtime';
import { ORDER_EVENTS } from '../realtime/events';
import { formatPrice, formatDate, titleCase } from '../utils/format';
import { ORDER_STATUSES } from '../utils/constants';
import PageHeader from '../components/common/PageHeader';
import DataTable from '../components/common/DataTable';
import StatusChip from '../components/common/StatusChip';
import UpdateStatusDialog from '../components/orders/UpdateStatusDialog';

export default function Orders() {
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [paymentStatus, setPaymentStatus] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [updating, setUpdating] = useState(null);

  const debouncedSearch = useDebounce(search, 400);

  const query = useFetch(
    useCallback(
      () =>
        orderApi.list({
          page,
          limit,
          status,
          paymentStatus,
          search: debouncedSearch || undefined,
          from: from || undefined,
          to: to || undefined,
        }),
      [page, limit, status, paymentStatus, debouncedSearch, from, to]
    ),
    [page, limit, status, paymentStatus, debouncedSearch, from, to]
  );

  // New orders appear at the top of page 1 without anyone reaching for refresh.
  useLiveRefetch(query.refetch, ORDER_EVENTS);

  const orders = query.data?.data?.orders || [];
  const meta = query.data?.meta;

  const columns = [
    {
      key: 'orderNumber',
      label: 'Order',
      minWidth: 140,
      render: (row) => (
        <Box>
          <Typography variant="body2" fontWeight={700}>
            {row.orderNumber}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatDate(row.createdAt)}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'user',
      label: 'User Name',
      minWidth: 160,
      render: (row) => (
        <Box>
          <Typography variant="body2" fontWeight={600} noWrap>
            {row.user?.name || row.shippingAddress?.fullName || 'Guest'}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {row.user?.email || row.shippingAddress?.phone}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'product',
      label: 'Product Name',
      minWidth: 220,
      render: (row) => (
        <Box sx={{ maxWidth: 260 }}>
          <Typography variant="body2" noWrap title={row.items[0]?.name}>
            {row.items[0]?.name || '—'}
          </Typography>
          {row.items.length > 1 && (
            <Typography variant="caption" color="text.secondary">
              +{row.items.length - 1} more item(s)
            </Typography>
          )}
        </Box>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      minWidth: 130,
      render: (row) => (
        <Typography variant="body2" color="text.secondary" noWrap>
          {row.items[0]?.categoryName || '—'}
        </Typography>
      ),
    },
    {
      key: 'subCategory',
      label: 'Sub-category',
      minWidth: 130,
      render: (row) => (
        <Typography variant="body2" color="text.secondary" noWrap>
          {row.items[0]?.subCategoryName || '—'}
        </Typography>
      ),
    },
    {
      key: 'quantity',
      label: 'Qty',
      align: 'center',
      render: (row) => (
        <Typography variant="body2" fontWeight={600}>
          {row.items.reduce((sum, item) => sum + item.quantity, 0)}
        </Typography>
      ),
    },
    {
      key: 'paymentStatus',
      label: 'Payment',
      align: 'center',
      render: (row) => (
        <Stack spacing={0.5} alignItems="center">
          <StatusChip status={row.paymentStatus} kind="payment" />
          <Typography variant="caption" color="text.secondary">
            {row.paymentMethod === 'cod' ? 'COD' : 'Online (Razorpay)'}
          </Typography>
        </Stack>
      ),
    },
    {
      key: 'orderStatus',
      label: 'Order Status',
      align: 'center',
      render: (row) => <StatusChip status={row.orderStatus} />,
    },
    {
      key: 'total',
      label: 'Final Price',
      align: 'right',
      render: (row) => (
        <Typography variant="body2" fontWeight={700}>
          {formatPrice(row.pricing.total)}
        </Typography>
      ),
    },
    {
      key: 'actions',
      label: 'Action',
      align: 'center',
      width: 110,
      render: (row) => (
        <Stack direction="row" spacing={0.25} justifyContent="center">
          <Tooltip title="View order details">
            <IconButton size="small" color="primary" onClick={() => navigate(`/orders/${row._id}`)}>
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Update status">
            <span>
              <IconButton
                size="small"
                disabled={['cancelled', 'returned'].includes(row.orderStatus)}
                onClick={() => setUpdating(row)}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  const resetFilters = () => {
    setSearch('');
    setStatus('all');
    setPaymentStatus('all');
    setFrom('');
    setTo('');
    setPage(1);
  };

  return (
    <Box>
      <PageHeader
        title="Orders"
        subtitle={`${meta?.total ?? 0} order(s) placed`}
        breadcrumbs={[{ label: 'Orders' }]}
      />

      <DataTable
        columns={columns}
        rows={orders}
        loading={query.loading}
        page={page}
        limit={limit}
        total={meta?.total || 0}
        onPageChange={setPage}
        onLimitChange={(value) => {
          setLimit(value);
          setPage(1);
        }}
        emptyTitle="No orders found"
        emptyMessage="Orders will appear here as soon as customers start buying."
        toolbar={
          <Stack
            direction={{ xs: 'column', lg: 'row' }}
            spacing={1.5}
            sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            <TextField
              placeholder="Search order no., product or customer…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              sx={{ flex: 1, minWidth: 220 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              select
              label="Order status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              sx={{ minWidth: 165 }}
            >
              <MenuItem value="all">All statuses</MenuItem>
              {ORDER_STATUSES.map((value) => (
                <MenuItem key={value} value={value}>
                  {titleCase(value)}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Payment"
              value={paymentStatus}
              onChange={(e) => {
                setPaymentStatus(e.target.value);
                setPage(1);
              }}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="all">All payments</MenuItem>
              {['pending', 'paid', 'failed', 'refunded'].map((value) => (
                <MenuItem key={value} value={value}>
                  {titleCase(value)}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              type="date"
              label="From"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 145 }}
            />
            <TextField
              type="date"
              label="To"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 145 }}
            />

            <Button color="inherit" onClick={resetFilters}>
              Reset
            </Button>
          </Stack>
        }
      />

      <UpdateStatusDialog
        order={updating}
        onClose={() => setUpdating(null)}
        onUpdated={() => {
          setUpdating(null);
          query.refetch();
        }}
      />
    </Box>
  );
}
