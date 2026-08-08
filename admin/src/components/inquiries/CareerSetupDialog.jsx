import { useState } from 'react';
import { useSnackbar } from 'notistack';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Grid from '@mui/material/Grid2';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import SaveIcon from '@mui/icons-material/SaveOutlined';

import { careerApi } from '../../api/endpoints';

const EMPLOYMENT_TYPES = [
  { value: 'full-time', label: 'Full time' },
  { value: 'part-time', label: 'Part time' },
  { value: 'internship', label: 'Internship' },
  { value: 'contract', label: 'Contract' },
];

const EMPTY_POSITION = { title: '', department: '', location: '', type: 'full-time' };

/**
 * The careers page's two admin-owned pieces, in one dialog:
 * the open-roles list that fills its "Position Applying For" dropdown, and the
 * "Contact HR" card. Nothing about the careers page is hardcoded in the storefront.
 */
export default function CareerSetupDialog({ positions, hr, onClose, onChanged }) {
  const { enqueueSnackbar } = useSnackbar();

  const [draft, setDraft] = useState(EMPTY_POSITION);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const [contact, setContact] = useState({ hrEmail: hr?.email || '', hrPhone: hr?.phone || '' });
  const [savingContact, setSavingContact] = useState(false);

  const addPosition = async () => {
    if (draft.title.trim().length < 2) return setError('Enter a position title');

    setAdding(true);
    try {
      await careerApi.createPosition({
        title: draft.title.trim(),
        department: draft.department.trim(),
        location: draft.location.trim(),
        type: draft.type,
        // New roles land at the end of the storefront dropdown.
        displayOrder: positions.length,
      });
      enqueueSnackbar('Position added', { variant: 'success' });
      setDraft(EMPTY_POSITION);
      onChanged();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not add the position', { variant: 'error' });
    } finally {
      setAdding(false);
    }
  };

  const togglePosition = async (position) => {
    try {
      await careerApi.updatePosition(position._id, { isActive: !position.isActive });
      onChanged();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not update the position', { variant: 'error' });
    }
  };

  const removePosition = async (position) => {
    try {
      await careerApi.removePosition(position._id);
      enqueueSnackbar('Position removed', { variant: 'success' });
      onChanged();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not remove the position', { variant: 'error' });
    }
  };

  const saveContact = async () => {
    setSavingContact(true);
    try {
      await careerApi.updateConfig(contact);
      enqueueSnackbar('HR contact details saved', { variant: 'success' });
      onChanged();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not save the HR contact details', { variant: 'error' });
    } finally {
      setSavingContact(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Careers page setup</DialogTitle>

      <DialogContent dividers>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          Open positions
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          These fill the &ldquo;Position Applying For&rdquo; dropdown on the storefront careers page.
          Switch a role off to close it without losing the applications it received.
        </Typography>

        <Grid container spacing={1.5} alignItems="flex-start" sx={{ mb: 2 }}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              fullWidth
              size="small"
              label="Position title"
              placeholder="e.g. Spring Designer"
              value={draft.title}
              onChange={(e) => {
                setDraft((d) => ({ ...d, title: e.target.value }));
                if (error) setError('');
              }}
              error={Boolean(error)}
              helperText={error}
              inputProps={{ maxLength: 80 }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField
              fullWidth
              size="small"
              label="Department"
              value={draft.department}
              onChange={(e) => setDraft((d) => ({ ...d, department: e.target.value }))}
              inputProps={{ maxLength: 60 }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField
              fullWidth
              size="small"
              select
              label="Type"
              value={draft.type}
              onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
            >
              {EMPLOYMENT_TYPES.map((type) => (
                <MenuItem key={type.value} value={type.value}>
                  {type.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 2 }}>
            <Button
              fullWidth
              variant="contained"
              onClick={addPosition}
              disabled={adding}
              startIcon={adding ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}
            >
              Add
            </Button>
          </Grid>
        </Grid>

        <Stack spacing={1}>
          {positions.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No positions yet — the careers form stays disabled until at least one role is open.
            </Typography>
          )}

          {positions.map((position) => (
            <Stack
              key={position._id}
              direction="row"
              alignItems="center"
              spacing={1.5}
              sx={{ p: 1.25, borderRadius: 2, border: 1, borderColor: 'divider' }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={700} noWrap>
                  {position.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {[position.department, position.location, position.type].filter(Boolean).join(' · ')}
                </Typography>
              </Box>

              <Chip
                label={position.isActive ? 'Open' : 'Closed'}
                size="small"
                color={position.isActive ? 'success' : 'default'}
              />
              <Tooltip title={position.isActive ? 'Close this role' : 'Reopen this role'}>
                <Switch
                  size="small"
                  checked={position.isActive}
                  onChange={() => togglePosition(position)}
                />
              </Tooltip>
              <Tooltip title="Remove permanently">
                <IconButton size="small" color="error" onClick={() => removePosition(position)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          ))}
        </Stack>

        <Divider sx={{ my: 3 }} />

        <Typography variant="h6" sx={{ mb: 0.5 }}>
          Contact HR
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Shown in the sidebar card on the careers page. Leave a field blank to hide it.
        </Typography>

        <Grid container spacing={2} alignItems="flex-start">
          <Grid size={{ xs: 12, sm: 5 }}>
            <TextField
              fullWidth
              size="small"
              label="HR email"
              placeholder="hr@example.com"
              value={contact.hrEmail}
              onChange={(e) => setContact((c) => ({ ...c, hrEmail: e.target.value }))}
              inputProps={{ maxLength: 120 }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 5 }}>
            <TextField
              fullWidth
              size="small"
              label="HR phone"
              placeholder="+91 9876543210"
              value={contact.hrPhone}
              onChange={(e) => setContact((c) => ({ ...c, hrPhone: e.target.value }))}
              inputProps={{ maxLength: 24 }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 2 }}>
            <Button
              fullWidth
              variant="outlined"
              onClick={saveContact}
              disabled={savingContact}
              startIcon={savingContact ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
            >
              Save
            </Button>
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="contained" onClick={onClose}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
