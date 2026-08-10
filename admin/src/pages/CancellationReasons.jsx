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

import { cancellationReasonApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import PageHeader from '../components/common/PageHeader';
import DataTable from '../components/common/DataTable';
import ConfirmDialog from '../components/common/ConfirmDialog';

const EMPTY = { label: '', description: '', displayOrder: 0, isActive: true };

function ReasonDialog({ initial, onClose, onSaved }) {
  const { enqueueSnackbar } = useSnackbar();
  const [values, setValues] = useState(initial || EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) =>
    setValues((v) => ({
      ...v,
      [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  const submit = async () => {
    const label = values.label.trim();
    if (label.length < 3) return setError('Reason must be at least 3 characters');

    setSaving(true);
    try {
      const payload = {
        label,
        description: values.description?.trim() || undefined,
        displayOrder: Number(values.displayOrder) || 0,
        isActive: values.isActive,
      };

      if (values._id) await cancellationReasonApi.update(values._id, payload);
      else await cancellationReasonApi.create(payload);

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
      <DialogTitle sx={{ fontWeight: 700 }}>{values._id ? 'Edit reason' : 'New reason'}</DialogTitle>

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
              helperText={error || 'Shown as an option in the storefront cancel dialog'}
              inputProps={{ maxLength: 120 }}
            />
          </Grid>

          <Grid size={12}>
            <TextField
              fullWidth
              label="Helper text"
              value={values.description || ''}
              onChange={set('description')}
              helperText="Optional — a smaller line under the option"
              inputProps={{ maxLength: 200 }}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="number"
              label="Display order"
              value={values.displayOrder}
              onChange={set('displayOrder')}
              helperText="Lower numbers appear first"
              inputProps={{ min: 0 }}
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
        <Button onClick={onClose} color="inherit" disabled={saving}>
          Cancel
        </Button>
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
 * The reasons a shopper picks from when cancelling an order.
 *
 * Editing or deleting a row only changes what is *offered* — orders already
 * cancelled carry their own copy of the text, so history never rewrites itself.
 * Deactivating rather than deleting is the safer way to retire one: it keeps the
 * row around to bring back.
 */
export default function CancellationReasons() {
  const { enqueueSnackbar } = useSnackbar();

  const [dialog, setDialog] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const query = useFetch(useCallback(() => cancellationReasonApi.list(), []), []);
  const reasons = query.data?.data?.reasons || [];

  const remove = async () => {
    try {
      await cancellationReasonApi.remove(deleting._id);
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
        <Box>
          <Typography variant="body2" fontWeight={700}>
            {row.label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {row.description || '—'}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'displayOrder',
      label: 'Order',
      align: 'center',
      width: 100,
      render: (row) => <Typography variant="body2">{row.displayOrder}</Typography>,
    },
    {
      key: 'isActive',
      label: 'Status',
      align: 'center',
      render: (row) => (
        <Chip
          label={row.isActive ? 'Offered' : 'Hidden'}
          size="small"
          color={row.isActive ? 'success' : 'default'}
        />
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
      <PageHeader
        title="Cancellation Reasons"
        subtitle={`${reasons.length} reason(s) configured`}
        breadcrumbs={[{ label: 'Orders', to: '/orders' }, { label: 'Cancellation Reasons' }]}
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({})}>
            Add Reason
          </Button>
        }
      />

      <Alert severity="info" sx={{ mb: 2.5 }}>
        Shoppers pick from this list when cancelling an order, and can always write their own under
        &ldquo;Other&rdquo;. Changes here affect future cancellations only — an order that has
        already been cancelled keeps the reason it was given.
      </Alert>

      <DataTable
        columns={columns}
        rows={reasons}
        loading={query.loading}
        emptyTitle="No cancellation reasons"
        emptyMessage="Add a reason and it will appear in the storefront's cancel dialog."
        emptyAction={{ label: 'Add Reason', onClick: () => setDialog({}) }}
      />

      {dialog && (
        <ReasonDialog
          initial={dialog._id ? dialog : null}
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
        message={`"${deleting?.label}" will stop being offered. Orders already cancelled for this reason are unaffected.`}
        confirmLabel="Delete"
      />
    </Box>
  );
}
