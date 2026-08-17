import Box from '@mui/material/Box';
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
const PRESETS = ['Material', 'Thickness', 'Weight', 'Warranty', 'Country of Origin'];

/** Swap an entry with its neighbour; returns the list untouched at either edge. */
const reorder = (list, index, direction) => {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

/** Up / down / remove controls — shared so all three sections behave identically. */
function RowControls({ index, count, onMove, onRemove, removeLabel }) {
  return (
    <Stack direction="row" spacing={0.25} sx={{ flexShrink: 0 }}>
      <Tooltip title="Move up">
        <span>
          <IconButton size="small" disabled={index === 0} onClick={() => onMove(index, -1)}>
            <ArrowUpIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Move down">
        <span>
          <IconButton size="small" disabled={index === count - 1} onClick={() => onMove(index, 1)}>
            <ArrowDownIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={removeLabel}>
        <IconButton size="small" color="error" onClick={() => onRemove(index)}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

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

  const moveFeature = (index, direction) =>
    onChange({ features: reorder(features, index, direction) });

  const usedKeys = new Set(features.map((f) => f.key.trim().toLowerCase()));

  /* ---------------- Highlights ---------------- */
  const setHighlight = (index, text) =>
    onChange({ highlights: highlights.map((h, i) => (i === index ? text : h)) });

  const removeHighlight = (index) =>
    onChange({ highlights: highlights.filter((_, i) => i !== index) });

  const moveHighlight = (index, direction) =>
    onChange({ highlights: reorder(highlights, index, direction) });

  /* ---------------- FAQs ---------------- */
  const setFaq = (index, patch) =>
    onChange({ faqs: faqs.map((f, i) => (i === index ? { ...f, ...patch } : f)) });

  const removeFaq = (index) => onChange({ faqs: faqs.filter((_, i) => i !== index) });

  const moveFaq = (index, direction) => onChange({ faqs: reorder(faqs, index, direction) });

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
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              alignItems={{ xs: 'stretch', sm: 'center' }}
            >
              <Box sx={{ display: { xs: 'none', sm: 'flex' }, color: 'text.disabled' }}>
                <DragIndicatorIcon fontSize="small" />
              </Box>

              <TextField
                label={`Feature ${index + 1}`}
                placeholder="e.g. Material"
                value={feature.key}
                onChange={(e) => setFeature(index, { key: e.target.value })}
                inputProps={{ maxLength: 60 }}
                sx={{ width: { xs: '100%', sm: 260 }, flexShrink: 0 }}
              />

              <TextField
                label="Value"
                placeholder="e.g. 100% Hardwood Veneer"
                value={feature.value}
                onChange={(e) => setFeature(index, { value: e.target.value })}
                inputProps={{ maxLength: 500 }}
                sx={{ flexGrow: 1, minWidth: 0 }}
              />

              <RowControls
                index={index}
                count={features.length}
                onMove={moveFeature}
                onRemove={removeFeature}
                removeLabel="Remove row"
              />
            </Stack>
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
          <Paper key={index} variant="outlined" sx={{ p: 1.5 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box sx={{ display: { xs: 'none', sm: 'flex' }, color: 'text.disabled' }}>
                <DragIndicatorIcon fontSize="small" />
              </Box>

              <TextField
                label={`Highlight ${index + 1}`}
                value={highlight}
                onChange={(e) => setHighlight(index, e.target.value)}
                inputProps={{ maxLength: 140 }}
                sx={{ flexGrow: 1, minWidth: 0 }}
              />

              <RowControls
                index={index}
                count={highlights.length}
                onMove={moveHighlight}
                onRemove={removeHighlight}
                removeLabel="Remove highlight"
              />
            </Stack>
          </Paper>
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
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Box sx={{ display: { xs: 'none', sm: 'flex' }, color: 'text.disabled' }}>
                  <DragIndicatorIcon fontSize="small" />
                </Box>
                <Typography variant="subtitle2">Question {index + 1}</Typography>
              </Stack>
              <RowControls
                index={index}
                count={faqs.length}
                onMove={moveFaq}
                onRemove={removeFaq}
                removeLabel="Remove FAQ"
              />
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
