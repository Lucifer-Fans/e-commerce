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
import Tooltip from '@mui/material/Tooltip';

import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import ImageIcon from '@mui/icons-material/ImageOutlined';

import { categoryApi, subCategoryApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import { useLiveRefetch } from '../realtime/useRealtime';
import { TAXONOMY_EVENTS } from '../realtime/events';
import PageHeader from '../components/common/PageHeader';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';
import AssetPicker from '../components/common/AssetPicker';
import TranslationEditor from '../components/common/TranslationEditor';
import { pruneTranslations } from '../utils/languages';

const EMPTY_IMAGE = { url: '', publicId: '' };
const EMPTY_CATEGORY = { name: '', description: '', image: EMPTY_IMAGE, displayOrder: 0, isActive: true, translations: {} };
const EMPTY_SUB = { name: '', category: '', description: '', image: EMPTY_IMAGE, displayOrder: 0, isActive: true, translations: {} };

/** Server documents leave `image` undefined; the picker always wants both keys. */
const asset = (value) => ({ url: value?.url || '', publicId: value?.publicId || '' });

/** Square thumbnail with a neutral placeholder, so rows stay aligned without an image. */
function Thumb({ src, alt, size = 40 }) {
  return (
    <Box
      sx={{
        flexShrink: 0,
        width: size,
        height: size,
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
      {src ? (
        <Box
          component="img"
          src={src}
          alt={alt}
          loading="lazy"
          sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <ImageIcon sx={{ fontSize: Math.max(14, size * 0.5) }} />
      )}
    </Box>
  );
}

function CategoryDialog({ open, initial, categories, mode, onClose, onSaved }) {
  const { enqueueSnackbar } = useSnackbar();
  const isSub = mode === 'sub';

  const [values, setValues] = useState(() => {
    const base = initial || (isSub ? EMPTY_SUB : EMPTY_CATEGORY);
    return { ...base, image: asset(base.image), translations: base.translations || {} };
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
    if (isSub && !values.category) found.category = 'Select a parent category';
    if (Object.keys(found).length) return setErrors(found);

    setSaving(true);
    try {
      const payload = {
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        // Always sent, so clearing the picker clears the stored image too.
        image: asset(values.image),
        displayOrder: Number(values.displayOrder) || 0,
        isActive: values.isActive,
        // Pruned so a language the admin merely clicked into isn't stored as blanks,
        // which would read as "translated to nothing" and hide the English fallback.
        translations: pruneTranslations(values.translations) ?? null,
        ...(isSub ? { category: values.category } : {}),
      };

      const api = isSub ? subCategoryApi : categoryApi;
      if (values._id) await api.update(values._id, payload);
      else await api.create(payload);

      enqueueSnackbar(values._id ? 'Saved' : 'Created', { variant: 'success' });
      onSaved();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not save', { variant: 'error' });
      if (err.errors?.length) {
        setErrors(Object.fromEntries(err.errors.map((e) => [e.field, e.message])));
      }
    } finally {
      setSaving(false);
    }
  };

  // `md`, not `sm`: the translation tabs need the width to stay readable.
  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {values._id ? 'Edit' : 'New'} {isSub ? 'sub-category' : 'category'}
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5}>
          <Box sx={{ maxWidth: 200, mx: 'auto', width: '100%' }}>
            <AssetPicker
              label="Image"
              kind="categories"
              hint={`Square artwork, around 400×400px — shown beside the ${
                isSub ? 'sub-category' : 'category'
              } on the storefront`}
              value={values.image}
              onChange={(image) => setValues((v) => ({ ...v, image: asset(image) }))}
            />
          </Box>

          {isSub && (
            <TextField
              select
              fullWidth
              required
              label="Parent category"
              value={values.category}
              onChange={set('category')}
              error={Boolean(errors.category)}
              helperText={errors.category}
            >
              {categories.map((c) => (
                <MenuItem key={c._id} value={c._id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
          )}

          <TextField
            fullWidth
            required
            label="Name"
            value={values.name}
            onChange={set('name')}
            error={Boolean(errors.name)}
            helperText={errors.name}
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

          <Divider sx={{ pt: 1 }}>
            <Typography variant="overline" color="text.secondary">
              Translations
            </Typography>
          </Divider>

          <TranslationEditor
            value={values.translations}
            onChange={(translations) => setValues((v) => ({ ...v, translations }))}
            fields={[
              { name: 'name', label: 'Name', source: values.name },
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

export default function Categories() {
  const { enqueueSnackbar } = useSnackbar();
  const query = useFetch(useCallback(() => categoryApi.list(), []), []);
  const categories = query.data?.data?.categories || [];

  // The tree is shared editing surface — reflect what other admins do to it.
  useLiveRefetch(query.refetch, TAXONOMY_EVENTS);

  const [dialog, setDialog] = useState(null); // { mode, initial }
  const [deleting, setDeleting] = useState(null); // { mode, item }

  const remove = async () => {
    const api = deleting.mode === 'sub' ? subCategoryApi : categoryApi;
    try {
      await api.remove(deleting.item._id);
      enqueueSnackbar('Deleted', { variant: 'success' });
      query.refetch();
    } catch (err) {
      enqueueSnackbar(err.message || 'Could not delete', { variant: 'error' });
    }
  };

  return (
    <Box>
      <PageHeader
        title="Categories"
        subtitle="The storefront navigation and filters are built from this list"
        breadcrumbs={[{ label: 'Categories' }]}
        action={
          <Stack direction="row" spacing={1.5}>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              disabled={categories.length === 0}
              onClick={() => setDialog({ mode: 'sub', initial: null })}
            >
              Sub-category
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setDialog({ mode: 'category', initial: null })}
            >
              Add Category
            </Button>
          </Stack>
        }
      />

      {query.loading && <LinearProgress sx={{ mb: 2 }} />}

      {!query.loading && categories.length === 0 ? (
        <Card>
          <EmptyState
            title="No categories yet"
            message="Create your first category — products cannot be published without one."
            actionLabel="Add Category"
            onAction={() => setDialog({ mode: 'category', initial: null })}
          />
        </Card>
      ) : (
        <Grid container spacing={2.5}>
          {categories.map((category) => (
            <Grid key={category._id} size={{ xs: 12, md: 6, xl: 4 }}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                      <Thumb src={category.image?.url} alt={category.name} size={44} />
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="h6" noWrap>
                            {category.name}
                          </Typography>
                          {!category.isActive && <Chip label="Hidden" size="small" color="warning" />}
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          /{category.slug} · order {category.displayOrder}
                        </Typography>
                      </Box>
                    </Stack>

                    <Stack direction="row" spacing={0.25}>
                      <Tooltip title="Edit category">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => setDialog({ mode: 'category', initial: category })}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete category">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setDeleting({ mode: 'category', item: category })}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>

                  {category.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      {category.description}
                    </Typography>
                  )}
                </CardContent>

                <Divider />

                <CardContent sx={{ pt: 2 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700} textTransform="uppercase">
                    Sub-categories ({category.subCategories?.length || 0})
                  </Typography>

                  {category.subCategories?.length ? (
                    <Stack spacing={0.5} sx={{ mt: 1 }}>
                      {category.subCategories.map((sub) => (
                        <Stack
                          key={sub._id}
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                          sx={{ py: 0.5, px: 1, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}
                        >
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                            <Thumb src={sub.image?.url} alt={sub.name} size={26} />
                            <Typography variant="body2" noWrap>
                              {sub.name}
                            </Typography>
                            {!sub.isActive && <Chip label="Hidden" size="small" color="warning" />}
                          </Stack>

                          <Stack direction="row" spacing={0.25}>
                            <IconButton
                              size="small"
                              onClick={() =>
                                setDialog({
                                  mode: 'sub',
                                  initial: { ...sub, category: sub.category || category._id },
                                })
                              }
                            >
                              <EditIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => setDeleting({ mode: 'sub', item: sub })}
                            >
                              <DeleteIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Stack>
                        </Stack>
                      ))}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
                      None yet
                    </Typography>
                  )}

                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    sx={{ mt: 1 }}
                    onClick={() =>
                      setDialog({ mode: 'sub', initial: { ...EMPTY_SUB, category: category._id } })
                    }
                  >
                    Add sub-category
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {dialog && (
        <CategoryDialog
          open
          mode={dialog.mode}
          initial={dialog.initial}
          categories={categories}
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
        title={`Delete this ${deleting?.mode === 'sub' ? 'sub-category' : 'category'}?`}
        message={`"${deleting?.item?.name}" will be removed. This is blocked if any products still use it.`}
        confirmLabel="Delete"
      />
    </Box>
  );
}
