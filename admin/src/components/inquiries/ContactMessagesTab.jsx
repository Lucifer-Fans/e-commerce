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
import Divider from '@mui/material/Divider';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import InboxIcon from '@mui/icons-material/MarkunreadMailboxOutlined';
import VisibilityIcon from '@mui/icons-material/VisibilityOutlined';
import ReplyIcon from '@mui/icons-material/ReplyOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutline';

import { inquiryApi } from '../../api/endpoints';
import useFetch from '../../hooks/useFetch';
import useDebounce from '../../hooks/useDebounce';
import { useLiveRefetch } from '../../realtime/useRealtime';
import { INQUIRY_EVENTS } from '../../realtime/events';
import { formatDateTime } from '../../utils/format';
import DataTable from '../common/DataTable';
import ConfirmDialog from '../common/ConfirmDialog';
import InquiryDetailDialog from './InquiryDetailDialog';
import ReplyDialog from './ReplyDialog';

const DATE_RANGES = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'year', label: 'Last 12 Months' },
];

const SORTS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
];

const DEFAULT_FILTERS = { search: '', range: 'all', sort: 'newest' };

/** The contact-form inbox: search / date / sort, plus view, reply and delete. */
export default function ContactMessagesTab({ onCountsChanged }) {
  const { enqueueSnackbar } = useSnackbar();

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const [viewing, setViewing] = useState(null);
  const [replying, setReplying] = useState(null);
  const [deleting, setDeleting] = useState(null);

  // Typing in the search box shouldn't fire a request per keystroke.
  const search = useDebounce(filters.search, 350);

  const query = useFetch(
    useCallback(
      () => inquiryApi.list({ page, limit, search, range: filters.range, sort: filters.sort }),
      [page, limit, search, filters.range, filters.sort]
    ),
    [page, limit, search, filters.range, filters.sort]
  );

  useLiveRefetch(query.refetch, INQUIRY_EVENTS);

  const inquiries = query.data?.data?.inquiries || [];
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
    filters.range !== DEFAULT_FILTERS.range ||
    filters.sort !== DEFAULT_FILTERS.sort;

  /** Opening the detail dialog marks the message read server-side. */
  const open = async (row) => {
    setViewing(row);
    if (row.isRead) return;
    try {
      const res = await inquiryApi.detail(row._id);
      setViewing(res.data.inquiry);
      refresh();
    } catch {
      /* the dialog already has everything it needs from the row */
    }
  };

  const remove = async () => {
    try {
      await inquiryApi.remove(deleting._id);
      enqueueSnackbar('Message deleted', { variant: 'success' });
      refresh();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not delete the message', { variant: 'error' });
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Name',
      minWidth: 160,
      render: (row) => (
        <Stack direction="row" alignItems="center" spacing={1}>
          {/* Unread rows carry a dot rather than a whole extra column. */}
          {!row.isRead && (
            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0 }} />
          )}
          <Typography variant="body2" fontWeight={row.isRead ? 500 : 800}>
            {row.name}
          </Typography>
        </Stack>
      ),
    },
    {
      key: 'email',
      label: 'Email',
      minWidth: 200,
      render: (row) => (
        <Typography
          component="a"
          href={`mailto:${row.email}`}
          variant="body2"
          sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
        >
          {row.email}
        </Typography>
      ),
    },
    {
      key: 'createdAt',
      label: 'Date & Time',
      minWidth: 180,
      render: (row) => <Typography variant="body2">{formatDateTime(row.createdAt)}</Typography>,
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'center',
      width: 150,
      render: (row) => (
        <Stack direction="row" spacing={0.5} justifyContent="center">
          <Tooltip title="View message">
            <IconButton size="small" color="primary" onClick={() => open(row)}>
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={row.reply?.sentAt ? 'Replied — reply again' : 'Reply by email'}>
            <IconButton size="small" color="success" onClick={() => setReplying(row)}>
              <ReplyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" color="error" onClick={() => setDeleting(row)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
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
            color: 'primary.main',
          }}
        >
          <InboxIcon />
        </Box>
        <Box>
          <Typography variant="h6">Messages</Typography>
          <Typography variant="body2" color="text.secondary">
            {meta?.total ?? 0} message(s) received.
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
          placeholder="Search by name, email or message…"
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
          label="Date"
          value={filters.range}
          onChange={setFilter('range')}
          sx={{ minWidth: 170 }}
        >
          {DATE_RANGES.map((range) => (
            <MenuItem key={range.value} value={range.value}>
              {range.label}
            </MenuItem>
          ))}
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
        rows={inquiries}
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
        emptyTitle={isFiltered ? 'No messages match these filters' : 'No messages yet'}
        emptyMessage={
          isFiltered
            ? 'Try a different search term or widen the date range.'
            : 'Enquiries submitted through the storefront contact form land here.'
        }
      />

      <InquiryDetailDialog
        inquiry={viewing}
        onClose={() => setViewing(null)}
        onReply={(inquiry) => {
          setViewing(null);
          setReplying(inquiry);
        }}
      />

      {replying && (
        <ReplyDialog
          inquiry={replying}
          onClose={() => setReplying(null)}
          onSent={() => {
            setReplying(null);
            refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title="Delete this message?"
        message={`The enquiry from ${deleting?.name || 'this visitor'} will be removed permanently.`}
        confirmLabel="Delete"
      />
    </>
  );
}
