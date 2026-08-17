import { useEffect, useState } from 'react';
import Grid from '@mui/material/Grid2';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import InputAdornment from '@mui/material/InputAdornment';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Autocomplete from '@mui/material/Autocomplete';

import { subCategoryApi, brandApi } from '../../api/endpoints';
import { formatPrice, computeFinalPrice } from '../../utils/format';

/** Step 1 — identity, taxonomy, pricing and the rich-ish description. */
export default function StepBasicInfo({ values, errors, onChange, categories }) {
  const [subCategories, setSubCategories] = useState([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [brands, setBrands] = useState([]);

  // The brand catalogue drives the dropdown. A product saved with a brand that
  // has since been renamed/deactivated keeps its value as an extra option so
  // editing it doesn't silently blank the field.
  useEffect(() => {
    brandApi
      .list()
      .then((res) => setBrands(res.data.brands.filter((b) => b.isActive).map((b) => b.name)))
      .catch(() => setBrands([]));
  }, []);

  // Sub-categories are always fetched for the *currently selected* parent.
  useEffect(() => {
    if (!values.category) {
      setSubCategories([]);
      return;
    }
    const parent = categories.find((c) => c._id === values.category);
    if (parent?.subCategories) {
      setSubCategories(parent.subCategories);
      return;
    }

    setLoadingSubs(true);
    subCategoryApi
      .list(values.category)
      .then((res) => setSubCategories(res.data.subCategories))
      .catch(() => setSubCategories([]))
      .finally(() => setLoadingSubs(false));
  }, [values.category, categories]);

  const brandOptions =
    values.brand && !brands.includes(values.brand) ? [values.brand, ...brands] : brands;

  const finalPrice = computeFinalPrice(values.price, values.discountPercent);
  const savings = (Number(values.price) || 0) - finalPrice;

  const set = (field) => (e) => onChange({ [field]: e.target.value });

  return (
    <Grid container spacing={2.5}>
      <Grid size={12}>
        <TextField
          fullWidth
          required
          label="Product name"
          value={values.name}
          onChange={set('name')}
          error={Boolean(errors.name)}
          helperText={errors.name || 'Shown on cards, search results and the product page'}
          inputProps={{ maxLength: 160 }}
        />
      </Grid>

      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField
          select
          fullWidth
          required
          label="Category"
          value={values.category}
          onChange={(e) => onChange({ category: e.target.value, subCategory: '' })}
          error={Boolean(errors.category)}
          helperText={errors.category}
        >
          {categories.length === 0 && (
            <MenuItem disabled value="">
              No categories — create one first
            </MenuItem>
          )}
          {categories.map((category) => (
            <MenuItem key={category._id} value={category._id}>
              {category.name}
            </MenuItem>
          ))}
        </TextField>
      </Grid>

      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField
          select
          fullWidth
          label="Sub-category"
          value={values.subCategory}
          onChange={set('subCategory')}
          disabled={!values.category || loadingSubs}
          error={Boolean(errors.subCategory)}
          helperText={
            errors.subCategory ||
            (!values.category
              ? 'Select a category first'
              : loadingSubs
                ? 'Loading…'
                : subCategories.length === 0
                  ? 'This category has no sub-categories'
                  : 'Optional but improves filtering')
          }
        >
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
          {subCategories.map((sub) => (
            <MenuItem key={sub._id} value={sub._id}>
              {sub.name}
            </MenuItem>
          ))}
        </TextField>
      </Grid>

      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField
          select
          fullWidth
          label="Brand"
          value={values.brand || ''}
          onChange={set('brand')}
          error={Boolean(errors.brand)}
          helperText={
            errors.brand ||
            (brands.length
              ? 'Pick one from the Brands catalogue'
              : 'Add brands under Catalogue → Brands')
          }
        >
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
          {brandOptions.map((brand) => (
            <MenuItem key={brand} value={brand}>
              {brand}
            </MenuItem>
          ))}
        </TextField>
      </Grid>

      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField
          fullWidth
          label="SKU"
          value={values.sku}
          onChange={(e) => onChange({ sku: e.target.value.toUpperCase() })}
          error={Boolean(errors.sku)}
          helperText={errors.sku || 'Optional internal stock code'}
        />
      </Grid>

      {/* ---------- Pricing ---------- */}
      <Grid size={12}>
        <Paper variant="outlined" sx={{ p: 2.5, bgcolor: 'grey.50' }}>
          <Typography variant="subtitle2" gutterBottom>
            Pricing
          </Typography>

          <Grid container spacing={2} alignItems="flex-start">
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                required
                type="number"
                label="MRP / Price"
                value={values.price}
                onChange={set('price')}
                error={Boolean(errors.price)}
                helperText={errors.price}
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                inputProps={{ min: 0, step: '0.01' }}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                type="number"
                label="Discount"
                value={values.discountPercent}
                onChange={set('discountPercent')}
                error={Boolean(errors.discountPercent)}
                helperText={errors.discountPercent}
                InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                inputProps={{ min: 0, max: 95, step: '0.1' }}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 4 }}>
              {/* Read-only: the server recomputes this on save, so it can't drift. */}
              <Box
                sx={{
                  border: 1,
                  borderColor: 'primary.main',
                  borderRadius: 2,
                  px: 2,
                  py: 1.25,
                  bgcolor: 'background.paper',
                }}
              >
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  Final price (auto-calculated)
                </Typography>
                <Typography variant="h5" color="primary.main" fontWeight={800}>
                  {formatPrice(finalPrice, true)}
                </Typography>
                {savings > 0 && (
                  <Typography variant="caption" color="success.main" fontWeight={700}>
                    Customer saves {formatPrice(savings, true)}
                  </Typography>
                )}
              </Box>
            </Grid>
          </Grid>
        </Paper>
      </Grid>

      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField
          fullWidth
          required
          type="number"
          label="Stock quantity"
          value={values.stock}
          onChange={set('stock')}
          error={Boolean(errors.stock)}
          helperText={errors.stock || 'Units available for sale'}
          inputProps={{ min: 0, step: 1 }}
        />
      </Grid>

      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField
          fullWidth
          type="number"
          label="Low stock alert threshold"
          value={values.lowStockThreshold}
          onChange={set('lowStockThreshold')}
          helperText="Flags the product on the dashboard at or below this level"
          inputProps={{ min: 0, step: 1 }}
        />
      </Grid>

      <Grid size={12}>
        <TextField
          fullWidth
          label="Short description"
          value={values.shortDescription}
          onChange={set('shortDescription')}
          helperText={`${values.shortDescription.length}/300 · One-line summary under the product title`}
          inputProps={{ maxLength: 300 }}
        />
      </Grid>

      <Grid size={12}>
        <TextField
          fullWidth
          required
          multiline
          minRows={6}
          label="Full description"
          value={values.description}
          onChange={set('description')}
          error={Boolean(errors.description)}
          helperText={
            errors.description ||
            'Basic HTML is supported: <p>, <strong>, <em>, <ul>, <li>, <h2>, <h3>. It is sanitised before it is stored.'
          }
        />
      </Grid>

      <Grid size={12}>
        <Autocomplete
          multiple
          freeSolo
          options={[]}
          value={values.tags}
          onChange={(_, next) => onChange({ tags: next.slice(0, 15) })}
          renderTags={(tagValues, getTagProps) =>
            tagValues.map((option, index) => (
              <Chip variant="outlined" size="small" label={option} {...getTagProps({ index })} key={option} />
            ))
          }
          renderInput={(params) => (
            <TextField
              {...params}
              label="Search tags"
              placeholder="Type a tag and press Enter"
              helperText="Improves search matching — e.g. waterproof, marine, 19mm"
            />
          )}
        />
      </Grid>
    </Grid>
  );
}
