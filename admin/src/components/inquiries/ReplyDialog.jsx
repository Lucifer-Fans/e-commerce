import { useState } from 'react';
import { useSnackbar } from 'notistack';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import SendIcon from '@mui/icons-material/SendOutlined';

import { inquiryApi } from '../../api/endpoints';

/**
 * Composes an email reply to a contact-form message.
 *
 * The server records the reply even when SMTP cannot deliver it, and returns a
 * message saying so — which is why the snackbar echoes the server's wording rather
 * than assuming success.
 */
export default function ReplyDialog({ inquiry, onClose, onSent }) {
  const { enqueueSnackbar } = useSnackbar();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (message.trim().length < 2) return setError('Write a reply before sending');

    setSending(true);
    try {
      const res = await inquiryApi.reply(inquiry._id, message.trim());
      enqueueSnackbar(res.message || 'Reply sent', {
        variant: res.data?.inquiry?.reply?.delivered ? 'success' : 'warning',
      });
      onSent();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not send the reply', { variant: 'error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open onClose={sending ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Reply to {inquiry.name}</DialogTitle>

      <DialogContent dividers>
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          Sending to
        </Typography>
        <Typography variant="body2" fontWeight={700} sx={{ mb: 2 }}>
          {inquiry.email}
        </Typography>

        <Box sx={{ p: 1.75, mb: 2.5, borderRadius: 2, bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Their message
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
            {inquiry.message}
          </Typography>
        </Box>

        <TextField
          fullWidth
          multiline
          rows={6}
          autoFocus
          label="Your reply"
          placeholder="Type your response…"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            if (error) setError('');
          }}
          error={Boolean(error)}
          helperText={error || 'This is emailed to the customer and stored against the enquiry.'}
          inputProps={{ maxLength: 3000 }}
        />
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit" disabled={sending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={send}
          disabled={sending}
          startIcon={sending ? <CircularProgress size={15} color="inherit" /> : <SendIcon />}
        >
          Send reply
        </Button>
      </DialogActions>
    </Dialog>
  );
}
