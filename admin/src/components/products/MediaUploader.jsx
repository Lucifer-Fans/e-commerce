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
import VideocamIcon from '@mui/icons-material/VideocamOutlined';

import { uploadApi } from '../../api/endpoints';
import { uploadMedia } from '../../utils/media';
import {
  MAX_PRODUCT_IMAGES,
  MAX_IMAGE_SOURCE_BYTES,
  ACCEPTED_IMAGE_TYPES,
  MAX_PRODUCT_VIDEOS,
  MAX_VIDEO_BYTES,
  ACCEPTED_VIDEO_TYPES,
} from '../../utils/constants';

/** mm:ss on a clip's tile, so its length shows without pressing play. */
const clipLength = (seconds) => {
  if (!seconds) return null;
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * Product media manager — photos and clips in one drop zone and one grid.
 *
 * The two are stored separately on the product (`images` and `videos`) because
 * only an image can be the primary asset cards and social previews use, but the
 * admin never has to care: a dropped file is routed by its mimetype and lands in
 * the right list. Tiles are shown photos-first, which is the order the storefront
 * gallery renders them in, so the arrows reorder within a kind and stop at the
 * boundary rather than pretending a clip can be promoted to slot 1.
 *
 * `value` is `{ images, videos }`; `onChange` is called with the same shape.
 */
export default function MediaUploader({
  images = [],
  videos = [],
  onChange,
  maxImages = MAX_PRODUCT_IMAGES,
  maxVideos = MAX_PRODUCT_VIDEOS,
}) {
  const { enqueueSnackbar } = useSnackbar();
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState({}); // tempId -> { name, progress, preview, kind }
  const fileInputRef = useRef(null);
  const replaceRef = useRef(null); // { kind, index } while a replace is in flight
  const tempIdRef = useRef(0);

  const imageSlotsLeft = maxImages - images.length;
  const videoSlotsLeft = maxVideos - videos.length;
  const isFull = imageSlotsLeft <= 0 && videoSlotsLeft <= 0;

  const kindOf = (file) => {
    if (ACCEPTED_IMAGE_TYPES.includes(file.type)) return 'image';
    if (ACCEPTED_VIDEO_TYPES.includes(file.type)) return 'video';
    return null;
  };

  /** Re-stamp order and primary flags after any structural change. */
  const normalise = useCallback(
    (next) => ({
      images: next.images.map((image, index) => ({
        ...image,
        displayOrder: index,
        isPrimary: index === 0,
      })),
      videos: next.videos.map((video, index) => ({ ...video, displayOrder: index })),
    }),
    []
  );

  const uploadOne = async (file, kind, tempId) => {
    const preview = kind === 'image' ? URL.createObjectURL(file) : null;
    setUploads((u) => ({ ...u, [tempId]: { name: file.name, progress: 0, preview, kind } }));

    try {
      // Photos are downscaled in the browser and everything goes straight to
      // Cloudinary — see utils/media.js for why both matter.
      return await uploadMedia(file, {
        kind: 'products',
        onProgress: (progress) =>
          setUploads((u) => (u[tempId] ? { ...u, [tempId]: { ...u[tempId], progress } } : u)),
      });
    } finally {
      if (preview) URL.revokeObjectURL(preview);
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

    const replacing = replaceRef.current;
    replaceRef.current = null;

    // Replacing consumes exactly one file of the same kind as the tile it replaces.
    const accepted = [];
    let imageRoom = replacing ? 0 : imageSlotsLeft;
    let videoRoom = replacing ? 0 : videoSlotsLeft;
    let skipped = 0;

    for (const file of files) {
      const kind = kindOf(file);
      if (!kind) {
        enqueueSnackbar(`${file.name}: only JPG, JPEG, PNG, GIF images and MP4 videos are allowed`, {
          variant: 'error',
        });
        continue;
      }
      if (kind === 'image' && file.size > MAX_IMAGE_SOURCE_BYTES) {
        enqueueSnackbar(`${file.name}: image is larger than 25MB`, { variant: 'error' });
        continue;
      }
      if (kind === 'video' && file.size > MAX_VIDEO_BYTES) {
        enqueueSnackbar(`${file.name}: video is larger than 30MB`, { variant: 'error' });
        continue;
      }

      if (replacing) {
        if (kind !== replacing.kind) {
          enqueueSnackbar(
            `Pick ${replacing.kind === 'image' ? 'an image' : 'a video'} to replace this ${replacing.kind}.`,
            { variant: 'warning' }
          );
          return;
        }
        accepted.push({ file, kind });
        break;
      }

      if (kind === 'image' && imageRoom > 0) {
        imageRoom -= 1;
        accepted.push({ file, kind });
      } else if (kind === 'video' && videoRoom > 0) {
        videoRoom -= 1;
        accepted.push({ file, kind });
      } else {
        skipped += 1;
      }
    }

    if (skipped) {
      enqueueSnackbar(`${skipped} file(s) skipped — no slots left for them.`, { variant: 'warning' });
    }
    if (!accepted.length) return;

    const results = await Promise.allSettled(
      accepted.map(({ file, kind }) => uploadOne(file, kind, `tmp-${++tempIdRef.current}`))
    );

    const uploadedImages = [];
    const uploadedVideos = [];
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        enqueueSnackbar(`${accepted[index].file.name}: ${result.reason?.message || 'upload failed'}`, {
          variant: 'error',
        });
        return;
      }
      if (accepted[index].kind === 'video') uploadedVideos.push(result.value);
      else uploadedImages.push(result.value);
    });

    const uploadedCount = uploadedImages.length + uploadedVideos.length;
    if (!uploadedCount) return;

    if (replacing) {
      const list = replacing.kind === 'image' ? images : videos;
      const old = list[replacing.index];
      if (old?.publicId) uploadApi.remove(old.publicId, { type: replacing.kind }).catch(() => {});

      const next = [...list];
      next[replacing.index] = replacing.kind === 'image' ? uploadedImages[0] : uploadedVideos[0];
      onChange(
        normalise(
          replacing.kind === 'image' ? { images: next, videos } : { images, videos: next }
        )
      );
      enqueueSnackbar(`${replacing.kind === 'image' ? 'Image' : 'Video'} replaced`, { variant: 'success' });
      return;
    }

    onChange(
      normalise({ images: [...images, ...uploadedImages], videos: [...videos, ...uploadedVideos] })
    );
    enqueueSnackbar(`${uploadedCount} file(s) uploaded`, { variant: 'success' });
  };

  /** `replace` is `{ kind, index }` when swapping a tile, null when adding. */
  const openPicker = (replace = null) => {
    replaceRef.current = replace;
    fileInputRef.current.value = ''; // allows re-picking the same file
    fileInputRef.current.click();
  };

  const removeAt = (kind, index) => {
    const list = kind === 'image' ? images : videos;
    const target = list[index];
    if (target?.publicId) uploadApi.remove(target.publicId, { type: kind }).catch(() => {});

    const next = list.filter((_, i) => i !== index);
    onChange(normalise(kind === 'image' ? { images: next, videos } : { images, videos: next }));
    enqueueSnackbar(`${kind === 'image' ? 'Image' : 'Video'} removed`, { variant: 'info' });
  };

  const move = (kind, index, direction) => {
    const list = kind === 'image' ? images : videos;
    const target = index + direction;
    if (target < 0 || target >= list.length) return;

    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(normalise(kind === 'image' ? { images: next, videos } : { images, videos: next }));
  };

  const uploadEntries = Object.entries(uploads);
  const acceptAttr = [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES].join(',');
  const slotSummary = [
    imageSlotsLeft > 0 && `${imageSlotsLeft} image slot${imageSlotsLeft === 1 ? '' : 's'}`,
    videoSlotsLeft > 0 && `${videoSlotsLeft} video slot${videoSlotsLeft === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ');

  /**
   * Shared tile footer so photo and clip cards carry the same controls. Called as
   * a plain function rather than rendered as a component: a nested component would
   * be a new type on every render and remount the buttons underneath the cursor.
   */
  const controlsFor = (kind, index, count) => (
    <Stack
      direction="row"
      justifyContent="center"
      spacing={0.25}
      sx={{ borderTop: 1, borderColor: 'divider', py: 0.5 }}
    >
      <Tooltip title="Move left">
        <span>
          <IconButton size="small" disabled={index === 0} onClick={() => move(kind, index, -1)}>
            <ArrowBackIcon sx={{ fontSize: 15 }} />
          </IconButton>
        </span>
      </Tooltip>

      <Tooltip title={kind === 'image' ? 'Replace image' : 'Replace video'}>
        <IconButton size="small" onClick={() => openPicker({ kind, index })}>
          <SwapHorizIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>

      <Tooltip title={kind === 'image' ? 'Delete image' : 'Delete video'}>
        <IconButton size="small" color="error" onClick={() => removeAt(kind, index)}>
          <DeleteIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>

      <Tooltip title="Move right">
        <span>
          <IconButton
            size="small"
            disabled={index === count - 1}
            onClick={() => move(kind, index, 1)}
          >
            <ArrowForwardIcon sx={{ fontSize: 15 }} />
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  );

  return (
    <Box>
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptAttr}
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
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !isFull && openPicker()}
        sx={{
          p: { xs: 3, sm: 5 },
          textAlign: 'center',
          borderStyle: 'dashed',
          borderWidth: 2,
          borderColor: dragging ? 'primary.main' : 'divider',
          bgcolor: dragging
            ? 'primary.lighter'
            : isFull
              ? 'action.disabledBackground'
              : 'background.paper',
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
            ? 'All image and video slots are full'
            : dragging
              ? 'Drop your files here'
              : 'Drag & drop product images or videos here'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {isFull ? 'Delete or replace a tile to add something else.' : `or click to browse · ${slotSummary} remaining`}
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
          JPG, JPEG, PNG or GIF (resized automatically) · MP4 up to 30MB · {maxImages} images and{' '}
          {maxVideos} videos maximum
        </Typography>
      </Paper>

      {images.length === 0 && videos.length === 0 && uploadEntries.length === 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          The first image you upload becomes the primary image shown on product cards, search
          results and the storefront gallery. Videos play after the photos — they never stand in
          for the primary image.
        </Alert>
      )}

      {/* ---------- Tiles: photos first, then clips, matching the storefront gallery ---------- */}
      {(images.length > 0 || videos.length > 0 || uploadEntries.length > 0) && (
        <Grid container spacing={2} sx={{ mt: 1 }}>
          {images.map((image, index) => (
            <Grid key={image.publicId || `image-${index}`} size={{ xs: 6, sm: 4, md: 3 }}>
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

                {controlsFor('image', index, images.length)}
              </Paper>
            </Grid>
          ))}

          {videos.map((video, index) => (
            <Grid key={video.publicId || `video-${index}`} size={{ xs: 6, sm: 4, md: 3 }}>
              <Paper variant="outlined" sx={{ position: 'relative', overflow: 'hidden' }}>
                <Box sx={{ position: 'relative', aspectRatio: '1', bgcolor: 'grey.900' }}>
                  <Box
                    component="video"
                    src={video.url}
                    poster={video.thumbnail || undefined}
                    controls
                    preload="metadata"
                    sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />

                  <Chip
                    icon={<VideocamIcon sx={{ fontSize: 14, color: '#fff !important' }} />}
                    label={clipLength(video.duration) || 'Video'}
                    size="small"
                    sx={{
                      position: 'absolute',
                      top: 6,
                      left: 6,
                      bgcolor: 'rgba(15,23,42,.82)',
                      color: '#fff',
                      // The player's own controls sit underneath; the chip is a label only.
                      pointerEvents: 'none',
                    }}
                  />
                </Box>

                {controlsFor('video', index, videos.length)}
              </Paper>
            </Grid>
          ))}

          {/* In-flight uploads occupy their own placeholder cards. */}
          {uploadEntries.map(([tempId, upload]) => (
            <Grid key={tempId} size={{ xs: 6, sm: 4, md: 3 }}>
              <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                <Box sx={{ position: 'relative', aspectRatio: '1', bgcolor: 'grey.100' }}>
                  {upload.preview ? (
                    <Box
                      component="img"
                      src={upload.preview}
                      alt=""
                      sx={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.45 }}
                    />
                  ) : (
                    <Box sx={{ display: 'grid', placeItems: 'center', height: '100%' }}>
                      <VideocamIcon sx={{ fontSize: 34, color: 'text.disabled' }} />
                    </Box>
                  )}
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
                    Add media
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
