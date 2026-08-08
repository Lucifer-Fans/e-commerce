import Stack from '@mui/material/Stack';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import RangeSelect from './RangeSelect';

/**
 * The period dropdown plus its reset, as one unit — every dashboard panel gets
 * the same pairing. When the range is already the default the button refreshes
 * instead, so it is never a no-op.
 */
export default function RangeControls({ range, onRefresh, width }) {
  const handleReset = () => {
    if (range.isDefault) onRefresh?.();
    else range.reset();
  };

  return (
    <Stack direction="row" alignItems="center" spacing={0.75}>
      <RangeSelect rangeKey={range.rangeKey} custom={range.custom} onChange={range.select} width={width} />

      <Tooltip title={range.isDefault ? 'Refresh' : 'Reset to the last 30 days'}>
        <IconButton
          size="small"
          onClick={handleReset}
          color={range.isDefault ? 'default' : 'primary'}
          sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5 }}
        >
          <RestartAltIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}
