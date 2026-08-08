import { useEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Grid from '@mui/material/Grid2';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';

import ImageUploader from './ImageUploader';
import { formatPrice, computeFinalPrice } from '../../utils/format';
import { variantLabel } from '../../utils/variants';

/**
 * Everything about one SKU that doesn't fit in the grid: its own photography, shipping
 * weight and dimensions, barcode and HSN code.
 *
 * Images are optional — a variant with none inherits the product's gallery, so an admin
 * only has to shoot the colours that actually look different.
 */
export default function VariantEditorDialog({ open, variant, productName, onClose, onSave }) {
  const [draft, setDraft] = useState(variant);

  useEffect(() => setDraft(variant), [variant]);

  if (!draft) return null;

  const patch = (changes) => setDraft((current) => ({ ...current, ...changes }));
  const finalPrice = computeFinalPrice(draft.price, draft.discountPercent);
  const label = variantLabel(draft.attributes);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Typography variant="h6" component="span">
          {label}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {productName}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 2.5 }}>
          {draft.attributes.map((attribute) => (
            <Chip
              key={attribute.slug}
              size="small"
              label={`${attribute.name}: ${attribute.value}`}
              variant="outlined"
            />
          ))}
        </Stack>

        <Grid container spacing={2.5}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              label="SKU"
              value={draft.sku || ''}
              onChange={(e) => patch({ sku: e.target.value.toUpperCase() })}
              helperText="Leave blank to generate one. Must be unique across the catalogue."
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField
              fullWidth
              label="Barcode"
              value={draft.barcode || ''}
              onChange={(e) => patch({ barcode: e.target.value })}
              helperText="EAN / UPC"
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField
              fullWidth
              label="HSN code"
              value={draft.hsnCode || ''}
              onChange={(e) => patch({ hsnCode: e.target.value })}
              helperText="For tax reporting"
            />
          </Grid>

          {/* ---------- Pricing ---------- */}
          <Grid size={12}>
            <Divider textAlign="left">
              <Typography variant="caption" color="text.secondary">
                Pricing &amp; inventory
              </Typography>
            </Divider>
          </Grid>

          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField
              fullWidth
              required
              type="number"
              label="MRP"
              value={draft.price}
              onChange={(e) => patch({ price: e.target.value })}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
              inputProps={{ min: 0, step: '0.01' }}
            />
          </Grid>

          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField
              fullWidth
              type="number"
              label="Discount"
              value={draft.discountPercent}
              onChange={(e) => patch({ discountPercent: e.target.value })}
              InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
              inputProps={{ min: 0, max: 95, step: '0.1' }}
            />
          </Grid>

          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField
              fullWidth
              required
              type="number"
              label="Stock"
              value={draft.stock}
              onChange={(e) => patch({ stock: e.target.value })}
              inputProps={{ min: 0, step: 1 }}
              helperText="Units of this exact SKU"
            />
          </Grid>

          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField
              fullWidth
              type="number"
              label="Low stock alert"
              value={draft.lowStockThreshold}
              onChange={(e) => patch({ lowStockThreshold: e.target.value })}
              inputProps={{ min: 0, step: 1 }}
            />
          </Grid>

          <Grid size={12}>
            <Box sx={{ border: 1, borderColor: 'primary.main', borderRadius: 2, px: 2, py: 1.25 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Selling price (auto-calculated)
              </Typography>
              <Typography variant="h6" color="primary.main" fontWeight={800}>
                {formatPrice(finalPrice, true)}
              </Typography>
            </Box>
          </Grid>

          {/* ---------- Shipping ---------- */}
          <Grid size={12}>
            <Divider textAlign="left">
              <Typography variant="caption" color="text.secondary">
                Shipping — used for packing and courier rates
              </Typography>
            </Divider>
          </Grid>

          <Grid size={{ xs: 8, sm: 3 }}>
            <TextField
              fullWidth
              type="number"
              label="Weight"
              value={draft.weight?.value ?? ''}
              onChange={(e) => patch({ weight: { ...draft.weight, value: e.target.value } })}
              inputProps={{ min: 0, step: '0.01' }}
            />
          </Grid>
          <Grid size={{ xs: 4, sm: 2 }}>
            <TextField
              select
              fullWidth
              label="Unit"
              value={draft.weight?.unit || 'g'}
              onChange={(e) => patch({ weight: { ...draft.weight, unit: e.target.value } })}
            >
              <MenuItem value="g">g</MenuItem>
              <MenuItem value="kg">kg</MenuItem>
            </TextField>
          </Grid>

          {['length', 'width', 'height'].map((side) => (
            <Grid key={side} size={{ xs: 4, sm: 2 }}>
              <TextField
                fullWidth
                type="number"
                label={side[0].toUpperCase() + side.slice(1)}
                value={draft.dimensions?.[side] ?? ''}
                onChange={(e) => patch({ dimensions: { ...draft.dimensions, [side]: e.target.value } })}
                inputProps={{ min: 0, step: '0.1' }}
              />
            </Grid>
          ))}

          <Grid size={{ xs: 12, sm: 1 }}>
            <TextField
              select
              fullWidth
              label="Unit"
              value={draft.dimensions?.unit || 'cm'}
              onChange={(e) => patch({ dimensions: { ...draft.dimensions, unit: e.target.value } })}
            >
              <MenuItem value="cm">cm</MenuItem>
              <MenuItem value="in">in</MenuItem>
            </TextField>
          </Grid>

          {/* ---------- Images ---------- */}
          <Grid size={12}>
            <Divider textAlign="left">
              <Typography variant="caption" color="text.secondary">
                Images for this variant
              </Typography>
            </Divider>
          </Grid>

          <Grid size={12}>
            <Alert severity="info" sx={{ mb: 2 }}>
              Optional. A variant with no images of its own shows the product gallery instead —
              so only upload here for options that genuinely look different, such as colours.
            </Alert>
            <ImageUploader value={draft.images || []} onChange={(images) => patch({ images })} />
          </Grid>

          <Grid size={12}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormControlLabel
                control={
                  <Switch
                    checked={draft.isActive !== false}
                    onChange={(e) => patch({ isActive: e.target.checked })}
                  />
                }
                label={
                  <Typography variant="body2">
                    Available to buy
                    <Typography variant="caption" color="text.secondary" display="block">
                      Turning this off keeps the option visible but disabled on the storefront
                    </Typography>
                  </Typography>
                }
              />
              <FormControlLabel
                control={
                  <Switch checked={Boolean(draft.isDefault)} onChange={(e) => patch({ isDefault: e.target.checked })} />
                }
                label={
                  <Typography variant="body2">
                    Preselect on the product page
                    <Typography variant="caption" color="text.secondary" display="block">
                      Falls back to the cheapest in-stock option if this one sells out
                    </Typography>
                  </Typography>
                }
              />
            </Stack>
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => onSave(draft)}>
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}
