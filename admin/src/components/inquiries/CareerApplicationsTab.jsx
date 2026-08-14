import { useCallback, useMemo, useState } from 'react';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
import TuneIcon from '@mui/icons-material/TuneOutlined';
import VisibilityIcon from '@mui/icons-material/VisibilityOutlined';
import DownloadIcon from '@mui/icons-material/DownloadOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import EventIcon from '@mui/icons-material/EventAvailableOutlined';

import { careerApi } from '../../api/endpoints';
import useFetch from '../../hooks/useFetch';
import { useLiveRefetch } from '../../realtime/useRealtime';
import { CAREER_EVENTS } from '../../realtime/events';
import { formatDate } from '../../utils/format';
import DataTable from '../common/DataTable';
import ConfirmDialog from '../common/ConfirmDialog';
import ResetFiltersButton from '../common/ResetFiltersButton';
import ApplicantProfileDialog from './ApplicantProfileDialog';
import CareerSetupDialog from './CareerSetupDialog';
import InterviewScheduleDialog from './InterviewScheduleDialog';
import useResume from './useResume';

const STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'interviewed', label: 'Interviewed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'hired', label: 'Hired' },
];

const STATUS_LABEL = Object.fromEntries(STATUSES.map((status) => [status.value, status.label]));

/**
 * Review only moves forward, and `rejected` / `hired` close the record — the same
 * rule the server enforces on the status route, so the dropdown never offers a
 * move the save would refuse.
 */
const STAGES = ['new', 'shortlisted', 'interviewed'];
const FINAL_STATUSES = ['rejected', 'hired'];

const canChangeStatus = (from, to) => {
  if (from === to) return true;
  if (FINAL_STATUSES.includes(from)) return false;
  if (FINAL_STATUSES.includes(to)) return true;
  return STAGES.indexOf(to) > STAGES.indexOf(from);
};

const STATUS_COLOR = {
  new: 'info',
  shortlisted: 'primary',
  interviewed: 'secondary',
  rejected: 'error',
  hired: 'success',
};

const DEFAULT_FILTERS = { status: 'all', position: 'all', experience: 'all' };

/** Applications received through the storefront careers form. */
export default function CareerApplicationsTab({ onCountsChanged }) {
  const { enqueueSnackbar } = useSnackbar();

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const [viewing, setViewing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [scheduling, setScheduling] = useState(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const resume = useResume();

  // Positions and experience labels come from the same config the storefront reads,
  // so the filter dropdowns can never drift from the form that produced the rows.
  const configQuery = useFetch(useCallback(() => careerApi.config(), []), []);
  const positionsQuery = useFetch(useCallback(() => careerApi.positions(), []), []);

  const query = useFetch(
    useCallback(
      () => careerApi.applications({ page, limit, ...filters }),
      [page, limit, filters]
    ),
    [page, limit, filters]
  );

  useLiveRefetch(() => {
    query.refetch();
    positionsQuery.refetch();
    configQuery.refetch();
  }, CAREER_EVENTS);

  const applications = query.data?.data?.applications || [];
  const meta = query.data?.meta;
  const positions = positionsQuery.data?.data?.positions || [];
  const experienceLevels = configQuery.data?.data?.experienceLevels || [];
  const hr = configQuery.data?.data?.hr || {};

  const experienceLabel = useMemo(
    () => Object.fromEntries(experienceLevels.map((level) => [level.value, level.label])),
    [experienceLevels]
  );

  const refresh = () => {
    query.refetch();
    onCountsChanged?.();
  };

  const setFilter = (field) => (e) => {
    setFilters((f) => ({ ...f, [field]: e.target.value }));
    setPage(1);
  };

  const open = async (row) => {
    setViewing(row);
    if (row.isRead) return;
    try {
      const res = await careerApi.application(row._id);
      setViewing(res.data.application);
      refresh();
    } catch {
      /* the row already carries everything the dialog renders */
    }
  };

  /**
   * "Interviewed" is the status that calls a candidate in, so it cannot be set
   * from the dropdown alone — it opens the scheduling dialog, and the status is
   * saved with the appointment when that is submitted. Picking it and closing
   * the dialog leaves the row untouched.
   */
  const changeStatus = (row, status) => {
    if (status === 'interviewed') return setScheduling(row);
    // The dropdown has nothing to do with a rejected save beyond the toast, so
    // the throw stops here.
    saveStatus(row, { status }).catch(() => {});
  };

  /** Rethrows, so a caller that owns a dialog can keep it open on failure. */
  const saveStatus = async (row, payload) => {
    try {
      const res = await careerApi.setApplicationStatus(row._id, payload);
      const label = STATUS_LABEL[payload.status] || payload.status;
      // Every status but "New" emails the applicant, so the toast says so —
      // an admin picking from a dropdown has no other cue that a decision has
      // just left the building.
      enqueueSnackbar(
        payload.interview
          ? // The server says it better here: the admin has just sent an
            // appointment, not moved a row to a new label.
            res?.message || 'Interview scheduled — the invitation has been emailed'
          : res?.data?.notified
          ? `Marked as ${label} — applicant notified by email`
          : `Marked as ${label}`,
        { variant: 'success' }
      );
      refresh();
      return res;
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not update the status', { variant: 'error' });
      throw err;
    }
  };

  /** The scheduling dialog's submit: the appointment and the status, in one save. */
  const scheduleInterview = async (interview) => {
    await saveStatus(scheduling, { status: 'interviewed', interview });
    setScheduling(null);
  };

  const remove = async () => {
    try {
      await careerApi.removeApplication(deleting._id);
      enqueueSnackbar('Application deleted', { variant: 'success' });
      refresh();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not delete the application', { variant: 'error' });
    }
  };

  const isFiltered =
    filters.status !== 'all' || filters.position !== 'all' || filters.experience !== 'all';

  const columns = [
    {
      key: 'createdAt',
      label: 'Date',
      minWidth: 110,
      render: (row) => (
        <Typography variant="body2" color="text.secondary">
          {formatDate(row.createdAt)}
        </Typography>
      ),
    },
    {
      key: 'name',
      label: 'Applicant Name',
      minWidth: 150,
      render: (row) => (
        <Typography variant="body2" fontWeight={row.isRead ? 600 : 800}>
          {row.name}
        </Typography>
      ),
    },
    {
      key: 'email',
      label: 'Email ID',
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
    { key: 'phone', label: 'Phone', minWidth: 120 },
    {
      key: 'position',
      label: 'Position',
      minWidth: 140,
      render: (row) => (
        <Typography variant="body2" fontWeight={700}>
          {row.position}
        </Typography>
      ),
    },
    {
      key: 'experience',
      label: 'Experience',
      minWidth: 130,
      render: (row) => (
        <Typography variant="body2" color="primary.main">
          {experienceLabel[row.experience] || row.experience}
        </Typography>
      ),
    },
    {
      key: 'location',
      label: 'Location',
      minWidth: 110,
      render: (row) => (
        <Typography variant="body2" color="text.secondary">
          {row.location || '—'}
        </Typography>
      ),
    },
    {
      key: 'resume',
      label: 'Resume',
      align: 'center',
      width: 100,
      render: (row) =>
        row.resume?.hasFile ? (
          <Stack direction="row" spacing={0.25} justifyContent="center">
            <Tooltip title="Open Resume">
              <span>
                <IconButton
                  size="small"
                  color="primary"
                  disabled={resume.busyId === row._id}
                  onClick={() => resume.view(row)}
                >
                  <VisibilityIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Download Resume">
              <span>
                <IconButton
                  size="small"
                  color="success"
                  disabled={resume.busyId === row._id}
                  onClick={() => resume.download(row)}
                >
                  <DownloadIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        ) : (
          '—'
        ),
    },
    {
      key: 'status',
      label: 'Status',
      width: 150,
      render: (row) => {
        const closed = FINAL_STATUSES.includes(row.status);
        // Every stage stays listed either way, so the pipeline reads the same on
        // every row — the ones no longer open are shown greyed rather than gone.
        const select = (
          <Select
            size="small"
            value={row.status}
            onChange={(e) => changeStatus(row, e.target.value)}
            color={STATUS_COLOR[row.status] || 'primary'}
            disabled={closed}
            sx={{ minWidth: 130, fontSize: 13 }}
          >
            {STATUSES.map((status) => (
              <MenuItem
                key={status.value}
                value={status.value}
                disabled={!canChangeStatus(row.status, status.value)}
                sx={{ fontSize: 13 }}
              >
                {status.label}
              </MenuItem>
            ))}
          </Select>
        );

        // A closed record's whole dropdown is disabled, which on its own only says
        // "not allowed" — the tooltip says why, as the row's other locked controls do.
        return closed ? (
          <Tooltip
            title={`Marked ${STATUS_LABEL[row.status] || row.status} — this decision has been emailed and can no longer be changed`}
          >
            <span>{select}</span>
          </Tooltip>
        ) : (
          select
        );
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'center',
      // Room for the third button an interviewed row carries.
      width: 130,
      render: (row) => (
        <Stack direction="row" spacing={0.25} justifyContent="center">
          <Tooltip title="View applicant profile">
            <IconButton size="small" color="primary" onClick={() => open(row)}>
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {/* Re-picking "Interviewed" on a row already at it fires no change
              event, so rescheduling needs its own way in. */}
          {row.status === 'interviewed' && (
            <Tooltip title="Reschedule interview">
              <IconButton size="small" color="secondary" onClick={() => setScheduling(row)}>
                <EventIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Delete application">
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
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        alignItems={{ xs: 'stretch', md: 'center' }}
        spacing={1.5}
        sx={{ p: 2.5 }}
      >
        <TextField
          size="small"
          select
          label="Status"
          value={filters.status}
          onChange={setFilter('status')}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="all">All Status</MenuItem>
          {STATUSES.map((status) => (
            <MenuItem key={status.value} value={status.value}>
              {status.label}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          size="small"
          select
          label="Position"
          value={filters.position}
          onChange={setFilter('position')}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="all">All Positions</MenuItem>
          {positions.map((position) => (
            <MenuItem key={position._id} value={position.title}>
              {position.title}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          size="small"
          select
          label="Experience"
          value={filters.experience}
          onChange={setFilter('experience')}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="all">All Experience</MenuItem>
          {experienceLevels.map((level) => (
            <MenuItem key={level.value} value={level.value}>
              {level.label}
            </MenuItem>
          ))}
        </TextField>

        <ResetFiltersButton
          size="small"
          disabled={!isFiltered}
          onClick={() => {
            setFilters(DEFAULT_FILTERS);
            setPage(1);
          }}
        />

        <Box sx={{ flex: 1 }} />

        <Button variant="outlined" startIcon={<TuneIcon />} onClick={() => setSetupOpen(true)}>
          Positions &amp; HR contact
        </Button>
      </Stack>

      <Divider />
    </Box>
  );

  return (
    <>
      <DataTable
        columns={columns}
        rows={applications}
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
        emptyTitle={isFiltered ? 'No applications match these filters' : 'No applications yet'}
        emptyMessage={
          isFiltered
            ? 'Try widening the status, position or experience filter.'
            : 'Applications submitted through the storefront careers form land here.'
        }
        emptyAction={
          isFiltered ? undefined : { label: 'Manage positions', onClick: () => setSetupOpen(true) }
        }
      />

      <ApplicantProfileDialog
        application={viewing}
        experienceLabel={viewing ? experienceLabel[viewing.experience] || viewing.experience : ''}
        resume={resume}
        onClose={() => setViewing(null)}
      />

      {scheduling && (
        <InterviewScheduleDialog
          application={scheduling}
          onClose={() => setScheduling(null)}
          onSubmit={scheduleInterview}
        />
      )}

      {setupOpen && (
        <CareerSetupDialog
          positions={positions}
          hr={hr}
          onClose={() => setSetupOpen(false)}
          onChanged={() => {
            positionsQuery.refetch();
            configQuery.refetch();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title="Delete this application?"
        message={`${deleting?.name || 'This applicant'}'s application and résumé will be removed permanently.`}
        confirmLabel="Delete"
      />
    </>
  );
}
