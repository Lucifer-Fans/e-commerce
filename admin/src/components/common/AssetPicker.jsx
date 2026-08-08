import { useRef, useState } from 'react';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import LinearProgress from '@mui/material/LinearProgress';

import AddPhotoIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import DeleteIcon from '@mui/icons-material/DeleteOutline';

import { uploadApi } from '../../api/endpoints';
import { MAX_IMAGE_BYTES, ACCEPTED_IMAGE_TYPES } from '../../utils/constants';

/**
 * Single-image picker — branding assets, category artwork, brand logos.
 *
 * Same upload pipeline as the product uploader, but sized for one slot so it fits a
 * narrow column or a dialog. It never deletes the old asset itself — the controller
 * that owns the record does that when the change is actually saved, so cancelling
 * out of a form costs nothing.
 *
 * `kind` picks the Cloudinary sub-folder the file lands in.
 */
export default function AssetPicker({
  label,
  hint,
  value,
  onChange,
  ratio = '1',
  kind = 'branding',
  disabled = false,
}) {
  const { enqueueSnackbar } = useSnackbar();
  const inputRef = useRef(null);
  const [progress, setProgress] = useState(null);

  const hasImage = Boolean(value?.url);

  const handleFile = async (file) => {
    if (!file) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      return enqueueSnackbar('Only JPG, PNG, WEBP and AVIF images are allowed', { variant: 'error' });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return enqueueSnackbar('The file is larger than 5MB', { variant: 'error' });
    }

    setProgress(0);
    try {
      const res = await uploadApi.image(file, { kind, onProgress: setProgress });
      onChange(res.data.image);
      enqueueSnackbar(`${label} uploaded — remember to save your changes`, { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(err.message || 'Upload failed', { variant: 'error' });
    } finally {
      setProgress(null);
    }
  };

  const openPicker = () => {
    if (disabled || progress !== null) return;
    inputRef.current.value = ''; // allows re-picking the same file
    inputRef.current.click();
  };

  return (
    <Box>
      <Typography
        variant="subtitle2"
        align="center"
        sx={{ mb: 1, color: 'text.primary', fontWeight: 700 }}
      >
        {label}
      </Typography>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        hidden
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      <Paper
        variant="outlined"
        onClick={hasImage ? undefined : openPicker}
        sx={{
          position: 'relative',
          overflow: 'hidden',
          aspectRatio: ratio,
          display: 'grid',
          placeItems: 'center',
          borderStyle: hasImage ? 'solid' : 'dashed',
          bgcolor: hasImage ? 'background.paper' : 'grey.50',
          cursor: hasImage || disabled ? 'default' : 'pointer',
          transition: 'border-color .2s, color .2s',
          color: 'text.disabled',
          '&:hover': hasImage || disabled ? undefined : { borderColor: 'primary.main', color: 'primary.main' },
          '&:hover .asset-actions': { opacity: 1 },
        }}
      >
        {hasImage ? (
          <>
            <Box
              component="img"
              src={value.url}
              alt={label}
              loading="lazy"
              sx={{ width: '100%', height: '100%', objectFit: 'contain', p: 1.5 }}
            />

            {!disabled && (
              <Stack
                className="asset-actions"
                direction="row"
                spacing={0.5}
                sx={{
                  position: 'absolute',
                  inset: 'auto 0 0 0',
                  justifyContent: 'center',
                  py: 0.5,
                  bgcolor: 'rgba(15,23,42,.78)',
                  // Always visible on touch screens, where there is no hover to reveal it.
                  opacity: { xs: 1, md: 0 },
                  transition: 'opacity .2s',
                }}
              >
                <Tooltip title={`Replace ${label.toLowerCase()}`}>
                  <IconButton size="small" sx={{ color: '#fff' }} onClick={openPicker}>
                    <SwapHorizIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title={`Remove ${label.toLowerCase()}`}>
                  <IconButton
                    size="small"
                    sx={{ color: '#fca5a5' }}
                    onClick={() => onChange({ url: '', publicId: '' })}
                  >
                    <DeleteIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </Stack>
            )}
          </>
        ) : (
          <Stack alignItems="center" spacing={0.5} sx={{ px: 1, textAlign: 'center' }}>
            <AddPhotoIcon sx={{ fontSize: 28 }} />
            <Typography variant="caption" fontWeight={600}>
              Upload
            </Typography>
          </Stack>
        )}

        {progress !== null && (
          <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(255,255,255,.7)', display: 'grid', placeItems: 'center' }}>
            <Typography fontWeight={800} color="primary.main">
              {progress}%
            </Typography>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{ position: 'absolute', inset: 'auto 0 0 0' }}
            />
          </Box>
        )}
      </Paper>

      {hint && (
        <Typography variant="caption" color="text.secondary" align="center" sx={{ display: 'block', mt: 0.75 }}>
          {hint}
        </Typography>
      )}
    </Box>
  );
}
