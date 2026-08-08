import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import ArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import ArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';

/** Quick-start rows so the admin isn't staring at an empty form. */
const PRESETS = [
  'Material', 'Thickness', 'Standard', 'Finish', 'Size', 'Colour',
  'Weight', 'Warranty', 'Applications', 'Country of Origin',
];

/**
 * Step 2 — unlimited key/value feature rows. These render as the specification
 * table in the "Features" tab on the storefront product page.
 */
export default function StepFeatures({ values, errors, onChange }) {
  const features = values.features;
  const highlights = values.highlights;
  const faqs = values.faqs;

  /* ---------------- Features ---------------- */
  const setFeature = (index, patch) => {
    const next = features.map((f, i) => (i === index ? { ...f, ...patch } : f));
    onChange({ features: next });
  };

  const addFeature = (key = '') =>
    onChange({ features: [...features, { key, value: '' }] });

  const removeFeature = (index) =>
    onChange({ features: features.filter((_, i) => i !== index) });

  const moveFeature = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= features.length) return;
    const next = [...features];
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ features: next });
  };

  const usedKeys = new Set(features.map((f) => f.key.trim().toLowerCase()));

  /* ---------------- Highlights ---------------- */
  const setHighlight = (index, text) =>
    onChange({ highlights: highlights.map((h, i) => (i === index ? text : h)) });

  /* ---------------- FAQs ---------------- */
  const setFaq = (index, patch) =>
    onChange({ faqs: faqs.map((f, i) => (i === index ? { ...f, ...patch } : f)) });

  return (
    <Box>
      {/* ================= Features ================= */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Box>
          <Typography variant="h6">Product Features</Typography>
          <Typography variant="body2" color="text.secondary">
            Each row becomes one line in the specification table on the product page.
          </Typography>
        </Box>
        <Chip label={`${features.length} row${features.length === 1 ? '' : 's'}`} size="small" />
      </Stack>

      {errors.features && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errors.features}
        </Alert>
      )}

      {features.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No features added yet. Use a preset below or add a blank row — customers rely on this
          table to compare products.
        </Alert>
      )}

      <Stack spacing={1.5} sx={{ mb: 2 }}>
        {features.map((feature, index) => (
          <Paper key={index} variant="outlined" sx={{ p: 1.5 }}>
            <Grid container spacing={1.5} alignItems="center">
              <Grid size="auto" sx={{ display: { xs: 'none', sm: 'block' }, color: 'text.disabled' }}>
                <DragIndicatorIcon fontSize="small" />
              </Grid>

              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  fullWidth
                  label={`Feature ${index + 1}`}
                  placeholder="e.g. Material"
                  value={feature.key}
                  onChange={(e) => setFeature(index, { key: e.target.value })}
                  inputProps={{ maxLength: 60 }}
                />
              </Grid>

              <Grid size={{ xs: 12, sm: true }}>
                <TextField
                  fullWidth
                  label="Value"
                  placeholder="e.g. 100% Hardwood Veneer"
                  value={feature.value}
                  onChange={(e) => setFeature(index, { value: e.target.value })}
                  inputProps={{ maxLength: 500 }}
                />
              </Grid>

              <Grid size="auto">
                <Stack direction="row" spacing={0.25}>
                  <Tooltip title="Move up">
                    <span>
                      <IconButton size="small" disabled={index === 0} onClick={() => moveFeature(index, -1)}>
                        <ArrowUpIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Move down">
                    <span>
                      <IconButton
                        size="small"
                        disabled={index === features.length - 1}
                        onClick={() => moveFeature(index, 1)}
                      >
                        <ArrowDownIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Remove row">
                    <IconButton size="small" color="error" onClick={() => removeFeature(index)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Grid>
            </Grid>
          </Paper>
        ))}
      </Stack>

      <Button variant="outlined" startIcon={<AddIcon />} onClick={() => addFeature()}>
        Add feature row
      </Button>

      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          Quick add:
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 0.75 }}>
          {PRESETS.filter((preset) => !usedKeys.has(preset.toLowerCase())).map((preset) => (
            <Chip
              key={preset}
              label={preset}
              size="small"
              variant="outlined"
              onClick={() => addFeature(preset)}
              icon={<AddIcon sx={{ fontSize: 15 }} />}
            />
          ))}
        </Stack>
      </Box>

      <Divider sx={{ my: 4 }} />

      {/* ================= Highlights ================= */}
      <Typography variant="h6">Key Highlights</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Short selling points shown as a tick list above the description.
      </Typography>

      <Stack spacing={1.5} sx={{ mb: 2 }}>
        {highlights.map((highlight, index) => (
          <Stack key={index} direction="row" spacing={1} alignItems="center">
            <TextField
              fullWidth
              label={`Highlight ${index + 1}`}
              value={highlight}
              onChange={(e) => setHighlight(index, e.target.value)}
              inputProps={{ maxLength: 140 }}
            />
            <IconButton
              color="error"
              onClick={() => onChange({ highlights: highlights.filter((_, i) => i !== index) })}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))}
      </Stack>

      <Button
        variant="outlined"
        startIcon={<AddIcon />}
        disabled={highlights.length >= 15}
        onClick={() => onChange({ highlights: [...highlights, ''] })}
      >
        Add highlight
      </Button>

      <Divider sx={{ my: 4 }} />

      {/* ================= FAQs ================= */}
      <Typography variant="h6">Frequently Asked Questions</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Answer common pre-purchase questions to cut down on support requests.
      </Typography>

      <Stack spacing={2} sx={{ mb: 2 }}>
        {faqs.map((faq, index) => (
          <Paper key={index} variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
              <Typography variant="subtitle2">Question {index + 1}</Typography>
              <IconButton
                size="small"
                color="error"
                onClick={() => onChange({ faqs: faqs.filter((_, i) => i !== index) })}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>

            <Stack spacing={1.5}>
              <TextField
                fullWidth
                label="Question"
                value={faq.question}
                onChange={(e) => setFaq(index, { question: e.target.value })}
                inputProps={{ maxLength: 300 }}
              />
              <TextField
                fullWidth
                multiline
                minRows={2}
                label="Answer"
                value={faq.answer}
                onChange={(e) => setFaq(index, { answer: e.target.value })}
                inputProps={{ maxLength: 2000 }}
              />
            </Stack>
          </Paper>
        ))}
      </Stack>

      <Button
        variant="outlined"
        startIcon={<AddIcon />}
        disabled={faqs.length >= 20}
        onClick={() => onChange({ faqs: [...faqs, { question: '', answer: '' }] })}
      >
        Add FAQ
      </Button>
    </Box>
  );
}
