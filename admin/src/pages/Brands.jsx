import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import CloseIcon from '@mui/icons-material/Close';

import { brandApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import { useLiveRefetch } from '../realtime/useRealtime';
import { BRAND_EVENTS } from '../realtime/events';
import PageHeader from '../components/common/PageHeader';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';
import ImageUploader from '../components/products/ImageUploader';

const EMPTY_BRAND = {
  name: '',
  description: '',
  website: '',
  logo: { url: '', publicId: '' },
  displayOrder: 0,
  isActive: true,
  isFeatured: false,
};

/**
 * The product list inside a brand card, sized in rows for the same reason the
 * sub-category list on the Categories page is: the row count is the decision, and
 * the card height follows from it. A row is a 26px thumbnail with 4px of padding
 * either side, plus the `spacing={0.5}` gap between rows.
 */
const VISIBLE_PRODUCT_ROWS = 5;
const PRODUCT_ROW_HEIGHT = 34;
const PRODUCT_ROW_GAP = 4;
const PRODUCT_LIST_MAX_HEIGHT =
  VISIBLE_PRODUCT_ROWS * PRODUCT_ROW_HEIGHT + (VISIBLE_PRODUCT_ROWS - 1) * PRODUCT_ROW_GAP;

/**
 * Everything in the card that is not the list: header, description slot, website line,
 * divider, the products heading and the "Add product" button, with their padding. A
 * floor rather than a hard height — a card that is pinned shorter than its own contents
 * would clip the last row instead of showing it, and Grid rows are equal-height, so a
 * card that does take an extra pixel brings its neighbours with it.
 */
// 160 header (52px logo row, two-line description, website line, 16px padding either
// side) + 1 divider + 99 below it (16 padding, 20 heading, 8 list margin, 39 button,
// 16 padding).
const CARD_CHROME_HEIGHT = 260;
const CARD_HEIGHT = CARD_CHROME_HEIGHT + PRODUCT_LIST_MAX_HEIGHT;

/** Server documents leave `logo` undefined; the picker always wants both keys. */
const asset = (value) => ({ url: value?.url || '', publicId: value?.publicId || '' });

/** Square thumbnail with a neutral placeholder, so rows stay aligned without an image. */
function Thumb({ src, alt, size = 26 }) {
  return (
    <Box
      sx={{
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: 1,
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

function BrandDialog({ initial, brandCount, onClose, onSaved }) {
  const { enqueueSnackbar } = useSnackbar();

  const [values, setValues] = useState(() => {
    const base = initial || { ...EMPTY_BRAND, displayOrder: brandCount };
    return { ...base, logo: asset(base.logo) };
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  /**
   * A new brand is offered the end of the list, so the admin never has to work the
   * next free number out. Typing a number another brand already holds is fine — the
   * server splices this one in and pushes the rest down — but a number past the end
   * of the list is not a position, so it lands on the last one instead.
   */
  const maxOrder = values._id ? Math.max(brandCount - 1, 0) : brandCount;

  const set = (field) => (e) =>
    setValues((v) => ({
      ...v,
      [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  const submit = async () => {
    const found = {};
    const name = values.name.trim();
    if (!name) found.name = 'Enter brand name';
    else if (name.length < 2) found.name = 'Name must be at least 2 characters';
    if (values.website?.trim() && !/^https?:\/\//i.test(values.website.trim())) {
      found.website = 'Start the link with https://';
    }
    if (Object.keys(found).length) {
      setErrors(found);
      enqueueSnackbar('Please fill the required fields first', { variant: 'warning' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        website: values.website?.trim() || undefined,
        // Always sent, so clearing the picker clears the stored logo too.
        logo: asset(values.logo),
        displayOrder: Math.min(Math.max(Number(values.displayOrder) || 0, 0), maxOrder),
        isActive: values.isActive,
        isFeatured: values.isFeatured,
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
      <DialogTitle sx={{ fontWeight: 700, pr: 6 }}>
        {values._id ? 'Edit brand' : 'New brand'}
        <IconButton
          onClick={onClose}
          size="small"
          disabled={saving}
          sx={{ position: 'absolute', right: 12, top: 12, color: 'text.secondary' }}
          aria-label="Close without saving"
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Brand logo
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Square artwork works best — around 400×400px, ideally a transparent PNG.
            </Typography>

            {/* The uploader is array-based; a brand holds exactly one logo. The controller
                frees the replaced asset when the change is saved, so this one must not
                destroy anything on its own. */}
            <ImageUploader
              max={1}
              kind="brands"
              subject="the brand logo"
              destroyOnRemove={false}
              // One logo is the whole allowance here, so the drop zone steps aside once
              // it is taken; the tile below still replaces and deletes.
              hideDropzoneWhenFull
              value={values.logo?.url ? [values.logo] : []}
              onChange={(images) => setValues((v) => ({ ...v, logo: asset(images[0]) }))}
            />
          </Box>

          <TextField
            fullWidth
            required
            label="Name"
            value={values.name}
            onChange={set('name')}
            error={Boolean(errors.name)}
            // The rename warning is only true when editing; a new brand gets no helper
            // line at all, rather than a blank one holding space open under the field.
            helperText={
              errors.name || (values._id ? 'Renaming also updates every product carrying this brand' : undefined)
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
            label="Brand website"
            value={values.website || ''}
            onChange={set('website')}
            error={Boolean(errors.website)}
            // Only speaks up when the link is malformed — the field is optional, and the
            // rule about the https:// prefix is stated at the moment it is broken.
            helperText={errors.website}
            inputProps={{ maxLength: 300 }}
          />

          <TextField
            fullWidth
            type="number"
            label="Display order"
            value={values.displayOrder}
            onChange={set('displayOrder')}
            helperText="Its place in the storefront brand list"
            inputProps={{ min: 0, max: maxOrder }}
          />

          {/* Two visibility switches, one row — they are read together. They fall back to
              a column on a narrow screen, where side by side would wrap mid-label. */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 3 }}>
            <FormControlLabel
              control={<Switch checked={values.isActive} onChange={set('isActive')} />}
              label={<Typography variant="body2">Visible on the storefront</Typography>}
            />
            <FormControlLabel
              control={<Switch checked={values.isFeatured} onChange={set('isFeatured')} />}
              label={<Typography variant="body2">Highlight as a featured brand</Typography>}
            />
          </Stack>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
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
  const navigate = useNavigate();
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
              <Card
                sx={{
                  height: '100%', // fill the Grid row, which is as tall as its tallest card
                  minHeight: CARD_HEIGHT,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Header — fixed. Logo, name, badges, actions and the website link all
                    stay put; only the product list below scrolls. */}
                <CardContent sx={{ flexShrink: 0 }}>
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
                          /{brand.slug} ·{' '}
                          <Tooltip title="The sequence this brand appears in on the storefront brand list">
                            <Box component="span" sx={{ cursor: 'help' }}>
                              display order {brand.displayOrder}
                            </Box>
                          </Tooltip>
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

                  {/* Capped at two lines, but only as tall as the text it has. Holding the
                      second line open to align the dividers across cards left a visible
                      gap inside every card that did not need it; the card is a fixed
                      height regardless, so the slack belongs at the bottom, not here. */}
                  {brand.description && (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        mt: 1.5,
                        display: '-webkit-box',
                        WebkitBoxOrient: 'vertical',
                        WebkitLineClamp: 2,
                        overflow: 'hidden',
                      }}
                    >
                      {brand.description}
                    </Typography>
                  )}

                  {/* The website used to sit beside the product count; the lower half of
                      the card belongs to the products now, so it moves up here. */}
                  {brand.website && (
                    <Link
                      href={brand.website}
                      target="_blank"
                      rel="noreferrer"
                      variant="caption"
                      underline="hover"
                      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, maxWidth: '100%', mt: 0.5 }}
                    >
                      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {brand.website.replace(/^https?:\/\//i, '')}
                      </Box>
                      <LaunchIcon sx={{ fontSize: 13 }} />
                    </Link>
                  )}
                </CardContent>

                <Divider />

                {/* Heading and button pinned, product list scrolling between them.
                    `minHeight: 0` is what lets the list shrink instead of growing the card. */}
                <CardContent
                  sx={{
                    pt: 2,
                    flex: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    // CardContent's last-child rule adds 24px; the button below supplies
                    // its own breathing room, so keep the padding even.
                    '&:last-child': { pb: 2 },
                  }}
                >
                  <Stack
                    direction="row"
                    alignItems="baseline"
                    justifyContent="space-between"
                    spacing={1}
                    sx={{ flexShrink: 0 }}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      fontWeight={700}
                      textTransform="uppercase"
                    >
                      Products ({brand.productCount || 0})
                    </Typography>

                    {/* The count is the true total; the list is capped server-side. Said
                        here, on a row that already exists, rather than on one of its own
                        that would cost the card a product row. */}
                    {brand.productCount > (brand.products?.length || 0) && (
                      <Typography variant="caption" color="text.disabled" noWrap>
                        newest {brand.products.length}
                      </Typography>
                    )}
                  </Stack>

                  {brand.products?.length ? (
                    <Stack
                      spacing={0.5}
                      sx={{
                        mt: 1,
                        // Shrink-only: a short list keeps its natural height and the button
                        // sits right under it. A long one scrolls rather than stretching.
                        flex: '0 1 auto',
                        minHeight: 0,
                        maxHeight: PRODUCT_LIST_MAX_HEIGHT,
                        overflowY: 'auto',
                        pr: 0.5,
                        // Stops a flick at the end of this list carrying on into the page.
                        overscrollBehavior: 'contain',
                      }}
                    >
                      {brand.products.map((product) => (
                        <Stack
                          key={product._id}
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                          spacing={1}
                          onClick={() => navigate(`/products/${product._id}/edit`)}
                          // flexShrink: 0 — rows in a scrolling flex column would otherwise
                          // compress to fit rather than overflow, and nothing would scroll.
                          sx={{
                            flexShrink: 0,
                            py: 0.5,
                            px: 1,
                            borderRadius: 1,
                            cursor: 'pointer',
                            '&:hover': { bgcolor: 'action.hover' },
                          }}
                        >
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                            <Thumb src={product.image} alt={product.name} />
                            <Typography variant="body2" noWrap>
                              {product.name}
                            </Typography>
                          </Stack>

                          {/* Only the states worth acting on are called out; a published
                              product needs no badge. */}
                          {product.status !== 'published' && (
                            <Chip
                              label={product.status === 'draft' ? 'Draft' : 'Archived'}
                              size="small"
                              color={product.status === 'draft' ? 'warning' : 'default'}
                              sx={{ flexShrink: 0 }}
                            />
                          )}
                        </Stack>
                      ))}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.disabled" sx={{ mt: 1, flexShrink: 0 }}>
                      None yet
                    </Typography>
                  )}

                  {/* Opens the product form with this brand already chosen, the way
                      "Add sub-category" opens its dialog with the parent set. */}
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    sx={{ mt: 1, flexShrink: 0, alignSelf: 'flex-start' }}
                    onClick={() => navigate(`/products/new?brand=${encodeURIComponent(brand.name)}`)}
                  >
                    Add product
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {dialog && (
        <BrandDialog
          initial={dialog._id ? dialog : null}
          brandCount={brands.length}
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
