import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import MediaUploader from './MediaUploader';

/** Step 3 — Cloudinary-backed product imagery and clips, in one uploader. */
export default function StepImages({ values, errors, onChange }) {
  return (
    <Box>
      <Typography variant="h6">Product Media</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Upload up to 5 images and 2 videos. The first image is the primary one used on product
        cards, search results and social previews — use the arrows to reorder. Videos play after
        the photos in the storefront gallery.
      </Typography>

      {errors.images && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errors.images}
        </Alert>
      )}

      <MediaUploader
        images={values.images}
        videos={values.videos}
        onChange={({ images, videos }) => onChange({ images, videos })}
      />

      <Alert severity="info" sx={{ mt: 3 }}>
        <Typography variant="body2" fontWeight={700} gutterBottom>
          Tips for good product media
        </Typography>
        <Typography variant="body2" component="ul" sx={{ pl: 2.5, m: 0 }}>
          <li>Use a square image, at least 1000×1000px, on a plain background</li>
          <li>Lead with the full product, then follow with detail and in-use shots</li>
          <li>Keep lighting consistent across all images of the same product</li>
          <li>Keep videos short and silent-friendly — most shoppers watch without sound</li>
        </Typography>
      </Alert>
    </Box>
  );
}
