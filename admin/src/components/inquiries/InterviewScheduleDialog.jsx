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
import SendIcon from '@mui/icons-material/SendOutlined';
import DateTimePickerField from '../common/DateTimePickerField';
import PhoneField from '../common/PhoneField';

/** Mirrors INTERVIEW_MODES on the server's JobApplication model. */
const MODES = [
  { value: 'in-person', label: 'In person' },
  { value: 'online', label: 'Online / Video call' },
  { value: 'phone', label: 'Telephone' },
];

const DURATIONS = [15, 30, 45, 60, 90, 120];

/** The same 10 digit number every other phone field on the platform takes. */
const PHONE_RE = /^[6-9]\d{9}$/;

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
 * The picker speaks "YYYY-MM-DDTHH:mm" in the browser's own timezone and has no
 * concept of one, so the value is turned into a real instant here rather than
 * posted as typed — a bare local string would be read as UTC on the server and
 * land the interview hours away from the time HR picked.
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

  /**
   * The number is kept as the ten bare digits the platform stores everywhere
   * else, so anything that cannot be part of one never lands in the box —
   * spacing and a pasted country code are dropped as they arrive rather than
   * refused on submit.
   */
  const setPhone = (e) => {
    const digits = e.target.value.replace(/\D/g, '');
    // A pasted "+91 98765 43210" is the number, not a twelve digit one.
    const local = digits.length > 10 && digits.startsWith('91') ? digits.slice(2) : digits;
    setForm((f) => ({ ...f, contactPhone: local.slice(0, 10) }));
    setErrors((prev) => (prev.contactPhone ? { ...prev, contactPhone: '' } : prev));
  };

  /**
   * Switching the mode swaps the "where" field out, so its complaint goes with
   * it — a link error must not sit under a venue box the admin never filled in.
   */
  const setMode = (e) => {
    setForm((f) => ({ ...f, mode: e.target.value }));
    setErrors(({ location, meetingLink, ...rest }) => rest);
  };

  /**
   * The same checks the server enforces, so the round trip is not the first to
   * say no. Anything optional is only checked once it has been filled in: a
   * blank contact number is fine, a half-typed one is not.
   */
  const validate = () => {
    const next = {};

    const at = form.scheduledAt ? new Date(form.scheduledAt) : null;
    if (!at) next.scheduledAt = 'Pick the interview date and time';
    else if (Number.isNaN(at.getTime())) next.scheduledAt = 'Enter a valid interview date and time';
    else if (at.getTime() <= Date.now()) next.scheduledAt = 'The interview must be in the future';

    if (!DURATIONS.includes(Number(form.durationMins)))
      next.durationMins = 'Choose how long the round will run';

    if (online) {
      const link = form.meetingLink.trim();
      if (!link) next.meetingLink = 'Add the meeting link';
      else if (!/^https?:\/\/\S+\.\S+/i.test(link))
        next.meetingLink = 'Enter a full URL, starting with https://';
    } else if (form.mode === 'in-person' && !form.location.trim()) {
      // An in-person invitation with no address cannot be acted on, so this one
      // "where" is the one the mail cannot go out without.
      next.location = 'Add where the candidate should come';
    }

    const interviewer = form.interviewer.trim();
    if (interviewer && interviewer.length < 2) next.interviewer = "Enter the interviewer's name";

    if (form.contactPhone && !PHONE_RE.test(form.contactPhone))
      next.contactPhone = 'Enter a valid 10 digit mobile number';

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
              <DateTimePickerField
                required
                label="Interview date and time"
                value={form.scheduledAt}
                onChange={set('scheduledAt')}
                error={Boolean(errors.scheduledAt)}
                helperText={errors.scheduledAt || "Shown at the top of the applicant's invitation"}
                min={earliest()}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 5 }}>
              <TextField
                fullWidth
                select
                label="Duration"
                value={form.durationMins}
                onChange={set('durationMins')}
                error={Boolean(errors.durationMins)}
                helperText={errors.durationMins}
              >
                {DURATIONS.map((mins) => (
                  <MenuItem key={mins} value={mins}>
                    {mins} minutes
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid size={{ xs: 12, sm: 5 }}>
              <TextField fullWidth select label="Mode" value={form.mode} onChange={setMode}>
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
                  // A room is the one "where" the invitation cannot do without;
                  // a phone round already has the number it was applied with.
                  required={form.mode === 'in-person'}
                  label={form.mode === 'phone' ? 'How we will call' : 'Venue'}
                  placeholder={
                    form.mode === 'phone' ? 'On your registered number' : 'Office address or room'
                  }
                  value={form.location}
                  onChange={set('location')}
                  error={Boolean(errors.location)}
                  helperText={
                    errors.location ||
                    (form.mode === 'in-person'
                      ? 'Printed in the invitation'
                      : 'Optional — printed in the invitation')
                  }
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
                error={Boolean(errors.interviewer)}
                helperText={errors.interviewer || 'Optional — who the candidate will meet'}
                inputProps={{ maxLength: 80 }}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <PhoneField
                fullWidth
                label="Contact number"
                placeholder="Enter 10 digit number"
                value={form.contactPhone}
                onChange={setPhone}
                error={Boolean(errors.contactPhone)}
                helperText={
                  errors.contactPhone || 'Optional — a 10 digit number to reach on the day'
                }
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
          // Leading, and tilted up out of the button the way a paper plane is
          // actually thrown — the flat, straight-right default reads as an arrow.
          // The spinner takes the same slot untilted, so nothing shifts on save.
          startIcon={
            saving ? (
              <CircularProgress size={15} color="inherit" />
            ) : (
              <SendIcon sx={{ transform: 'rotate(-45deg)' }} />
            )
          }
        >
          {rescheduling ? 'Resend invitation' : 'Send invitation'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
