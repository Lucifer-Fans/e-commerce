import { useCallback, useState } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import InputAdornment from '@mui/material/InputAdornment';
import Typography from '@mui/material/Typography';

import SearchIcon from '@mui/icons-material/Search';
import PendingIcon from '@mui/icons-material/PendingActionsOutlined';
import ApprovedIcon from '@mui/icons-material/HowToRegOutlined';
import RejectedIcon from '@mui/icons-material/PersonOffOutlined';

import { userApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import useDebounce from '../hooks/useDebounce';
import { useLiveRefetch } from '../realtime/useRealtime';
import { EVENTS } from '../realtime/events';
import { formatDate, formatDateTime, formatNumber } from '../utils/format';
import PageHeader from '../components/common/PageHeader';
import StatCard from '../components/common/StatCard';
import DataTable from '../components/common/DataTable';
import ResetFiltersButton from '../components/common/ResetFiltersButton';
import ReactivationRequestDialog from '../components/users/ReactivationRequestDialog';

const STATUS_COLOR = { pending: 'warning', approved: 'success', rejected: 'error' };

/**
 * The queue where a closed account comes back — or does not.
 *
 * Every row here has already proven three things: it opened a single-use link
 * sent to the registered address, it answered a one-time code sent to that same
 * address, and it re-typed the name and mobile number the account actually holds.
 * None of that is a decision, which is why this screen exists: what is left is
 * whether we want the customer back, and only a person can answer it.
 *
 * Pending rows lead, because they are the only ones with a clock on them — the
 * customer has been told 2-3 working days.
 */
export default function ReactivationRequests() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [openId, setOpenId] = useState(null);

  const debouncedSearch = useDebounce(search, 400);

  const query = useFetch(
    useCallback(
      () =>
        userApi.reactivationRequests({
          page,
          limit,
          status,
          search: debouncedSearch || undefined,
        }),
      [page, limit, status, debouncedSearch]
    ),
    [page, limit, status, debouncedSearch]
  );

  // A request submitted while this screen is open should appear on it.
  useLiveRefetch(query.refetch, EVENTS.REACTIVATION_REQUEST_CHANGED);

  const requests = query.data?.data?.requests || [];
  const stats = query.data?.data?.stats || {};
  const meta = query.data?.meta;

  const columns = [
    {
      key: 'name',
      label: 'Customer',
      minWidth: 220,
      render: (row) => (
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Avatar
            src={row.user?.avatar?.url}
            slotProps={{ img: { referrerPolicy: 'no-referrer' } }}
            sx={{ width: 38, height: 38, bgcolor: 'primary.main', fontSize: 15 }}
          >
            {row.name?.charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {row.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {row.email}
            </Typography>
          </Box>
        </Stack>
      ),
    },
    {
      key: 'phone',
      label: 'Mobile Number',
      minWidth: 130,
      render: (row) => (
        <Typography variant="body2" color={row.phone ? 'text.primary' : 'text.disabled'}>
          {row.phone || 'Not provided'}
        </Typography>
      ),
    },
    {
      key: 'deactivatedAt',
      label: 'Deactivated',
      minWidth: 160,
      render: (row) => (
        <Box>
          <Typography variant="body2">{formatDate(row.deactivatedAt)}</Typography>
          <Typography variant="caption" color="text.secondary">
            {row.deactivationReason || 'No reason recorded'}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'requestedAt',
      label: 'Requested',
      minWidth: 150,
      render: (row) => <Typography variant="body2">{formatDateTime(row.requestedAt)}</Typography>,
    },
    {
      key: 'verification',
      label: 'Verified',
      align: 'center',
      minWidth: 130,
      render: (row) => (
        <Chip
          label={row.verification?.emailOtpVerifiedAt ? 'Email OTP + details' : 'Incomplete'}
          size="small"
          color={row.verification?.emailOtpVerifiedAt ? 'success' : 'default'}
          variant="outlined"
        />
      ),
    },
    {
      key: 'status',
      label: 'Request',
      align: 'center',
      minWidth: 110,
      render: (row) => (
        <Chip
          label={row.status}
          size="small"
          color={STATUS_COLOR[row.status] || 'default'}
          sx={{ textTransform: 'capitalize', fontWeight: 700 }}
        />
      ),
    },
    {
      key: 'actions',
      label: 'Action',
      align: 'center',
      width: 120,
      render: (row) => (
        <Button size="small" variant={row.status === 'pending' ? 'contained' : 'outlined'}>
          {row.status === 'pending' ? 'Review' : 'View'}
        </Button>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Account Reactivation Requests"
        subtitle="Customers who closed their account and have verified their identity to come back."
        breadcrumbs={[{ label: 'Users', to: '/users' }, { label: 'Reactivation Requests' }]}
      />

      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatCard
            title="Awaiting Review"
            value={formatNumber(stats.pending)}
            icon={<PendingIcon />}
            color="warning"
            caption="Promised within 2-3 working days"
            loading={query.loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatCard
            title="Approved"
            value={formatNumber(stats.approved)}
            icon={<ApprovedIcon />}
            color="success"
            caption="Accounts returned to active"
            loading={query.loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <StatCard
            title="Rejected"
            value={formatNumber(stats.rejected)}
            icon={<RejectedIcon />}
            color="error"
            caption="Still deactivated"
            loading={query.loading}
          />
        </Grid>
      </Grid>

      <DataTable
        columns={columns}
        rows={requests}
        loading={query.loading}
        page={page}
        limit={limit}
        total={meta?.total || 0}
        onPageChange={setPage}
        onLimitChange={(value) => {
          setLimit(value);
          setPage(1);
        }}
        onRowClick={(row) => setOpenId(row._id)}
        verticalAlign="top"
        emptyTitle="No reactivation requests"
        emptyMessage="Requests appear here once a customer verifies their identity from the link we email them."
        toolbar={
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            <TextField
              placeholder="Search by name, email or phone…"
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
              label="Status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="approved">Approved</MenuItem>
              <MenuItem value="rejected">Rejected</MenuItem>
              <MenuItem value="all">All requests</MenuItem>
            </TextField>

            <ResetFiltersButton
              onClick={() => {
                setSearch('');
                setStatus('pending');
                setPage(1);
              }}
            />
          </Stack>
        }
      />

      {openId && (
        <ReactivationRequestDialog
          requestId={openId}
          onClose={() => setOpenId(null)}
          onDecided={() => {
            setOpenId(null);
            query.refetch();
          }}
        />
      )}
    </Box>
  );
}
