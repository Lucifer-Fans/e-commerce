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
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';

import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import ImageIcon from '@mui/icons-material/ImageOutlined';
import LaunchIcon from '@mui/icons-material/LaunchOutlined';

import { brandApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import { useLiveRefetch } from '../realtime/useRealtime';
import { BRAND_EVENTS } from '../realtime/events';
import PageHeader from '../components/common/PageHeader';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';
import AssetPicker from '../components/common/AssetPicker';
import TranslationEditor from '../components/common/TranslationEditor';
import { pruneTranslations } from '../utils/languages';

const EMPTY_BRAND = {
  name: '',
  description: '',
  website: '',
  logo: { url: '', publicId: '' },
  displayOrder: 0,
  isActive: true,
  isFeatured: false,
  translations: {},
};

/** Server documents leave `logo` undefined; the picker always wants both keys. */
const asset = (value) => ({ url: value?.url || '', publicId: value?.publicId || '' });

function BrandDialog({ initial, onClose, onSaved }) {
  const { enqueueSnackbar } = useSnackbar();

  const [values, setValues] = useState(() => {
    const base = initial || EMPTY_BRAND;
    return { ...base, logo: asset(base.logo), translations: base.translations || {} };
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) =>
    setValues((v) => ({
      ...v,
      [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  const submit = async () => {
    const found = {};
    if (values.name.trim().length < 2) found.name = 'Name must be at least 2 characters';
    if (values.website?.trim() && !/^https?:\/\//i.test(values.website.trim())) {
      found.website = 'Start the link with https://';
    }
    if (Object.keys(found).length) return setErrors(found);

    setSaving(true);
    try {
      const payload = {
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        website: values.website?.trim() || undefined,
        // Always sent, so clearing the picker clears the stored logo too.
        logo: asset(values.logo),
        displayOrder: Number(values.displayOrder) || 0,
        isActive: values.isActive,
        isFeatured: values.isFeatured,
        translations: pruneTranslations(values.translations) ?? null,
      };

      if (values._id) await brandApi.update(values._id, payload);
      else await brandApi.create(payload);

      enqueueSnackbar(values._id ? 'Brand updated' : 'Brand created', { variant: 'success' });
      onSaved();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not save the brand', { variant: 'error' });
      if (err.errors?.length) {
        setErrors(Object.fromEntries(err.errors.map((e) => [e.field, e.message])));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={saving ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{values._id ? 'Edit brand' : 'New brand'}</DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5}>
          <Box sx={{ maxWidth: 200, mx: 'auto', width: '100%' }}>
            <AssetPicker
              label="Logo"
              kind="brands"
              hint="Transparent PNG works best, around 400×400px"
              value={values.logo}
              onChange={(logo) => setValues((v) => ({ ...v, logo: asset(logo) }))}
            />
          </Box>

          <TextField
            fullWidth
            required
            label="Name"
            value={values.name}
            onChange={set('name')}
            error={Boolean(errors.name)}
            helperText={
              errors.name ||
              (values._id ? 'Renaming also updates every product carrying this brand' : ' ')
            }
            inputProps={{ maxLength: 60 }}
          />

          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Description"
            value={values.description || ''}
            onChange={set('description')}
            inputProps={{ maxLength: 500 }}
          />

          <TextField
            fullWidth
            label="Website"
            value={values.website || ''}
            onChange={set('website')}
            error={Boolean(errors.website)}
            helperText={errors.website || 'Optional — e.g. https://brand.com'}
            inputProps={{ maxLength: 300 }}
          />

          <TextField
            fullWidth
            type="number"
            label="Display order"
            value={values.displayOrder}
            onChange={set('displayOrder')}
            helperText="Lower numbers appear first"
            inputProps={{ min: 0 }}
          />

          <FormControlLabel
            control={<Switch checked={values.isActive} onChange={set('isActive')} />}
            label={<Typography variant="body2">Visible on the storefront</Typography>}
          />
          <FormControlLabel
            control={<Switch checked={values.isFeatured} onChange={set('isFeatured')} />}
            label={<Typography variant="body2">Highlight as a featured brand</Typography>}
          />

          <Divider sx={{ pt: 1 }}>
            <Typography variant="overline" color="text.secondary">
              Translations
            </Typography>
          </Divider>

          {/*
            The brand *name* is not translatable: products store it as a plain string and
            the storefront filter, the search index and past orders all match on it.
          */}
          <TranslationEditor
            value={values.translations}
            onChange={(translations) => setValues((v) => ({ ...v, translations }))}
            fields={[
              {
                name: 'description',
                label: 'Description',
                source: values.description,
                multiline: true,
              },
            ]}
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
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Brands() {
  const { enqueueSnackbar } = useSnackbar();
  const query = useFetch(useCallback(() => brandApi.list(), []), []);
  const brands = query.data?.data?.brands || [];

  // Shared editing surface — reflect what other admins do to it.
  useLiveRefetch(query.refetch, BRAND_EVENTS);

  const [dialog, setDialog] = useState(null); // { ...brand } or {} for a new one
  const [deleting, setDeleting] = useState(null);

  const remove = async () => {
    try {
      await brandApi.remove(deleting._id);
      enqueueSnackbar('Brand deleted', { variant: 'success' });
      query.refetch();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not delete the brand', { variant: 'error' });
    }
  };

  return (
    <Box>
      <PageHeader
        title="Brands"
        subtitle="The brand list offered on the product form and used by the storefront filters"
        breadcrumbs={[{ label: 'Brands' }]}
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({})}>
            Add Brand
          </Button>
        }
      />

      {query.loading && <LinearProgress sx={{ mb: 2 }} />}

      {!query.loading && brands.length === 0 ? (
        <Card>
          <EmptyState
            title="No brands yet"
            message="Add the brands you stock — the product form offers this list, and shoppers filter by it."
            actionLabel="Add Brand"
            onAction={() => setDialog({})}
          />
        </Card>
      ) : (
        <Grid container spacing={2.5}>
          {brands.map((brand) => (
            <Grid key={brand._id} size={{ xs: 12, md: 6, xl: 4 }}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flex: 1 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                      <Box
                        sx={{
                          flexShrink: 0,
                          width: 52,
                          height: 52,
                          borderRadius: 1.5,
                          overflow: 'hidden',
                          display: 'grid',
                          placeItems: 'center',
                          bgcolor: 'grey.100',
                          border: 1,
                          borderColor: 'divider',
                          color: 'text.disabled',
                        }}
                      >
                        {brand.logo?.url ? (
                          <Box
                            component="img"
                            src={brand.logo.url}
                            alt={brand.name}
                            loading="lazy"
                            sx={{ width: '100%', height: '100%', objectFit: 'contain', p: 0.75 }}
                          />
                        ) : (
                          <ImageIcon sx={{ fontSize: 24 }} />
                        )}
                      </Box>

                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="h6" noWrap>
                            {brand.name}
                          </Typography>
                          {!brand.isActive && <Chip label="Hidden" size="small" color="warning" />}
                          {brand.isFeatured && <Chip label="Featured" size="small" color="primary" />}
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          /{brand.slug} · order {brand.displayOrder}
                        </Typography>
                      </Box>
                    </Stack>

                    <Stack direction="row" spacing={0.25}>
                      <Tooltip title="Edit brand">
                        <IconButton size="small" color="primary" onClick={() => setDialog(brand)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete brand">
                        <IconButton size="small" color="error" onClick={() => setDeleting(brand)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>

                  {brand.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                      {brand.description}
                    </Typography>
                  )}
                </CardContent>

                <Divider />

                <CardContent sx={{ py: 1.5 }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>
                      {brand.productCount || 0} product{brand.productCount === 1 ? '' : 's'}
                    </Typography>

                    {brand.website && (
                      <Link
                        href={brand.website}
                        target="_blank"
                        rel="noreferrer"
                        variant="caption"
                        underline="hover"
                        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}
                      >
                        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {brand.website.replace(/^https?:\/\//i, '')}
                        </Box>
                        <LaunchIcon sx={{ fontSize: 13 }} />
                      </Link>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {dialog && (
        <BrandDialog
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
        title="Delete this brand?"
        message={`"${deleting?.name}" will be removed. This is blocked if any products still use it.`}
        confirmLabel="Delete"
      />
    </Box>
  );
}
