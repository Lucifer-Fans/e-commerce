import { useState } from 'react';
import { useSnackbar } from 'notistack';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';

import { orderApi } from '../../api/endpoints';
import { formatPrice } from '../../utils/format';
import StatusChip from '../common/StatusChip';

/**
 * Confirms that a queued refund has actually been sent.
 *
 * It is laid out as a status change — current status, new status, then the
 * details — because that is the shape of every other "move this order along"
 * dialog in the panel, and staff should not have to learn a second one.
 *
 * The picker has exactly one option, and that is the honest picture rather than
 * a limitation of the form: cancelling a prepaid order already parked it at
 * "refund pending", and the only place it can go is "refunded". Everything else
 * the payment status does, the system does for itself.
 */
export default function UpdatePaymentDialog({ order, onClose, onUpdated }) {
  const { enqueueSnackbar } = useSnackbar();

  const [refundReference, setRefundReference] = useState(order?.refundReference || '');
  const [saving, setSaving] = useState(false);

  if (!order) return null;

  const submit = async () => {
    setSaving(true);
    try {
      await orderApi.markRefunded(order._id, {
        refundReference: refundReference.trim() || undefined,
      });
      enqueueSnackbar('Payment marked as refunded', { variant: 'success' });
      onUpdated();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not update the payment', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        Update payment status
        <Typography variant="body2" color="text.secondary">
          {order.orderNumber} · {formatPrice(order.pricing.total, true)}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Current status:
            </Typography>
            <StatusChip status={order.paymentStatus} kind="payment" />
          </Stack>

          <TextField select fullWidth label="New payment status" value="refunded">
            <MenuItem value="refunded">Refunded</MenuItem>
          </TextField>

          <Alert severity="warning">
            Mark this refunded only once the money has actually been sent back — the customer sees
            this on their order page straight away.
          </Alert>

          <TextField
            fullWidth
            label="Refund reference"
            value={refundReference}
            onChange={(e) => setRefundReference(e.target.value)}
            helperText="Optional — the gateway or bank reference to quote if the customer chases it"
            inputProps={{ maxLength: 80 }}
          />
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit" disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={saving}
          onClick={submit}
          startIcon={saving ? <CircularProgress size={15} color="inherit" /> : null}
        >
          Update payment
        </Button>
      </DialogActions>
    </Dialog>
  );
}
