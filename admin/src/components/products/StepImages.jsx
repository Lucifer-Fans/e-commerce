import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import ImageUploader from './ImageUploader';

/** Step 3 — Cloudinary-backed product imagery. */
export default function StepImages({ values, errors, onChange }) {
  return (
    <Box>
      <Typography variant="h6">Product Images</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Upload up to 5 images. The first slot is the primary image used on product cards, search
        results and social previews — drag or use the arrows to reorder.
      </Typography>

      {errors.images && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errors.images}
        </Alert>
      )}

      <ImageUploader value={values.images} onChange={(images) => onChange({ images })} />

      <Alert severity="info" sx={{ mt: 3 }}>
        <Typography variant="body2" fontWeight={700} gutterBottom>
          Tips for good product photos
        </Typography>
        <Typography variant="body2" component="ul" sx={{ pl: 2.5, m: 0 }}>
          <li>Use a square image, at least 1000×1000px, on a plain background</li>
          <li>Lead with the full product, then follow with detail and in-use shots</li>
          <li>Keep lighting consistent across all images of the same product</li>
        </Typography>
      </Alert>
    </Box>
  );
}
