import { useCallback, useState } from 'react';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Alert from '@mui/material/Alert';

import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutline';

import { bannerApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import { useLiveRefetch } from '../realtime/useRealtime';
import { EVENTS } from '../realtime/events';
import PageHeader from '../components/common/PageHeader';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';
import ImageUploader from '../components/products/ImageUploader';

const EMPTY = {
  title: '', subtitle: '', ctaLabel: 'Shop Now', ctaLink: '/products',
  placement: 'hero', theme: 'dark', displayOrder: 0, isActive: true, image: null,
};

function BannerDialog({ initial, onClose, onSaved }) {
  const { enqueueSnackbar } = useSnackbar();
  const [values, setValues] = useState(initial || EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) =>
    setValues((v) => ({
      ...v,
      [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  const submit = async () => {
    const found = {};
    if (values.title.trim().length < 2) found.title = 'A title is required';
    if (!values.image?.url) found.image = 'Upload a banner image';
    if (Object.keys(found).length) return setErrors(found);

    setSaving(true);
    try {
      const payload = {
        title: values.title.trim(),
        subtitle: values.subtitle?.trim() || undefined,
        ctaLabel: values.ctaLabel?.trim() || 'Shop Now',
        ctaLink: values.ctaLink?.trim() || '/products',
        placement: values.placement,
        theme: values.theme,
        displayOrder: Number(values.displayOrder) || 0,
        isActive: values.isActive,
        image: { url: values.image.url, publicId: values.image.publicId },
      };

      if (values._id) await bannerApi.update(values._id, payload);
      else await bannerApi.create(payload);

      enqueueSnackbar(values._id ? 'Banner updated' : 'Banner created', { variant: 'success' });
      onSaved();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not save the banner', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={saving ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{values._id ? 'Edit banner' : 'New banner'}</DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Banner image
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Landscape works best — around 1600×600px.
            </Typography>

            {/* The uploader is array-based; a banner holds exactly one image. */}
            <ImageUploader
              max={1}
              value={values.image ? [values.image] : []}
              onChange={(images) => {
                setValues((v) => ({ ...v, image: images[0] || null }));
                setErrors((e) => ({ ...e, image: undefined }));
              }}
            />
            {errors.image && (
              <Alert severity="error" sx={{ mt: 1.5 }}>
                {errors.image}
              </Alert>
            )}
          </Box>

          <TextField
            fullWidth
            required
            label="Title"
            value={values.title}
            onChange={set('title')}
            error={Boolean(errors.title)}
            helperText={errors.title}
            inputProps={{ maxLength: 120 }}
          />

          <TextField
            fullWidth
            label="Subtitle"
            value={values.subtitle || ''}
            onChange={set('subtitle')}
            inputProps={{ maxLength: 200 }}
          />

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Button label"
                value={values.ctaLabel || ''}
                onChange={set('ctaLabel')}
                inputProps={{ maxLength: 40 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Button link"
                value={values.ctaLink || ''}
                onChange={set('ctaLink')}
                helperText="e.g. /products?category=power-tools"
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField select fullWidth label="Placement" value={values.placement} onChange={set('placement')}>
                <MenuItem value="hero">Hero slider</MenuItem>
                <MenuItem value="strip">Promo strip</MenuItem>
                <MenuItem value="sidebar">Sidebar</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                select
                fullWidth
                label="Text colour"
                value={values.theme}
                onChange={set('theme')}
                helperText="Pick the one that reads over your image"
              >
                <MenuItem value="dark">Light text on dark overlay</MenuItem>
                <MenuItem value="light">Dark text on light overlay</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                type="number"
                label="Display order"
                value={values.displayOrder}
                onChange={set('displayOrder')}
                inputProps={{ min: 0 }}
              />
            </Grid>
          </Grid>

          <FormControlLabel
            control={<Switch checked={values.isActive} onChange={set('isActive')} />}
            label={<Typography variant="body2">Show on the storefront</Typography>}
          />
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
          Save banner
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Banners() {
  const { enqueueSnackbar } = useSnackbar();
  const query = useFetch(useCallback(() => bannerApi.list(), []), []);
  const banners = query.data?.data?.banners || [];

  // Two admins curating the homepage see each other's changes.
  useLiveRefetch(query.refetch, EVENTS.BANNER_CHANGED);

  const [dialog, setDialog] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const remove = async () => {
    try {
      await bannerApi.remove(deleting._id);
      enqueueSnackbar('Banner deleted', { variant: 'success' });
      query.refetch();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not delete the banner', { variant: 'error' });
    }
  };

  const toggleActive = async (banner) => {
    try {
      await bannerApi.update(banner._id, { isActive: !banner.isActive });
      query.refetch();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not update the banner', { variant: 'error' });
    }
  };

  return (
    <Box>
      <PageHeader
        title="Banners"
        subtitle="Slides shown at the top of the storefront homepage"
        breadcrumbs={[{ label: 'Banners' }]}
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({})}>
            Add Banner
          </Button>
        }
      />

      {query.loading && <LinearProgress sx={{ mb: 2 }} />}

      {!query.loading && banners.length === 0 ? (
        <Card>
          <EmptyState
            title="No banners yet"
            message="The homepage hero slider stays hidden until you publish at least one banner."
            actionLabel="Add Banner"
            onAction={() => setDialog({})}
          />
        </Card>
      ) : (
        <Grid container spacing={2.5}>
          {banners.map((banner) => (
            <Grid key={banner._id} size={{ xs: 12, md: 6 }}>
              <Card>
                <Box sx={{ position: 'relative', aspectRatio: '16/6', bgcolor: 'grey.200' }}>
                  <Box
                    component="img"
                    src={banner.image?.url}
                    alt={banner.title}
                    loading="lazy"
                    sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <Stack direction="row" spacing={0.75} sx={{ position: 'absolute', top: 10, left: 10 }}>
                    <Chip label={`#${banner.displayOrder}`} size="small" sx={{ bgcolor: 'rgba(15,23,42,.8)', color: '#fff' }} />
                    <Chip label={banner.placement} size="small" color="primary" />
                    {!banner.isActive && <Chip label="Hidden" size="small" color="warning" />}
                  </Stack>
                </Box>

                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle1" fontWeight={700} noWrap>
                        {banner.title}
                      </Typography>
                      {banner.subtitle && (
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {banner.subtitle}
                        </Typography>
                      )}
                      <Typography variant="caption" color="text.disabled">
                        {banner.ctaLabel} → {banner.ctaLink}
                      </Typography>
                    </Box>

                    <Stack direction="row" spacing={0.25}>
                      <IconButton size="small" color="primary" onClick={() => setDialog(banner)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => setDeleting(banner)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Stack>

                  <FormControlLabel
                    sx={{ mt: 1 }}
                    control={<Switch size="small" checked={banner.isActive} onChange={() => toggleActive(banner)} />}
                    label={<Typography variant="body2">Active</Typography>}
                  />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {dialog && (
        <BannerDialog
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
        title="Delete this banner?"
        message={`"${deleting?.title}" will be removed from the homepage and its image deleted.`}
        confirmLabel="Delete"
      />
    </Box>
  );
}
