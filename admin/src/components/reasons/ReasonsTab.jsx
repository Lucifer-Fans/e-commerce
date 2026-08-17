import { useCallback, useState } from 'react';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import CircularProgress from '@mui/material/CircularProgress';

import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import CloseIcon from '@mui/icons-material/Close';

import useFetch from '../../hooks/useFetch';
import { useLiveRefetch } from '../../realtime/useRealtime';
import DataTable from '../common/DataTable';
import ConfirmDialog from '../common/ConfirmDialog';

/**
 * A new reason is proposed at the end of the list rather than at 0 — adding one
 * shouldn't silently push everything else down, and an admin who does want it
 * first only has to type the number.
 */
function ReasonDialog({ initial, nextOrder, api, copy, onClose, onSaved }) {
  const { enqueueSnackbar } = useSnackbar();
  const [values, setValues] = useState(
    initial || { label: '', displayOrder: nextOrder, isActive: true }
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // An edited row is already in the list, so the furthest it can go is one slot
  // lower than where a brand-new reason would be appended.
  const maxOrder = values._id ? Math.max(nextOrder - 1, 0) : nextOrder;

  const set = (field) => (e) =>
    setValues((v) => ({
      ...v,
      [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  const submit = async () => {
    const label = values.label.trim();
    if (!label || label.length < 3) {
      setError(label ? 'Reason must be at least 3 characters' : 'Enter the reason');
      enqueueSnackbar('Please fill the required fields first', { variant: 'warning' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        label,
        // Clamped here as well as on the server, so the number the table shows
        // after saving is the one the field showed while typing.
        displayOrder: Math.min(Math.max(Number(values.displayOrder) || 0, 0), maxOrder),
        isActive: values.isActive,
      };

      if (values._id) await api.update(values._id, payload);
      else await api.create(payload);

      enqueueSnackbar(values._id ? 'Reason updated' : 'Reason added', { variant: 'success' });
      onSaved();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not save the reason', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pr: 6 }}>
        {values._id ? 'Edit reason' : 'New reason'}
        <IconButton
          onClick={onClose}
          size="small"
          disabled={saving}
          sx={{ position: 'absolute', right: 12, top: 12, color: 'text.secondary' }}
          aria-label="Close without saving"
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Grid container spacing={2.5}>
          <Grid size={12}>
            <TextField
              fullWidth
              required
              autoFocus
              label="Reason"
              value={values.label}
              onChange={(e) => {
                setError('');
                setValues((v) => ({ ...v, label: e.target.value }));
              }}
              error={Boolean(error)}
              helperText={error || copy.fieldHelper}
              inputProps={{ maxLength: 120 }}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="number"
              label="Display order"
              value={values.displayOrder}
              onChange={set('displayOrder')}
              helperText={copy.orderHelper}
              inputProps={{ min: 0, max: maxOrder }}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControlLabel
              sx={{ mt: 1 }}
              control={<Switch checked={values.isActive} onChange={set('isActive')} />}
              label={<Typography variant="body2">Offer this reason</Typography>}
            />
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button
          variant="contained"
          onClick={submit}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={15} color="inherit" /> : null}
        >
          Save reason
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * One curated picklist, whichever it is.
 *
 * The two lists on the Reasons screen — why an order was cancelled, why an
 * account was closed — are managed identically, so they are one component
 * parameterised by its API and its wording rather than two files that drift
 * apart the first time either grows a column. `copy` carries only the sentences
 * that genuinely differ; everything about *how* a picklist behaves is here.
 *
 * Editing or deleting a row only changes what is *offered*. Orders already
 * cancelled and accounts already closed carry their own copy of the text, so
 * history never rewrites itself. Deactivating rather than deleting is the safer
 * way to retire one: it keeps the row around to bring back.
 */
export default function ReasonsTab({ api, event, copy }) {
  const { enqueueSnackbar } = useSnackbar();

  const [dialog, setDialog] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const query = useFetch(useCallback(() => api.list(), [api]), [api]);
  const reasons = query.data?.data?.reasons || [];

  // Two admins curating the same picklist shouldn't overwrite each other's edits
  // from a stale table.
  useLiveRefetch(query.refetch, event);

  const toggleActive = async (reason) => {
    const next = !reason.isActive;
    try {
      // No displayOrder in the patch — flipping the switch is not a reorder.
      await api.update(reason._id, { label: reason.label, isActive: next });
      enqueueSnackbar(next ? 'Reason activated' : 'Reason deactivated', { variant: 'success' });
      query.refetch();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not update the reason', { variant: 'error' });
    }
  };

  const remove = async () => {
    try {
      await api.remove(deleting._id);
      enqueueSnackbar('Reason deleted', { variant: 'success' });
      query.refetch();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not delete the reason', { variant: 'error' });
    }
  };

  const columns = [
    {
      key: 'label',
      label: 'Reason',
      minWidth: 260,
      render: (row) => (
        <Typography variant="body2" fontWeight={700}>
          {row.label}
        </Typography>
      ),
    },
    {
      key: 'displayOrder',
      label: (
        <Tooltip title={copy.orderTooltip}>
          <Box component="span" sx={{ cursor: 'help' }}>
            Display order
          </Box>
        </Tooltip>
      ),
      align: 'center',
      width: 130,
      render: (row) => <Typography variant="body2">{row.displayOrder}</Typography>,
    },
    {
      key: 'isActive',
      label: 'Status',
      align: 'center',
      width: 120,
      render: (row) => (
        <Tooltip title="Click to toggle active / inactive">
          <Box component="span" onClick={() => toggleActive(row)} sx={{ cursor: 'pointer' }}>
            <Chip
              label={row.isActive ? 'Active' : 'Inactive'}
              size="small"
              color={row.isActive ? 'success' : 'default'}
            />
          </Box>
        </Tooltip>
      ),
    },
    {
      key: 'actions',
      label: 'Action',
      align: 'center',
      width: 100,
      render: (row) => (
        <Stack direction="row" spacing={0.25} justifyContent="center">
          <IconButton size="small" color="primary" onClick={() => setDialog(row)}>
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" color="error" onClick={() => setDeleting(row)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Stack>
      ),
    },
  ];

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'center' }}
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <Typography variant="body2" color="text.secondary">
          {reasons.length} reason(s) configured
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({})}>
          Add Reason
        </Button>
      </Stack>

      <Alert severity="info" sx={{ mb: 2.5 }}>
        {copy.intro}
      </Alert>

      <DataTable
        columns={columns}
        rows={reasons}
        loading={query.loading}
        emptyTitle={copy.emptyTitle}
        emptyMessage={copy.emptyMessage}
        emptyAction={{ label: 'Add Reason', onClick: () => setDialog({}) }}
      />

      {dialog && (
        <ReasonDialog
          initial={dialog._id ? dialog : null}
          nextOrder={reasons.length}
          api={api}
          copy={copy}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            query.refetch();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title="Delete this reason?"
        message={copy.deleteMessage(deleting?.label)}
        confirmLabel="Delete"
      />
    </Box>
  );
}
