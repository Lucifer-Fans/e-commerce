import { useState, useRef, useCallback } from 'react';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Alert from '@mui/material/Alert';

import CloudUploadIcon from '@mui/icons-material/CloudUploadOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ArrowBackIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIcon from '@mui/icons-material/ArrowForwardIos';
import StarIcon from '@mui/icons-material/Star';
import AddPhotoIcon from '@mui/icons-material/AddPhotoAlternateOutlined';

import { uploadApi } from '../../api/endpoints';
import { MAX_PRODUCT_IMAGES, MAX_IMAGE_BYTES, ACCEPTED_IMAGE_TYPES } from '../../utils/constants';

/**
 * Product image manager.
 *
 * - Drag & drop or click to browse
 * - Uploads straight to Cloudinary via the API, one request per file so each
 *   card can show its own progress bar
 * - Numbered slots, reorder, replace, delete
 * - Slot 1 is always the primary image shown on cards and search results
 *
 * `value` is the array persisted on the product: [{ url, publicId, isPrimary, displayOrder }]
 */
export default function ImageUploader({ value = [], onChange, max = MAX_PRODUCT_IMAGES }) {
  const { enqueueSnackbar } = useSnackbar();
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState({}); // tempId -> { name, progress, preview }
  const fileInputRef = useRef(null);
  const replaceIndexRef = useRef(null);
  const tempIdRef = useRef(0);

  const slotsLeft = max - value.length;

  const validate = (file) => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      return `${file.name}: only JPG, PNG, WEBP and AVIF are allowed`;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return `${file.name}: file is larger than 5MB`;
    }
    return null;
  };

  /** Re-stamp order and primary flags after any structural change. */
  const normalise = useCallback(
    (images) => images.map((image, index) => ({ ...image, displayOrder: index, isPrimary: index === 0 })),
    []
  );

  const uploadOne = async (file, tempId) => {
    const preview = URL.createObjectURL(file);
    setUploads((u) => ({ ...u, [tempId]: { name: file.name, progress: 0, preview } }));

    try {
      const res = await uploadApi.image(file, {
        kind: 'products',
        onProgress: (progress) =>
          setUploads((u) => (u[tempId] ? { ...u, [tempId]: { ...u[tempId], progress } } : u)),
      });
      return res.data.image;
    } finally {
      URL.revokeObjectURL(preview);
      setUploads((u) => {
        const next = { ...u };
        delete next[tempId];
        return next;
      });
    }
  };

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const replacing = replaceIndexRef.current;
    replaceIndexRef.current = null;

    // Replacing consumes exactly one file and one existing slot.
    const accepted = [];
    for (const file of files.slice(0, replacing !== null ? 1 : slotsLeft)) {
      const problem = validate(file);
      if (problem) enqueueSnackbar(problem, { variant: 'error' });
      else accepted.push(file);
    }

    if (replacing === null && files.length > slotsLeft) {
      enqueueSnackbar(
        `Only ${slotsLeft} slot(s) left — the extra file(s) were skipped.`,
        { variant: 'warning' }
      );
    }
    if (!accepted.length) return;

    const results = await Promise.allSettled(
      accepted.map((file) => uploadOne(file, `tmp-${++tempIdRef.current}`))
    );

    const uploaded = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') uploaded.push(result.value);
      else {
        enqueueSnackbar(
          `${accepted[index].name}: ${result.reason?.message || 'upload failed'}`,
          { variant: 'error' }
        );
      }
    });
    if (!uploaded.length) return;

    if (replacing !== null) {
      // Free the replaced asset in Cloudinary — nothing else references it.
      const old = value[replacing];
      if (old?.publicId) uploadApi.remove(old.publicId).catch(() => {});

      const next = [...value];
      next[replacing] = uploaded[0];
      onChange(normalise(next));
      enqueueSnackbar('Image replaced', { variant: 'success' });
      return;
    }

    onChange(normalise([...value, ...uploaded]));
    enqueueSnackbar(`${uploaded.length} image(s) uploaded`, { variant: 'success' });
  };

  const openPicker = (replaceIndex = null) => {
    replaceIndexRef.current = replaceIndex;
    fileInputRef.current.value = ''; // allows re-picking the same file
    fileInputRef.current.click();
  };

  const removeAt = (index) => {
    const target = value[index];
    if (target?.publicId) uploadApi.remove(target.publicId).catch(() => {});
    onChange(normalise(value.filter((_, i) => i !== index)));
    enqueueSnackbar('Image removed', { variant: 'info' });
  };

  const move = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(normalise(next));
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const uploadEntries = Object.entries(uploads);
  const isFull = value.length >= max;

  return (
    <Box>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* ---------- Drop zone ---------- */}
      <Paper
        variant="outlined"
        onDragOver={(e) => {
          e.preventDefault();
          if (!isFull) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !isFull && openPicker()}
        sx={{
          p: { xs: 3, sm: 5 },
          textAlign: 'center',
          borderStyle: 'dashed',
          borderWidth: 2,
          borderColor: dragging ? 'primary.main' : 'divider',
          bgcolor: dragging ? 'primary.lighter' : isFull ? 'action.disabledBackground' : 'background.paper',
          cursor: isFull ? 'not-allowed' : 'pointer',
          transition: 'all .2s',
          '&:hover': !isFull ? { borderColor: 'primary.main', bgcolor: 'action.hover' } : undefined,
        }}
      >
        <CloudUploadIcon
          sx={{ fontSize: 46, color: dragging ? 'primary.main' : 'text.disabled', mb: 1 }}
        />
        <Typography fontWeight={700} gutterBottom>
          {isFull
            ? `Maximum ${max} images reached`
            : dragging
              ? 'Drop your images here'
              : 'Drag & drop product images here'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {isFull
            ? 'Delete or replace an image to add a different one.'
            : `or click to browse · ${slotsLeft} slot${slotsLeft === 1 ? '' : 's'} remaining`}
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
          JPG, PNG, WEBP or AVIF · up to 5MB each · maximum {max} images
        </Typography>
      </Paper>

      {value.length === 0 && uploadEntries.length === 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          The first image you upload becomes the primary image shown on product cards, search
          results and the storefront gallery. You can reorder images at any time.
        </Alert>
      )}

      {/* ---------- Slots ---------- */}
      {(value.length > 0 || uploadEntries.length > 0) && (
        <Grid container spacing={2} sx={{ mt: 1 }}>
          {value.map((image, index) => (
            <Grid key={image.publicId || index} size={{ xs: 6, sm: 4, md: 3 }}>
              <Paper
                variant="outlined"
                sx={{
                  position: 'relative',
                  overflow: 'hidden',
                  borderColor: index === 0 ? 'primary.main' : 'divider',
                  borderWidth: index === 0 ? 2 : 1,
                }}
              >
                <Box sx={{ position: 'relative', aspectRatio: '1', bgcolor: 'grey.100' }}>
                  <Box
                    component="img"
                    src={image.url}
                    alt={`Product image ${index + 1}`}
                    loading="lazy"
                    sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />

                  <Chip
                    label={index + 1}
                    size="small"
                    sx={{
                      position: 'absolute',
                      top: 6,
                      left: 6,
                      minWidth: 26,
                      bgcolor: 'rgba(15,23,42,.82)',
                      color: '#fff',
                    }}
                  />

                  {index === 0 && (
                    <Chip
                      icon={<StarIcon sx={{ fontSize: 14, color: '#fff !important' }} />}
                      label="Primary"
                      size="small"
                      color="primary"
                      sx={{ position: 'absolute', top: 6, right: 6 }}
                    />
                  )}
                </Box>

                <Stack
                  direction="row"
                  justifyContent="center"
                  spacing={0.25}
                  sx={{ borderTop: 1, borderColor: 'divider', py: 0.5 }}
                >
                  <Tooltip title="Move left">
                    <span>
                      <IconButton size="small" disabled={index === 0} onClick={() => move(index, -1)}>
                        <ArrowBackIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </span>
                  </Tooltip>

                  <Tooltip title="Replace image">
                    <IconButton size="small" onClick={() => openPicker(index)}>
                      <SwapHorizIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>

                  <Tooltip title="Delete image">
                    <IconButton size="small" color="error" onClick={() => removeAt(index)}>
                      <DeleteIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>

                  <Tooltip title="Move right">
                    <span>
                      <IconButton
                        size="small"
                        disabled={index === value.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowForwardIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              </Paper>
            </Grid>
          ))}

          {/* In-flight uploads occupy their own placeholder cards. */}
          {uploadEntries.map(([tempId, upload]) => (
            <Grid key={tempId} size={{ xs: 6, sm: 4, md: 3 }}>
              <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                <Box sx={{ position: 'relative', aspectRatio: '1', bgcolor: 'grey.100' }}>
                  <Box
                    component="img"
                    src={upload.preview}
                    alt=""
                    sx={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.45 }}
                  />
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: 'rgba(255,255,255,.55)',
                    }}
                  >
                    <Typography fontWeight={800} color="primary.main">
                      {upload.progress}%
                    </Typography>
                  </Box>
                </Box>
                <LinearProgress variant="determinate" value={upload.progress} />
                <Typography variant="caption" noWrap sx={{ display: 'block', px: 1, py: 0.75 }}>
                  {upload.name}
                </Typography>
              </Paper>
            </Grid>
          ))}

          {/* Explicit "add" tile — faster than scrolling back up to the drop zone. */}
          {!isFull && (
            <Grid size={{ xs: 6, sm: 4, md: 3 }}>
              <Paper
                variant="outlined"
                onClick={() => openPicker()}
                sx={{
                  aspectRatio: '1',
                  display: 'grid',
                  placeItems: 'center',
                  borderStyle: 'dashed',
                  cursor: 'pointer',
                  color: 'text.disabled',
                  '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
                }}
              >
                <Stack alignItems="center" spacing={0.5}>
                  <AddPhotoIcon sx={{ fontSize: 30 }} />
                  <Typography variant="caption" fontWeight={600}>
                    Add image
                  </Typography>
                </Stack>
              </Paper>
            </Grid>
          )}
        </Grid>
      )}
    </Box>
  );
}
