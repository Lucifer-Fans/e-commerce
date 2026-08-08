import { useState } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';
import Autocomplete from '@mui/material/Autocomplete';
import Divider from '@mui/material/Divider';
import Popover from '@mui/material/Popover';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import ArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import ArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import PaletteIcon from '@mui/icons-material/PaletteOutlined';

import { toSlug } from '../../utils/variants';

/**
 * Presets, not a fixed list. Any name the admin types becomes a real attribute — Color,
 * Size, Storage, RAM, Waist, Shoe Size or anything a future catalogue needs — and the
 * storefront renders whatever arrives without a code change.
 */
const PRESETS = [
  { name: 'Color', values: ['Black', 'White', 'Blue', 'Red', 'Green', 'Grey'], inputType: 'swatch' },
  { name: 'Size', values: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], inputType: 'chip' },
  { name: 'Storage', values: ['64 GB', '128 GB', '256 GB', '512 GB', '1 TB'], inputType: 'chip' },
  { name: 'RAM', values: ['4 GB', '6 GB', '8 GB', '12 GB', '16 GB'], inputType: 'chip' },
  { name: 'Waist', values: ['28', '30', '32', '34', '36', '38'], inputType: 'chip' },
  { name: 'Shoe Size', values: ['6', '7', '8', '9', '10', '11'], inputType: 'chip' },
  { name: 'Material', values: [], inputType: 'chip' },
  { name: 'Thickness', values: [], inputType: 'chip' },
];

const INPUT_TYPES = [
  { value: 'auto', label: 'Automatic', hint: 'Picks swatch or chip from the values' },
  { value: 'chip', label: 'Text chips', hint: 'Sizes, capacities, measurements' },
  { value: 'swatch', label: 'Colour swatches', hint: 'Needs a hex colour per value' },
  { value: 'image', label: 'Image thumbnails', hint: 'Uses the value image if set' },
];

/** Defines the axes of variation. Combinations are generated from this, not typed by hand. */
export default function VariantAttributeBuilder({ value = [], onChange, disabled = false }) {
  const [swatchFor, setSwatchFor] = useState(null); // { anchor, attributeIndex, valueIndex }

  const patch = (index, changes) =>
    onChange(value.map((attribute, i) => (i === index ? { ...attribute, ...changes } : attribute)));

  const addAttribute = (preset) =>
    onChange([
      ...value,
      {
        name: preset?.name || '',
        inputType: preset?.inputType || 'auto',
        helpText: '',
        values: (preset?.values || []).map((label) => ({ label, slug: toSlug(label) })),
      },
    ]);

  const removeAttribute = (index) => onChange(value.filter((_, i) => i !== index));

  const move = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  /**
   * Values arrive from a free-solo Autocomplete, so they can be strings (just typed) or
   * objects (already present). Duplicates are dropped on the slug, which is what the
   * generator de-duplicates on too.
   */
  const setValues = (index, raw) => {
    const seen = new Set();
    const values = raw
      .map((entry) => (typeof entry === 'string' ? { label: entry.trim() } : entry))
      .filter((entry) => {
        const slug = toSlug(entry.label);
        if (!slug || seen.has(slug)) return false;
        seen.add(slug);
        return true;
      })
      .map((entry) => ({ ...entry, label: entry.label.trim(), slug: toSlug(entry.label) }))
      .slice(0, 60);

    patch(index, { values });
  };

  const setSwatchHex = (attributeIndex, valueIndex, hex) => {
    const attribute = value[attributeIndex];
    patch(attributeIndex, {
      values: attribute.values.map((v, i) => (i === valueIndex ? { ...v, hex } : v)),
    });
  };

  const usedNames = new Set(value.map((a) => toSlug(a.name)).filter(Boolean));

  return (
    <Box>
      {value.map((attribute, index) => {
        const showSwatches = (attribute.inputType || 'auto') === 'swatch';

        return (
          <Paper key={index} variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Grid container spacing={2} alignItems="flex-start">
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  fullWidth
                  size="small"
                  required
                  label="Attribute name"
                  placeholder="Color, Size, Storage…"
                  value={attribute.name}
                  disabled={disabled}
                  onChange={(e) => patch(index, { name: e.target.value })}
                  helperText={
                    attribute.name && !toSlug(attribute.name)
                      ? 'Use letters or numbers'
                      : 'Shown above the selector on the product page'
                  }
                  error={Boolean(attribute.name) && !toSlug(attribute.name)}
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  label="Selector style"
                  value={attribute.inputType || 'auto'}
                  disabled={disabled}
                  onChange={(e) => patch(index, { inputType: e.target.value })}
                  helperText={INPUT_TYPES.find((t) => t.value === (attribute.inputType || 'auto'))?.hint}
                >
                  {INPUT_TYPES.map((type) => (
                    <MenuItem key={type.value} value={type.value}>
                      {type.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid size={{ xs: 12, sm: 4 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField
                    fullWidth
                    size="small"
                    label="Hint (optional)"
                    placeholder="e.g. Size chart"
                    value={attribute.helpText || ''}
                    disabled={disabled}
                    onChange={(e) => patch(index, { helpText: e.target.value })}
                  />
                  <Tooltip title="Move up">
                    <span>
                      <IconButton size="small" disabled={disabled || index === 0} onClick={() => move(index, -1)}>
                        <ArrowUpIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Move down">
                    <span>
                      <IconButton
                        size="small"
                        disabled={disabled || index === value.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDownIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Remove attribute">
                    <span>
                      <IconButton size="small" color="error" disabled={disabled} onClick={() => removeAttribute(index)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              </Grid>

              <Grid size={12}>
                <Autocomplete
                  multiple
                  freeSolo
                  disabled={disabled}
                  options={[]}
                  value={attribute.values}
                  getOptionLabel={(option) => (typeof option === 'string' ? option : option.label)}
                  onChange={(_, next) => setValues(index, next)}
                  renderTags={(tags, getTagProps) =>
                    tags.map((option, valueIndex) => {
                      const { key, ...tagProps } = getTagProps({ index: valueIndex });
                      return (
                        <Chip
                          key={key}
                          {...tagProps}
                          size="small"
                          variant="outlined"
                          label={option.label}
                          // A swatch attribute lets the admin paint each value's colour.
                          icon={
                            showSwatches ? (
                              <Box
                                component="span"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  setSwatchFor({
                                    anchor: e.currentTarget,
                                    attributeIndex: index,
                                    valueIndex,
                                  });
                                }}
                                sx={{
                                  width: 16,
                                  height: 16,
                                  borderRadius: '50%',
                                  ml: 0.75,
                                  cursor: 'pointer',
                                  border: 1,
                                  borderColor: 'divider',
                                  bgcolor: option.hex || 'grey.300',
                                }}
                              />
                            ) : undefined
                          }
                        />
                      );
                    })
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      size="small"
                      label={`${attribute.name || 'Attribute'} values`}
                      placeholder="Type a value and press Enter"
                      helperText={
                        showSwatches
                          ? `${attribute.values.length} value(s) · click a dot to set its colour`
                          : `${attribute.values.length} value(s) · each one multiplies the number of SKUs`
                      }
                    />
                  )}
                />
              </Grid>
            </Grid>
          </Paper>
        );
      })}

      <Divider sx={{ my: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Add an attribute
        </Typography>
      </Divider>

      <Stack direction="row" flexWrap="wrap" gap={1}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddIcon />}
          disabled={disabled || value.length >= 6}
          onClick={() => addAttribute(null)}
        >
          Custom attribute
        </Button>
        {PRESETS.filter((preset) => !usedNames.has(toSlug(preset.name))).map((preset) => (
          <Chip
            key={preset.name}
            label={preset.name}
            size="small"
            icon={<AddIcon sx={{ fontSize: 15 }} />}
            variant="outlined"
            clickable
            disabled={disabled || value.length >= 6}
            onClick={() => addAttribute(preset)}
          />
        ))}
      </Stack>

      {value.length >= 6 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Six attributes is the maximum — beyond that the combination count becomes unmanageable.
        </Typography>
      )}

      <Popover
        open={Boolean(swatchFor)}
        anchorEl={swatchFor?.anchor}
        onClose={() => setSwatchFor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        {swatchFor && (
          <Stack spacing={1.5} sx={{ p: 2, width: 220 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <PaletteIcon fontSize="small" color="action" />
              <Typography variant="subtitle2">
                {value[swatchFor.attributeIndex]?.values[swatchFor.valueIndex]?.label}
              </Typography>
            </Stack>
            <TextField
              type="color"
              size="small"
              fullWidth
              value={value[swatchFor.attributeIndex]?.values[swatchFor.valueIndex]?.hex || '#000000'}
              onChange={(e) => setSwatchHex(swatchFor.attributeIndex, swatchFor.valueIndex, e.target.value)}
            />
            <TextField
              size="small"
              fullWidth
              label="Hex"
              placeholder="#1a1a1a"
              value={value[swatchFor.attributeIndex]?.values[swatchFor.valueIndex]?.hex || ''}
              onChange={(e) => setSwatchHex(swatchFor.attributeIndex, swatchFor.valueIndex, e.target.value)}
            />
          </Stack>
        )}
      </Popover>
    </Box>
  );
}
