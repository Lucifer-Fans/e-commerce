import { useCallback, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import InputAdornment from '@mui/material/InputAdornment';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import Tooltip from '@mui/material/Tooltip';
import Button from '@mui/material/Button';

import SearchIcon from '@mui/icons-material/Search';
import ReactivationIcon from '@mui/icons-material/HowToRegOutlined';

import { userApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import { useLiveRefetch } from '../realtime/useRealtime';
import { EVENTS } from '../realtime/events';
import useDebounce from '../hooks/useDebounce';
import { formatDate, formatDateTime, formatPrice } from '../utils/format';
import PageHeader from '../components/common/PageHeader';
import DataTable from '../components/common/DataTable';
import StatusChip from '../components/common/StatusChip';
import ConfirmDialog from '../components/common/ConfirmDialog';
import ResetFiltersButton from '../components/common/ResetFiltersButton';

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

  /**
   * An account its owner closed is not this control's to move.
   *
   * The server refuses it too — that is the check that matters — but a chip that
   * silently does nothing when clicked is worse than one that says why, so the
   * click is intercepted here and answered with the place the decision actually
   * gets made.
   */
  const SELF_CLOSED = ['deactivated', 'reactivation-pending'];

  const onStatusClick = (row) => {
    if (!SELF_CLOSED.includes(row.status)) {
      setPendingToggle(row);
      return;
    }
    enqueueSnackbar(
      row.status === 'reactivation-pending'
        ? `${row.name} has asked to come back — approve or reject it under Reactivation Requests.`
        : `${row.name} deactivated this account. It can only be reopened by approving a reactivation request.`,
      { variant: 'info' }
    );
  };

  const applyToggle = async (reason) => {
    const next = pendingToggle.status === 'active' ? 'blocked' : 'active';
    try {
      await userApi.setStatus(pendingToggle._id, next, next === 'blocked' ? reason : undefined);
      enqueueSnackbar(next === 'blocked' ? 'User blocked' : 'User reactivated', { variant: 'success' });
      query.refetch();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not update the user', { variant: 'error' });
    }
  };

  const changeRole = async (user, nextRole) => {
    try {
      await userApi.setRole(user._id, nextRole);
      enqueueSnackbar(`${user.name} role changed to ${nextRole}`, { variant: 'success' });
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
          // Promoting a closed account to admin would give it a role it cannot
          // use and one more thing to undo on the way back.
          disabled={SELF_CLOSED.includes(row.status)}
          sx={{ minWidth: 110 }}
        >
          <MenuItem value="user">User</MenuItem>
          <MenuItem value="admin">Admin</MenuItem>
        </TextField>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      align: 'center',
      minWidth: 150,
      render: (row) => {
        const selfClosed = SELF_CLOSED.includes(row.status);

        /*
         * A closed account keeps *why* and *when* on the record, and this column is
         * where an admin meets that first — before they think to open the
         * reactivation queue, and for the accounts that never reach it because the
         * customer simply left. The chip alone would say a person is gone without
         * saying anything about it.
         */
        return (
          <Tooltip
            title={
              selfClosed
                ? 'Closed by the customer — reopened only from Reactivation Requests'
                : 'Click to toggle active / blocked'
            }
          >
            <Box
              component="span"
              onClick={() => onStatusClick(row)}
              sx={{ cursor: selfClosed ? 'help' : 'pointer', display: 'inline-block' }}
            >
              <StatusChip status={row.status} kind="user" />

              {selfClosed && row.deactivation?.at && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 0.5, maxWidth: 200, whiteSpace: 'normal' }}
                >
                  {formatDateTime(row.deactivation.at)}
                  {row.deactivation.reason ? ` · ${row.deactivation.reason}` : ''}
                </Typography>
              )}
            </Box>
          </Tooltip>
        );
      },
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Users"
        subtitle={`${meta?.total ?? 0} registered account(s)`}
        breadcrumbs={[{ label: 'Users' }]}
        action={
          <Button
            component={RouterLink}
            to="/reactivation-requests"
            variant="outlined"
            startIcon={<ReactivationIcon />}
          >
            Reactivation Requests
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={users}
        loading={query.loading}
        verticalAlign="top"
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
              {/* Covers both halves of a self-closure — with a request pending
                  and without — because "who has left" is one question. */}
              <MenuItem value="deactivated">Deactivated</MenuItem>
            </TextField>

            <ResetFiltersButton
              onClick={() => {
                setSearch('');
                setRole('all');
                setStatus('all');
                setPage(1);
              }}
            />
          </Stack>
        }
      />

      <ConfirmDialog
        open={Boolean(pendingToggle)}
        onClose={() => setPendingToggle(null)}
        onConfirm={applyToggle}
        danger={pendingToggle?.status === 'active'}
        title={
          pendingToggle?.status === 'active'
            ? `Block ${pendingToggle?.name}?`
            : `Reactivate ${pendingToggle?.name}?`
        }
        message={
          pendingToggle?.status === 'active'
            ? `${pendingToggle?.name} will be signed out everywhere and cannot log in until unblocked.`
            : `${pendingToggle?.name} will be able to log in and shop again.`
        }
        confirmLabel={pendingToggle?.status === 'active' ? 'Block user' : 'Reactivate'}
        reasonLabel={pendingToggle?.status === 'active' ? 'Reason for blocking' : undefined}
        reasonPlaceholder="e.g. Repeated fraudulent orders"
        reasonHelperText="Shown to the user when they try to log in"
        reasonRequiredText="Enter the reason for blocking"
      />
    </Box>
  );
}
