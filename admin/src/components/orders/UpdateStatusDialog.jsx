import { useEffect, useState } from 'react';
import { useSnackbar } from 'notistack';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import CloseIcon from '@mui/icons-material/Close';

import { orderApi, cancellationReasonApi } from '../../api/endpoints';
import { STATUS_FLOW } from '../../utils/constants';
import { titleCase } from '../../utils/format';
import StatusChip from '../common/StatusChip';

/**
 * Status transition dialog. Only offers moves the server will accept, so an
 * admin can't try to ship an already-delivered order.
 */
export default function UpdateStatusDialog({ order, onClose, onUpdated }) {
  const { enqueueSnackbar } = useSnackbar();

  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [reasonId, setReasonId] = useState('');
  const [reasons, setReasons] = useState([]);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [courierPartner, setCourierPartner] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!order) return;
    const allowed = STATUS_FLOW[order.orderStatus] || [];
    setStatus(allowed[0] || '');
    setNote('');
    setReasonId('');
    setTrackingNumber(order.trackingNumber || '');
    setCourierPartner(order.courierPartner || '');
    setExpectedDeliveryDate(
      order.expectedDeliveryDate ? new Date(order.expectedDeliveryDate).toISOString().slice(0, 10) : ''
    );
  }, [order]);

  // The same picklist the storefront offers, so a staff cancellation and a
  // shopper's own read identically on the order and in the email.
  useEffect(() => {
    let cancelled = false;
    cancellationReasonApi
      .list()
      .then((res) => {
        if (!cancelled) setReasons((res?.data?.reasons || []).filter((row) => row.isActive));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  if (!order) return null;

  const allowed = STATUS_FLOW[order.orderStatus] || [];
  const needsTracking = ['shipped', 'out_for_delivery'].includes(status);
  const isDestructive = status === 'cancelled' || status === 'returned';

  const submit = async () => {
    setSaving(true);
    try {
      await orderApi.updateStatus(order._id, {
        status,
        note: note.trim() || undefined,
        // Only meaningful on the two moves that close an order; the server reads
        // it as the reason and ignores it otherwise.
        reasonId: isDestructive ? reasonId || undefined : undefined,
        trackingNumber: trackingNumber.trim() || undefined,
        courierPartner: courierPartner.trim() || undefined,
        expectedDeliveryDate: expectedDeliveryDate || undefined,
      });
      enqueueSnackbar(`Order marked as ${titleCase(status)}`, { variant: 'success' });
      onUpdated();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not update the order', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pr: 6 }}>
        Update order status
        <Typography variant="body2" color="text.secondary">
          {order.orderNumber}
        </Typography>
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
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Current status:
            </Typography>
            <StatusChip status={order.orderStatus} />
          </Stack>

          {allowed.length === 0 ? (
            <Alert severity="info">
              This order is {titleCase(order.orderStatus).toLowerCase()} and can no longer be moved
              to another status.
            </Alert>
          ) : (
            <>
              <TextField
                select
                fullWidth
                label="New status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {allowed.map((value) => (
                  <MenuItem key={value} value={value}>
                    {titleCase(value)}
                  </MenuItem>
                ))}
              </TextField>

              {isDestructive && (
                <>
                  <Alert severity="warning">
                    Marking this order {titleCase(status).toLowerCase()} returns its items to stock
                    {order.paymentStatus === 'paid' &&
                      ' and queues a refund — raise it through the gateway, then mark it refunded from the payment summary'}
                    .
                  </Alert>

                  <TextField
                    select
                    fullWidth
                    label="Reason"
                    value={reasonId}
                    onChange={(e) => setReasonId(e.target.value)}
                    helperText="Shown to the customer on their order page and in the email. Leave blank to use the note below."
                  >
                    <MenuItem value="">
                      <em>Write my own below</em>
                    </MenuItem>
                    {reasons.map((reason) => (
                      <MenuItem key={reason._id} value={reason._id}>
                        {reason.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </>
              )}

              {needsTracking && (
                <>
                  <TextField
                    fullWidth
                    label="Tracking number"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    helperText="Included in the customer's status email"
                  />
                  <TextField
                    fullWidth
                    label="Courier partner"
                    value={courierPartner}
                    onChange={(e) => setCourierPartner(e.target.value)}
                  />
                  <TextField
                    fullWidth
                    type="date"
                    label="Expected delivery date"
                    value={expectedDeliveryDate}
                    onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </>
              )}

              <TextField
                fullWidth
                multiline
                minRows={2}
                label={isDestructive ? 'Note' : 'Internal note'}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                helperText={
                  isDestructive
                    ? 'Used as the reason when none is picked above — the customer sees it'
                    : "Optional — stored in the order's status history"
                }
                inputProps={{ maxLength: 300 }}
              />
            </>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button
          variant="contained"
          color={isDestructive ? 'error' : 'primary'}
          disabled={saving || !status || allowed.length === 0}
          onClick={submit}
          startIcon={saving ? <CircularProgress size={15} color="inherit" /> : null}
        >
          Update status
        </Button>
      </DialogActions>
    </Dialog>
  );
}
