import { useCallback, useState } from 'react';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import InputAdornment from '@mui/material/InputAdornment';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Button from '@mui/material/Button';

import SearchIcon from '@mui/icons-material/Search';

import { userApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import { useLiveRefetch } from '../realtime/useRealtime';
import { EVENTS } from '../realtime/events';
import useDebounce from '../hooks/useDebounce';
import { formatDate, formatPrice } from '../utils/format';
import PageHeader from '../components/common/PageHeader';
import DataTable from '../components/common/DataTable';
import StatusChip from '../components/common/StatusChip';
import ConfirmDialog from '../components/common/ConfirmDialog';

export default function Users() {
  const { enqueueSnackbar } = useSnackbar();

  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pendingToggle, setPendingToggle] = useState(null);

  const debouncedSearch = useDebounce(search, 400);

  const query = useFetch(
    useCallback(
      () => userApi.list({ page, limit, role, status, search: debouncedSearch || undefined }),
      [page, limit, role, status, debouncedSearch]
    ),
    [page, limit, role, status, debouncedSearch]
  );

  // Registrations and status changes land in the table as they happen.
  useLiveRefetch(query.refetch, EVENTS.USER_CHANGED);

  const users = query.data?.data?.users || [];
  const meta = query.data?.meta;

  const applyToggle = async () => {
    const next = pendingToggle.status === 'active' ? 'blocked' : 'active';
    try {
      await userApi.setStatus(pendingToggle._id, next);
      enqueueSnackbar(next === 'blocked' ? 'User blocked' : 'User reactivated', { variant: 'success' });
      query.refetch();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not update the user', { variant: 'error' });
    }
  };

  const changeRole = async (user, nextRole) => {
    try {
      await userApi.setRole(user._id, nextRole);
      enqueueSnackbar(`Role changed to ${nextRole}`, { variant: 'success' });
      query.refetch();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not change the role', { variant: 'error' });
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Name',
      minWidth: 200,
      render: (row) => (
        <Stack direction="row" spacing={1.5} alignItems="center">
          {/* no-referrer: Google-hosted profile pictures 403 when a referrer is sent. */}
          <Avatar
            src={row.avatar?.url}
            slotProps={{ img: { referrerPolicy: 'no-referrer' } }}
            sx={{ width: 38, height: 38, bgcolor: 'primary.main', fontSize: 15 }}
          >
            {row.name?.charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {row.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {row.orderCount} order(s) · {formatPrice(row.totalSpent)}
            </Typography>
          </Box>
        </Stack>
      ),
    },
    {
      key: 'email',
      label: 'Email',
      minWidth: 200,
      render: (row) => (
        <Typography variant="body2" noWrap>
          {row.email}
        </Typography>
      ),
    },
    {
      key: 'phone',
      label: 'Contact Number',
      minWidth: 140,
      render: (row) => (
        <Typography variant="body2" color={row.phone ? 'text.primary' : 'text.disabled'}>
          {row.phone || 'Not provided'}
        </Typography>
      ),
    },
    {
      key: 'createdAt',
      label: 'Registration Date',
      minWidth: 140,
      render: (row) => <Typography variant="body2">{formatDate(row.createdAt)}</Typography>,
    },
    {
      key: 'status',
      label: 'Status',
      align: 'center',
      render: (row) => <StatusChip status={row.status} kind="user" />,
    },
    {
      key: 'role',
      label: 'Role',
      align: 'center',
      minWidth: 130,
      render: (row) => (
        <TextField
          select
          size="small"
          value={row.role}
          onChange={(e) => changeRole(row, e.target.value)}
          sx={{ minWidth: 110 }}
        >
          <MenuItem value="user">User</MenuItem>
          <MenuItem value="admin">Admin</MenuItem>
        </TextField>
      ),
    },
    {
      key: 'actions',
      label: 'Active',
      align: 'center',
      width: 90,
      render: (row) => (
        <Tooltip title={row.status === 'active' ? 'Block this user' : 'Reactivate this user'}>
          <Switch
            size="small"
            checked={row.status === 'active'}
            onChange={() => setPendingToggle(row)}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Users"
        subtitle={`${meta?.total ?? 0} registered account(s)`}
        breadcrumbs={[{ label: 'Users' }]}
      />

      <DataTable
        columns={columns}
        rows={users}
        loading={query.loading}
        page={page}
        limit={limit}
        total={meta?.total || 0}
        onPageChange={setPage}
        onLimitChange={(value) => {
          setLimit(value);
          setPage(1);
        }}
        emptyTitle="No users found"
        emptyMessage="Try a different search term or clear the filters."
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
              label="Role"
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setPage(1);
              }}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="all">All roles</MenuItem>
              <MenuItem value="user">Users</MenuItem>
              <MenuItem value="admin">Admins</MenuItem>
            </TextField>

            <TextField
              select
              label="Status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="all">All statuses</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="blocked">Blocked</MenuItem>
            </TextField>

            <Button
              color="inherit"
              onClick={() => {
                setSearch('');
                setRole('all');
                setStatus('all');
                setPage(1);
              }}
            >
              Reset
            </Button>
          </Stack>
        }
      />

      <ConfirmDialog
        open={Boolean(pendingToggle)}
        onClose={() => setPendingToggle(null)}
        onConfirm={applyToggle}
        danger={pendingToggle?.status === 'active'}
        title={pendingToggle?.status === 'active' ? 'Block this user?' : 'Reactivate this user?'}
        message={
          pendingToggle?.status === 'active'
            ? `${pendingToggle?.name} will be signed out everywhere and cannot log in until reactivated.`
            : `${pendingToggle?.name} will be able to log in and shop again.`
        }
        confirmLabel={pendingToggle?.status === 'active' ? 'Block user' : 'Reactivate'}
      />
    </Box>
  );
}
