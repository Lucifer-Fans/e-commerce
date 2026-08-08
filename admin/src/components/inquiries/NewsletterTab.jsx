import { useCallback, useState } from 'react';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import InputAdornment from '@mui/material/InputAdornment';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import MailIcon from '@mui/icons-material/MarkEmailReadOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutline';

import { newsletterApi } from '../../api/endpoints';
import useFetch from '../../hooks/useFetch';
import useDebounce from '../../hooks/useDebounce';
import { useLiveRefetch } from '../../realtime/useRealtime';
import { NEWSLETTER_EVENTS } from '../../realtime/events';
import { formatDate } from '../../utils/format';
import DataTable from '../common/DataTable';
import ConfirmDialog from '../common/ConfirmDialog';

const SORTS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
];

const DEFAULT_FILTERS = { search: '', status: 'all', sort: 'newest' };

/** Newsletter sign-ups collected by the storefront footer. */
export default function NewsletterTab({ onCountsChanged }) {
  const { enqueueSnackbar } = useSnackbar();

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [deleting, setDeleting] = useState(null);

  const search = useDebounce(filters.search, 350);

  const query = useFetch(
    useCallback(
      () => newsletterApi.list({ page, limit, search, status: filters.status, sort: filters.sort }),
      [page, limit, search, filters.status, filters.sort]
    ),
    [page, limit, search, filters.status, filters.sort]
  );

  useLiveRefetch(query.refetch, NEWSLETTER_EVENTS);

  const subscribers = query.data?.data?.subscribers || [];
  const subscribedCount = query.data?.data?.subscribedCount ?? 0;
  const meta = query.data?.meta;

  const refresh = () => {
    query.refetch();
    onCountsChanged?.();
  };

  const setFilter = (field) => (e) => {
    setFilters((f) => ({ ...f, [field]: e.target.value }));
    setPage(1);
  };

  const isFiltered =
    filters.search !== DEFAULT_FILTERS.search ||
    filters.status !== DEFAULT_FILTERS.status ||
    filters.sort !== DEFAULT_FILTERS.sort;

  /** The status chip doubles as the control — there is nowhere else to opt someone out. */
  const toggleStatus = async (row) => {
    const next = row.status === 'subscribed' ? 'unsubscribed' : 'subscribed';
    try {
      const res = await newsletterApi.setStatus(row._id, next);
      enqueueSnackbar(res.message || 'Status updated', { variant: 'success' });
      refresh();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not update the status', { variant: 'error' });
    }
  };

  const remove = async () => {
    try {
      await newsletterApi.remove(deleting._id);
      enqueueSnackbar('Subscriber removed', { variant: 'success' });
      refresh();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not remove the subscriber', { variant: 'error' });
    }
  };

  const columns = [
    {
      key: 'createdAt',
      label: 'Date Subscribed',
      minWidth: 140,
      render: (row) => (
        <Typography variant="body2" color="text.secondary">
          {formatDate(row.subscribedAt || row.createdAt)}
        </Typography>
      ),
    },
    {
      key: 'email',
      label: 'Email ID',
      minWidth: 260,
      render: (row) => (
        <Typography
          component="a"
          href={`mailto:${row.email}`}
          variant="body2"
          fontWeight={700}
          sx={{ color: 'text.primary', textDecoration: 'none', '&:hover': { color: 'primary.main' } }}
        >
          {row.email}
        </Typography>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      align: 'center',
      width: 150,
      render: (row) => {
        const subscribed = row.status === 'subscribed';
        return (
          <Tooltip title={subscribed ? 'Mark as unsubscribed' : 'Mark as subscribed'}>
            <Chip
              label={subscribed ? 'Subscribed' : 'Unsubscribed'}
              size="small"
              color={subscribed ? 'success' : 'error'}
              variant="outlined"
              onClick={() => toggleStatus(row)}
              sx={{ fontWeight: 700, cursor: 'pointer' }}
            />
          </Tooltip>
        );
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'center',
      width: 100,
      render: (row) => (
        <Tooltip title="Remove from the list">
          <IconButton size="small" color="error" onClick={() => setDeleting(row)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  const toolbar = (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ p: 2.5 }}>
        <Box
          sx={{
            display: 'grid',
            placeItems: 'center',
            width: 40,
            height: 40,
            borderRadius: 2,
            bgcolor: 'action.hover',
            color: 'success.main',
          }}
        >
          <MailIcon />
        </Box>
        <Box>
          <Typography variant="h6">Newsletter Emails</Typography>
          <Typography variant="body2" color="text.secondary">
            {subscribedCount} active subscriber(s).
          </Typography>
        </Box>
      </Stack>

      <Divider />

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        alignItems={{ xs: 'stretch', md: 'center' }}
        spacing={1.5}
        sx={{ p: 2.5 }}
      >
        <TextField
          size="small"
          placeholder="Search by email…"
          value={filters.search}
          onChange={setFilter('search')}
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
          size="small"
          select
          label="Status"
          value={filters.status}
          onChange={setFilter('status')}
          sx={{ minWidth: 170 }}
        >
          <MenuItem value="all">All Status</MenuItem>
          <MenuItem value="subscribed">Subscribed</MenuItem>
          <MenuItem value="unsubscribed">Unsubscribed</MenuItem>
        </TextField>

        <TextField
          size="small"
          select
          label="Sort By"
          value={filters.sort}
          onChange={setFilter('sort')}
          sx={{ minWidth: 170 }}
        >
          {SORTS.map((sort) => (
            <MenuItem key={sort.value} value={sort.value}>
              {sort.label}
            </MenuItem>
          ))}
        </TextField>

        <Button
          color="inherit"
          disabled={!isFiltered}
          onClick={() => {
            setFilters(DEFAULT_FILTERS);
            setPage(1);
          }}
        >
          Reset
        </Button>
      </Stack>

      <Divider />
    </Box>
  );

  return (
    <>
      <DataTable
        columns={columns}
        rows={subscribers}
        loading={query.loading}
        page={page}
        limit={limit}
        total={meta?.total || 0}
        onPageChange={setPage}
        onLimitChange={(value) => {
          setLimit(value);
          setPage(1);
        }}
        toolbar={toolbar}
        emptyTitle={isFiltered ? 'No subscribers match these filters' : 'No subscribers yet'}
        emptyMessage={
          isFiltered
            ? 'Try a different search term or widen the status filter.'
            : 'Sign-ups from the storefront footer land here.'
        }
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title="Remove this subscriber?"
        message={`${deleting?.email || 'This address'} will be deleted from the newsletter list. To stop emails without losing the record, mark them unsubscribed instead.`}
        confirmLabel="Remove"
      />
    </>
  );
}
