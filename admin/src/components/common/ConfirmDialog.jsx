import { useEffect, useState } from 'react';
import { useSnackbar } from 'notistack';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import CloseIcon from '@mui/icons-material/Close';

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmLabel = 'Confirm',
  danger = true,
  /*
   * Opt-in reason field. Passing `reasonLabel` turns the plain confirm into one that
   * collects a short note and hands it to `onConfirm`; callers that omit it keep the
   * original two-button dialog untouched.
   */
  reasonLabel,
  reasonPlaceholder,
  reasonHelperText,
  reasonRequiredText = 'Enter the reason',
  reasonMinLength = 3,
  reasonMaxLength = 200,
}) {
  const { enqueueSnackbar } = useSnackbar();
  const [working, setWorking] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  // Reopening must never inherit the previous target's note.
  useEffect(() => {
    if (open) {
      setReason('');
      setError('');
    }
  }, [open]);

  const confirm = async () => {
    const trimmed = reason.trim();
    if (reasonLabel) {
      if (!trimmed || trimmed.length < reasonMinLength) {
        setError(trimmed ? `Reason must be at least ${reasonMinLength} characters` : reasonRequiredText);
        enqueueSnackbar('Please fill the required fields first', { variant: 'warning' });
        return;
      }
    }

    setWorking(true);
    try {
      await onConfirm?.(reasonLabel ? trimmed : undefined);
      onClose?.();
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={open} onClose={working ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pr: 6 }}>
        {title}
        {/* Dismissal lives in the corner, so the footer carries only the action itself. */}
        <IconButton
          onClick={onClose}
          disabled={working}
          aria-label="Close"
          size="small"
          sx={{ position: 'absolute', right: 12, top: 12, color: 'text.secondary' }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ fontSize: 14 }}>{message}</DialogContentText>
        {reasonLabel ? (
          // Shaped like every other required field in the admin: single line, its own
          // label, a standing hint under it and a silent cap — no counter.
          <TextField
            fullWidth
            required
            autoFocus
            sx={{ mt: 2.5 }}
            label={reasonLabel}
            placeholder={reasonPlaceholder}
            value={reason}
            disabled={working}
            onChange={(e) => {
              setReason(e.target.value);
              setError('');
            }}
            error={Boolean(error)}
            helperText={error || reasonHelperText}
            inputProps={{ maxLength: reasonMaxLength }}
          />
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button
          onClick={confirm}
          disabled={working}
          variant="contained"
          color={danger ? 'error' : 'primary'}
          startIcon={working ? <CircularProgress size={15} color="inherit" /> : null}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
