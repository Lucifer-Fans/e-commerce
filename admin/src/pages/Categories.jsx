import { useCallback, useEffect, useState } from 'react';
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
import CloseIcon from '@mui/icons-material/Close';

import { categoryApi, subCategoryApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import { useLiveRefetch } from '../realtime/useRealtime';
import { TAXONOMY_EVENTS } from '../realtime/events';
import PageHeader from '../components/common/PageHeader';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';
import ImageUploader from '../components/products/ImageUploader';

const EMPTY_IMAGE = { url: '', publicId: '' };
const EMPTY_CATEGORY = { name: '', description: '', image: EMPTY_IMAGE, displayOrder: 0, isActive: true };
const EMPTY_SUB = { name: '', category: '', description: '', image: EMPTY_IMAGE, displayOrder: 0, isActive: true };

/**
 * How many sub-category rows are visible before the list starts scrolling, and the
 * geometry of one row: a 26px thumbnail with 4px of padding above and below, and the
 * `spacing={0.5}` gap between rows.
 *
 * The window is stated in rows rather than pixels because that is the thing being
 * decided; the card height below follows from it. `SUB_LIST_MAX_HEIGHT` is what stops
 * the last visible row being followed by a sliver of the next one.
 */
const VISIBLE_SUB_ROWS = 5;
const SUB_ROW_HEIGHT = 34;
const SUB_ROW_GAP = 4;
const SUB_LIST_MAX_HEIGHT = VISIBLE_SUB_ROWS * SUB_ROW_HEIGHT + (VISIBLE_SUB_ROWS - 1) * SUB_ROW_GAP;

/**
 * Everything in the card that is not the list: header, description, divider, the
 * sub-category heading and the "Add" button, with their padding. Adding it to the list
 * window gives the height every card settles at, whether it holds no sub-categories or
 * forty — and keeps the card in proportion on its own if VISIBLE_SUB_ROWS is changed.
 *
 * A floor rather than a hard height, deliberately: the cap that matters is the one on
 * the list, and a card pinned a few pixels shorter than its own contents would clip the
 * last row instead of showing it. This way a card can take the extra pixels if a heading
 * wraps — its neighbours stretch to match, because Grid rows are equal-height — while
 * every card on the page still starts from the same size.
 */
// 132 header (44px thumbnail row, two-line description, 16px padding either side)
// + 1 divider + 99 below it (16 padding, 20 heading, 8 list margin, 39 button, 16 padding).
const CARD_CHROME_HEIGHT = 236;
const CARD_HEIGHT = CARD_CHROME_HEIGHT + SUB_LIST_MAX_HEIGHT;

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
    return { ...base, image: asset(base.image) };
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  /**
   * Positions are per list — every category is numbered against its siblings, and
   * every sub-category against the other children of its parent — so switching the
   * parent picker asks a different list how long it is.
   */
  const parentKey = isSub ? values.category || '' : 'root';
  const siblingCount = isSub
    ? categories.find((c) => c._id === values.category)?.subCategories?.length || 0
    : categories.length;

  /**
   * Typing a number a sibling already holds is fine — the server splices this row in
   * and pushes the rest down. A number past the end of the list is not a position at
   * all, so it lands on the last one instead.
   */
  const joiningList = !values._id || (isSub && String(initial?.category || '') !== parentKey);
  const maxOrder = joiningList ? siblingCount : Math.max(siblingCount - 1, 0);

  // A new row is offered the end of whichever list it is about to join, so the admin
  // never has to work the next free number out. Keyed on the parent alone: a live
  // refresh of the tree must not overwrite a number already typed.
  useEffect(() => {
    if (values._id) return;
    setValues((v) => ({ ...v, displayOrder: siblingCount }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentKey]);

  const set = (field) => (e) =>
    setValues((v) => ({
      ...v,
      [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  const submit = async () => {
    const found = {};
    const name = values.name.trim();
    if (!name) found.name = isSub ? 'Enter sub-category name' : 'Enter category name';
    else if (name.length < 2) found.name = 'Name must be at least 2 characters';
    if (isSub && !values.category) found.category = 'Select a parent category';
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
        // Always sent, so clearing the picker clears the stored image too.
        image: asset(values.image),
        displayOrder: Math.min(Math.max(Number(values.displayOrder) || 0, 0), maxOrder),
        isActive: values.isActive,
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

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pr: 6 }}>
        {values._id ? 'Edit' : 'New'} {isSub ? 'sub-category' : 'category'}
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
              {isSub ? 'Sub-category' : 'Category'} image
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Square artwork works best — around 400×400px.
            </Typography>

            {/* The uploader is array-based; a category holds exactly one image. The
                controller frees the replaced asset when the change is saved, so this
                one must not destroy anything on its own. */}
            <ImageUploader
              max={1}
              kind="categories"
              subject={isSub ? 'the sub-category image' : 'the category image'}
              destroyOnRemove={false}
              // One image is the whole allowance here, so the drop zone steps aside once
              // it is taken; the tile below still replaces and deletes.
              hideDropzoneWhenFull
              value={values.image?.url ? [values.image] : []}
              onChange={(images) => setValues((v) => ({ ...v, image: asset(images[0]) }))}
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
            helperText={
              isSub
                ? 'Its place under the parent category on the storefront'
                : 'Its place in the storefront navigation'
            }
            inputProps={{ min: 0, max: maxOrder }}
          />

          <FormControlLabel
            control={<Switch checked={values.isActive} onChange={set('isActive')} />}
            label={<Typography variant="body2">Visible on the storefront</Typography>}
          />
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
              <Card
                sx={{
                  height: '100%', // fill the Grid row, which is as tall as its tallest card
                  minHeight: CARD_HEIGHT,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Header — fixed. `flexShrink: 0` so a long description never squeezes
                    it; the description itself is clamped rather than allowed to eat the
                    space the list needs. */}
                <CardContent sx={{ flexShrink: 0 }}>
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
                          /{category.slug} ·{' '}
                          <Tooltip title="The sequence this category appears in on the storefront navigation">
                            <Box component="span" sx={{ cursor: 'help' }}>
                              display order {category.displayOrder}
                            </Box>
                          </Tooltip>
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

                  {/* Capped at two lines — the full text is one click away in the edit
                      dialog — but only as tall as the text it has. Holding the second
                      line open to align the dividers across cards left a gap inside every
                      card that did not need it; the card is a fixed height regardless, so
                      the slack belongs at the bottom, not here. */}
                  {category.description && (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        mt: 1,
                        display: '-webkit-box',
                        WebkitBoxOrient: 'vertical',
                        WebkitLineClamp: 2,
                        overflow: 'hidden',
                      }}
                    >
                      {category.description}
                    </Typography>
                  )}
                </CardContent>

                <Divider />

                {/* The rest of the card: heading and button pinned, list scrolling between
                    them. `minHeight: 0` is what lets the list actually shrink — without it
                    a flex child refuses to go below its content height and the card grows. */}
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
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    fontWeight={700}
                    textTransform="uppercase"
                    sx={{ flexShrink: 0 }}
                  >
                    Sub-categories ({category.subCategories?.length || 0})
                  </Typography>

                  {category.subCategories?.length ? (
                    <Stack
                      spacing={0.5}
                      sx={{
                        mt: 1,
                        // Shrink-only: a short list keeps its natural height and the
                        // button sits right under it exactly as before. A long one gives
                        // way and scrolls instead of stretching the card.
                        flex: '0 1 auto',
                        minHeight: 0,
                        // The window itself. Capping it here rather than leaving it to
                        // the leftover space means the list ends on a whole row instead
                        // of half of one, however tall the header happens to render.
                        maxHeight: SUB_LIST_MAX_HEIGHT,
                        overflowY: 'auto',
                        // `auto`, so the bar only appears once the rows outgrow the space
                        // — and `stable` reserves its channel whether it appears or not,
                        // so a five-row card and a fifty-row card line their names up in
                        // the same place instead of one being 8px narrower. It also keeps
                        // the row hover highlight from running underneath the bar.
                        scrollbarGutter: 'stable',
                        // A little breathing room between the longest name and the bar,
                        // and the whole gutter on browsers too old for the line above.
                        pr: 0.5,
                        // Overscroll containment stops a flick at the end of this list from
                        // carrying on and scrolling the page behind it.
                        overscrollBehavior: 'contain',
                      }}
                    >
                      {category.subCategories.map((sub) => (
                        <Stack
                          key={sub._id}
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                          // flexShrink: 0 — rows in a scrolling flex column would otherwise
                          // compress to fit rather than overflow, and nothing would scroll.
                          sx={{
                            flexShrink: 0,
                            py: 0.5,
                            px: 1,
                            borderRadius: 1,
                            '&:hover': { bgcolor: 'action.hover' },
                          }}
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
                    <Typography variant="body2" color="text.disabled" sx={{ mt: 1, flexShrink: 0 }}>
                      None yet
                    </Typography>
                  )}

                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    sx={{ mt: 1, flexShrink: 0, alignSelf: 'flex-start' }}
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
