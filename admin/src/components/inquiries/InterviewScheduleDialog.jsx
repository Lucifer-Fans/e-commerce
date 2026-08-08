import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';

/** Mirrors INTERVIEW_MODES on the server's JobApplication model. */
const MODES = [
  { value: 'in-person', label: 'In person' },
  { value: 'online', label: 'Online / Video call' },
  { value: 'phone', label: 'Telephone' },
];

const DURATIONS = [15, 30, 45, 60, 90, 120];

const EMPTY = {
  scheduledAt: '',
  mode: 'in-person',
  location: '',
  meetingLink: '',
  interviewer: '',
  contactPhone: '',
  durationMins: 30,
  instructions: '',
};

/**
 * `datetime-local` speaks "YYYY-MM-DDTHH:mm" in the browser's own timezone and
 * has no concept of one, so the value is turned into a real instant here rather
 * than posted as typed — a bare local string would be read as UTC on the server
 * and land the interview hours away from the time HR picked.
 */
const toISO = (local) => (local ? new Date(local).toISOString() : '');

/** The earliest slot the picker will accept: now, to the minute. */
const earliest = () => {
  const now = new Date();
  now.setSeconds(0, 0);
  // Back out of UTC into the local wall clock the input displays.
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

/**
 * Opened when an application is moved to "Interviewed" — the status that calls
 * a candidate in. Nothing is saved until this is submitted: the dialog owns the
 * status change as well as the appointment, so an admin who picks the status by
 * mistake and closes the dialog leaves the application exactly as it was.
 *
 * Re-opening it on an application already at that status is a reschedule, which
 * pre-fills the slot on record and sends a fresh invitation.
 */
export default function InterviewScheduleDialog({ application, onClose, onSubmit }) {
  const existing = application?.interview;

  const [form, setForm] = useState(() =>
    existing?.scheduledAt
      ? {
          ...EMPTY,
          ...existing,
          // Back from an instant to what the picker displays, in local time.
          scheduledAt: new Date(
            new Date(existing.scheduledAt).getTime() -
              new Date(existing.scheduledAt).getTimezoneOffset() * 60000
          )
            .toISOString()
            .slice(0, 16),
          durationMins: existing.durationMins || 30,
        }
      : EMPTY
  );
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const rescheduling = Boolean(existing?.scheduledAt);
  const online = form.mode === 'online';

  const set = (field) => (e) => {
    const { value } = e.target;
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: '' } : prev));
  };

  /** The same three checks the server enforces, so the round trip is not the first to say no. */
  const validate = () => {
    const next = {};
    if (!form.scheduledAt) next.scheduledAt = 'Pick the interview date and time';
    else if (new Date(form.scheduledAt).getTime() <= Date.now())
      next.scheduledAt = 'The interview must be in the future';

    if (online) {
      if (!form.meetingLink.trim()) next.meetingLink = 'Add the meeting link';
      else if (!/^https?:\/\/\S+$/i.test(form.meetingLink.trim()))
        next.meetingLink = 'Enter a full URL, starting with https://';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      await onSubmit({
        scheduledAt: toISO(form.scheduledAt),
        mode: form.mode,
        location: online ? '' : form.location.trim(),
        meetingLink: online ? form.meetingLink.trim() : '',
        interviewer: form.interviewer.trim(),
        contactPhone: form.contactPhone.trim(),
        durationMins: form.durationMins || undefined,
        instructions: form.instructions.trim(),
      });
    } finally {
      // The parent closes on success; on failure the dialog stays up with the
      // draft intact, so a rejected slot does not have to be retyped.
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {rescheduling ? 'Reschedule interview' : 'Schedule interview'}
        <Typography variant="body2" color="text.secondary">
          {application?.position}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography variant="body2" color="text.secondary">
              Applicant:
            </Typography>
            <Typography variant="body2" fontWeight={700}>
              {application?.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {application?.email}
            </Typography>
          </Stack>

          <Alert severity="info">
            These details are emailed to the applicant as an interview invitation as soon as you
            {rescheduling ? ' resend' : ' save'} them.
          </Alert>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 7 }}>
              <TextField
                fullWidth
                required
                type="datetime-local"
                label="Interview date and time"
                value={form.scheduledAt}
                onChange={set('scheduledAt')}
                error={Boolean(errors.scheduledAt)}
                helperText={errors.scheduledAt || "Shown at the top of the applicant's invitation"}
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: earliest() }}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 5 }}>
              <TextField
                fullWidth
                select
                label="Duration"
                value={form.durationMins}
                onChange={set('durationMins')}
              >
                {DURATIONS.map((mins) => (
                  <MenuItem key={mins} value={mins}>
                    {mins} minutes
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid size={{ xs: 12, sm: 5 }}>
              <TextField fullWidth select label="Mode" value={form.mode} onChange={set('mode')}>
                {MODES.map((mode) => (
                  <MenuItem key={mode.value} value={mode.value}>
                    {mode.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* One "where" field, chosen by the mode — an address is meaningless
                for a video call, and a link is meaningless for a room. */}
            <Grid size={{ xs: 12, sm: 7 }}>
              {online ? (
                <TextField
                  fullWidth
                  required
                  label="Meeting link"
                  placeholder="https://meet.google.com/..."
                  value={form.meetingLink}
                  onChange={set('meetingLink')}
                  error={Boolean(errors.meetingLink)}
                  helperText={errors.meetingLink || 'The invitation carries a join button'}
                  inputProps={{ maxLength: 500 }}
                />
              ) : (
                <TextField
                  fullWidth
                  label={form.mode === 'phone' ? 'How we will call' : 'Venue'}
                  placeholder={
                    form.mode === 'phone' ? 'On your registered number' : 'Office address or room'
                  }
                  value={form.location}
                  onChange={set('location')}
                  helperText="Optional — printed in the invitation"
                  inputProps={{ maxLength: 200 }}
                />
              )}
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Interviewer"
                placeholder="e.g. Rahul Mehta, Engineering Lead"
                value={form.interviewer}
                onChange={set('interviewer')}
                helperText="Optional — who the candidate will meet"
                inputProps={{ maxLength: 80 }}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Contact number"
                placeholder="+91 9876543210"
                value={form.contactPhone}
                onChange={set('contactPhone')}
                helperText="Optional — someone to reach on the day"
                inputProps={{ maxLength: 20 }}
              />
            </Grid>

            <Grid size={12}>
              <TextField
                fullWidth
                multiline
                minRows={3}
                label="Instructions for the candidate"
                placeholder="What to bring, who to ask for, what the round will cover…"
                value={form.instructions}
                onChange={set('instructions')}
                helperText="Optional — printed under the interview details"
                inputProps={{ maxLength: 1000 }}
              />
            </Grid>
          </Grid>
        </Stack>
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
          {rescheduling ? 'Resend invitation' : 'Send invitation'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
