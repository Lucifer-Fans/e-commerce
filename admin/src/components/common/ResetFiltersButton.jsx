import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

/**
 * The reset that closes every filter row.
 *
 * An icon rather than the word: the row is already a queue of labelled inputs
 * competing for width, and on a laptop the last filter is the first thing to wrap.
 * Bordered like the fields beside it so it reads as part of the row instead of an
 * action floating next to one — the same pairing the dashboard's range controls use.
 *
 * @param {boolean} [disabled]  true when nothing is filtered; the tooltip says so
 *                              rather than leaving a dead control unexplained.
 * @param {'small'|'medium'} [size]  match the fields in the row it joins.
 */
export default function ResetFiltersButton({
  onClick,
  disabled = false,
  size = 'medium',
  title = 'Reset filters',
  sx,
}) {
  return (
    <Tooltip title={disabled ? 'No filters applied' : title}>
      {/* A disabled button emits no events, so the tooltip needs a live wrapper. */}
      <span style={{ alignSelf: 'center' }}>
        <IconButton
          aria-label={title}
          size={size}
          disabled={disabled}
          onClick={onClick}
          sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, ...sx }}
        >
          <RestartAltIcon fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  );
}
