import { useRef, useState } from 'react';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Popover from '@mui/material/Popover';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import { RANGE_OPTIONS, today } from './useRangeQuery';

const CUSTOM = 'custom';

/**
 * Compact period dropdown shared by the dashboard panels. Picking "Custom…"
 * keeps the select on its previous value until a date range is actually
 * applied, so cancelling never leaves the panel showing a range it isn't using.
 */
export default function RangeSelect({ rangeKey, custom, onChange, width = 150, label }) {
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ from: custom?.from || '', to: custom?.to || today() });

  const isCustom = rangeKey === CUSTOM;
  const customLabel = isCustom && custom?.from ? `${custom.from} → ${custom.to}` : 'Custom…';

  const handleChange = (e) => {
    const value = e.target.value;
    if (value === CUSTOM) {
      setDraft({ from: custom?.from || '', to: custom?.to || today() });
      setOpen(true);
      return;
    }
    onChange(value);
  };

  const apply = () => {
    if (!draft.from) return;
    onChange(CUSTOM, { from: draft.from, to: draft.to || today() });
    setOpen(false);
  };

  return (
    <>
      <TextField
        select
        size="small"
        label={label}
        value={rangeKey}
        onChange={handleChange}
        ref={anchorRef}
        sx={{ minWidth: width, '& .MuiSelect-select': { py: 0.75, fontSize: 13 } }}
      >
        {RANGE_OPTIONS.map((r) => (
          <MenuItem key={r.key} value={r.key} sx={{ fontSize: 14 }}>
            {r.label}
          </MenuItem>
        ))}
        <MenuItem value={CUSTOM} sx={{ fontSize: 14 }}>
          {customLabel}
        </MenuItem>
      </TextField>

      <Popover
        open={open}
        anchorEl={anchorRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Stack spacing={1.5} sx={{ p: 2, width: 260 }}>
          <Typography variant="subtitle2">Custom date range</Typography>
          <TextField
            type="date"
            label="From"
            size="small"
            value={draft.from}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            inputProps={{ max: draft.to || today() }}
          />
          <TextField
            type="date"
            label="To"
            size="small"
            value={draft.to}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: draft.from || undefined, max: today() }}
          />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button size="small" color="inherit" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="small" variant="contained" onClick={apply} disabled={!draft.from}>
              Apply
            </Button>
          </Stack>
        </Stack>
      </Popover>
    </>
  );
}
