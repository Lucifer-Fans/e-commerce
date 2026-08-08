import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Grid from '@mui/material/Grid2';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CloseIcon from '@mui/icons-material/Close';
import ReplyIcon from '@mui/icons-material/ReplyOutlined';

import { formatDateTime } from '../../utils/format';

/** Label above a value — the dialog's only repeated layout. */
function Detail({ label, value, children }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" fontWeight={600}>
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={700} sx={{ mt: 0.25, wordBreak: 'break-word' }}>
        {children ?? (value || '—')}
      </Typography>
    </Box>
  );
}

/** Read-only view of one contact-form message, opened from the inbox's eye icon. */
export default function InquiryDetailDialog({ inquiry, onClose, onReply }) {
  if (!inquiry) return null;

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pr: 6 }}>
        Inquiry Details
        <IconButton
          onClick={onClose}
          size="small"
          sx={{ position: 'absolute', right: 12, top: 12, color: 'text.secondary' }}
          aria-label="Close"
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ pt: 2.5 }}>
        <Grid container spacing={2.5}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Detail label="Date" value={formatDateTime(inquiry.createdAt)} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Detail label="Full Name" value={inquiry.name} />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <Detail label="Email ID">
              <Box component="a" href={`mailto:${inquiry.email}`} sx={{ color: 'primary.main' }}>
                {inquiry.email}
              </Box>
            </Detail>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Detail label="Phone Number" value={inquiry.phone ? `+91 ${inquiry.phone}` : '—'} />
          </Grid>

          <Grid size={12}>
            <Detail label="Subject" value={inquiry.subject} />
          </Grid>

          <Grid size={12}>
            <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Message
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                {inquiry.message}
              </Typography>
            </Box>
          </Grid>

          {inquiry.reply?.sentAt && (
            <Grid size={12}>
              <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: 'success.light' }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    Your reply · {formatDateTime(inquiry.reply.sentAt)}
                  </Typography>
                  {/* A recorded-but-undelivered reply is worth flagging, not hiding. */}
                  {!inquiry.reply.delivered && (
                    <Chip label="Not delivered" size="small" color="warning" />
                  )}
                </Stack>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {inquiry.reply.message}
                </Typography>
              </Box>
            </Grid>
          )}
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit">
          Close
        </Button>
        <Button variant="contained" startIcon={<ReplyIcon />} onClick={() => onReply(inquiry)}>
          {inquiry.reply?.sentAt ? 'Reply again' : 'Reply'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
