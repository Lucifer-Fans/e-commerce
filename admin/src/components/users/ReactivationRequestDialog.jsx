import { useEffect, useState } from 'react';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';

import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/CheckCircleOutline';
import BlockIcon from '@mui/icons-material/HighlightOff';
import VerifiedIcon from '@mui/icons-material/VerifiedUserOutlined';
import HistoryIcon from '@mui/icons-material/HistoryOutlined';

import { userApi } from '../../api/endpoints';
import { formatDateTime, formatPrice, formatNumber } from '../../utils/format';

/** What each audit action is called on screen. Anything unmapped prints its own slug. */
const ACTION_LABELS = {
  'deactivation-requested': 'Deactivation started',
  'deactivation-otp-sent': 'Deactivation code sent',
  'deactivation-otp-failed': 'Deactivation code rejected',
  'deactivation-otp-verified': 'Deactivation code accepted',
  deactivated: 'Account deactivated',
  'login-blocked': 'Sign-in refused',
  'registration-blocked': 'Sign-up refused',
  'reactivation-email-sent': 'Reactivation link emailed',
  'reactivation-link-opened': 'Reactivation link opened',
  'reactivation-otp-sent': 'Reactivation code sent',
  'reactivation-otp-verified': 'Identity verified',
  'reactivation-requested': 'Request submitted',
  'reactivation-approved': 'Request approved',
  'reactivation-rejected': 'Request rejected',
  reactivated: 'Account reactivated',
};

const STATUS_COLOR = { pending: 'warning', approved: 'success', rejected: 'error' };

const Field = ({ label, value }) => (
  <Grid size={{ xs: 12, sm: 6 }}>
    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
      {label}
    </Typography>
    <Typography variant="body2" fontWeight={600} sx={{ mt: 0.25, wordBreak: 'break-word' }}>
      {value || '—'}
    </Typography>
  </Grid>
);

/**
 * One reactivation request, and the decision on it.
 *
 * The dialog is built around the question an approver is actually answering,
 * which is not "does this form look complete" — the flow refuses to create a
 * request that is not — but "is this the account holder, and do we want them
 * back". So the three proofs are stated as facts with their timestamps, and the
 * space below them goes to the account's own history: when it closed and why,
 * what it was worth, and every refused sign-in since.
 *
 * Approve and Reject are equally weighted buttons. A rejection needs a reason
 * because the customer is emailed it verbatim, and a rejection without one reads
 * as arbitrary; an approval takes an optional note that rides along in the
 * welcome-back email.
 */
export default function ReactivationRequestDialog({ requestId, onClose, onDecided }) {
  const { enqueueSnackbar } = useSnackbar();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState('');

  const [decision, setDecision] = useState(null);
  const [notes, setNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    userApi
      .reactivationRequest(requestId)
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((err) => {
        if (!cancelled) setFailed(err.message || 'Could not load this request');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [requestId]);

  const request = data?.request;
  const isPending = request?.status === 'pending';

  const submit = async () => {
    if (decision === 'rejected' && rejectionReason.trim().length < 3) {
      setError('Tell the customer why the request was refused');
      enqueueSnackbar('Please fill the required fields first', { variant: 'warning' });
      return;
    }

    setSaving(true);
    try {
      await userApi.decideReactivation(requestId, {
        decision,
        adminNotes: notes.trim() || undefined,
        rejectionReason: decision === 'rejected' ? rejectionReason.trim() : undefined,
      });
      enqueueSnackbar(
        decision === 'approved' ? 'Account reactivated' : 'Request rejected',
        { variant: 'success' }
      );
      onDecided?.();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not save the decision', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={saving ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pr: 6 }}>
        Reactivation request
        <IconButton
          onClick={onClose}
          size="small"
          disabled={saving}
          sx={{ position: 'absolute', right: 12, top: 12, color: 'text.secondary' }}
          aria-label="Close"
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {loading && (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
            <CircularProgress size={26} />
          </Box>
        )}

        {!loading && failed && <Alert severity="error">{failed}</Alert>}

        {!loading && request && (
          <Stack spacing={2.5}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Avatar
                src={request.user?.avatar?.url}
                slotProps={{ img: { referrerPolicy: 'no-referrer' } }}
                sx={{ width: 48, height: 48, bgcolor: 'primary.main' }}
              >
                {request.name?.charAt(0).toUpperCase()}
              </Avatar>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="subtitle1" fontWeight={700} noWrap>
                  {request.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {request.email}
                  {request.phone ? ` · ${request.phone}` : ''}
                </Typography>
              </Box>
              <Chip
                label={request.status}
                color={STATUS_COLOR[request.status] || 'default'}
                size="small"
                sx={{ textTransform: 'capitalize', fontWeight: 700 }}
              />
            </Stack>

            <Divider />

            <Grid container spacing={2}>
              <Field label="Deactivated on" value={formatDateTime(request.deactivatedAt)} />
              <Field label="Original reason" value={request.deactivationReason} />
              <Field label="Requested on" value={formatDateTime(request.requestedAt)} />
              <Field
                label="Account status"
                value={request.user?.status ? request.user.status.replace(/-/g, ' ') : '—'}
              />
              <Field
                label="Customer value"
                value={`${formatNumber(data.customer?.orders)} order(s) · ${formatPrice(
                  data.customer?.spent
                )}`}
              />
              <Field label="Registered since" value={formatDateTime(request.user?.createdAt)} />
            </Grid>

            {request.message && (
              <Alert severity="info" icon={false}>
                <Typography variant="caption" fontWeight={700} display="block" sx={{ mb: 0.5 }}>
                  From the customer
                </Typography>
                {request.message}
              </Alert>
            )}

            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <VerifiedIcon fontSize="small" color="success" />
                <Typography variant="subtitle2" fontWeight={700}>
                  Verification
                </Typography>
              </Stack>
              <Grid container spacing={2}>
                <Field
                  label="Emailed link opened"
                  value={formatDateTime(request.verification?.linkVerifiedAt)}
                />
                <Field
                  label="One-time code verified"
                  value={formatDateTime(request.verification?.emailOtpVerifiedAt)}
                />
                <Field
                  label="Details re-confirmed"
                  value={(request.verification?.confirmedFields || []).join(', ') || '—'}
                />
                <Field label="Submitted from" value={request.verification?.ip} />
              </Grid>
            </Box>

            {request.status !== 'pending' && (
              <Alert severity={request.status === 'approved' ? 'success' : 'warning'}>
                <Typography variant="body2" fontWeight={700}>
                  {request.status === 'approved' ? 'Approved' : 'Rejected'} by{' '}
                  {request.reviewedByName || request.reviewedBy?.name || 'an administrator'} on{' '}
                  {formatDateTime(request.reviewedAt)}
                </Typography>
                {request.rejectionReason && (
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    Reason given: {request.rejectionReason}
                  </Typography>
                )}
                {request.adminNotes && (
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    Notes: {request.adminNotes}
                  </Typography>
                )}
              </Alert>
            )}

            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <HistoryIcon fontSize="small" color="action" />
                <Typography variant="subtitle2" fontWeight={700}>
                  Account history
                </Typography>
              </Stack>

              <Stack
                spacing={0}
                sx={{
                  maxHeight: 260,
                  overflowY: 'auto',
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 2,
                }}
              >
                {(data.trail || []).map((row, index) => (
                  <Box
                    key={row._id}
                    sx={{
                      px: 2,
                      py: 1.25,
                      borderTop: index ? 1 : 0,
                      borderColor: 'divider',
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" spacing={2}>
                      <Typography variant="body2" fontWeight={600}>
                        {ACTION_LABELS[row.action] || row.action}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {formatDateTime(row.createdAt)}
                      </Typography>
                    </Stack>
                    {row.summary && (
                      <Typography variant="caption" color="text.secondary">
                        {row.summary}
                      </Typography>
                    )}
                  </Box>
                ))}

                {!(data.trail || []).length && (
                  <Box sx={{ px: 2, py: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Nothing recorded for this account yet.
                    </Typography>
                  </Box>
                )}
              </Stack>
            </Box>

            {isPending && decision && (
              <Stack spacing={2}>
                <Divider />
                {decision === 'rejected' && (
                  <TextField
                    fullWidth
                    required
                    autoFocus
                    multiline
                    rows={2}
                    label="Reason for rejection"
                    value={rejectionReason}
                    onChange={(e) => {
                      setRejectionReason(e.target.value);
                      setError('');
                    }}
                    error={Boolean(error)}
                    helperText={error || 'Sent to the customer word for word'}
                    inputProps={{ maxLength: 300 }}
                  />
                )}
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  label="Internal notes (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  helperText={
                    decision === 'approved'
                      ? 'Included in the welcome-back email, so keep it customer-friendly'
                      : 'Kept on the request for your own records'
                  }
                  inputProps={{ maxLength: 500 }}
                />
              </Stack>
            )}
          </Stack>
        )}
      </DialogContent>

      {isPending && (
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          {decision ? (
            <>
              <Button onClick={() => setDecision(null)} disabled={saving}>
                Back
              </Button>
              <Button
                variant="contained"
                color={decision === 'approved' ? 'success' : 'error'}
                onClick={submit}
                disabled={saving}
                startIcon={saving ? <CircularProgress size={15} color="inherit" /> : null}
              >
                {decision === 'approved' ? 'Confirm approval' : 'Confirm rejection'}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outlined"
                color="error"
                startIcon={<BlockIcon />}
                onClick={() => setDecision('rejected')}
              >
                Reject
              </Button>
              <Button
                variant="contained"
                color="success"
                startIcon={<CheckIcon />}
                onClick={() => setDecision('approved')}
              >
                Approve &amp; reactivate
              </Button>
            </>
          )}
        </DialogActions>
      )}
    </Dialog>
  );
}
