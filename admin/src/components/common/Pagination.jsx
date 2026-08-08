import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';

import FirstPageIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import PrevPageIcon from '@mui/icons-material/ArrowBack';
import NextPageIcon from '@mui/icons-material/ArrowForward';
import LastPageIcon from '@mui/icons-material/KeyboardDoubleArrowRight';

/** Square nav buttons share one look; only the active page swaps to a filled style. */
const navButtonSx = {
  width: 34,
  height: 34,
  borderRadius: 2,
  border: 1,
  borderColor: 'divider',
  color: 'text.secondary',
  '&:hover': { bgcolor: 'action.hover', borderColor: '#cbd5e1' },
  '&.Mui-disabled': { borderColor: 'divider', color: '#cbd5e1' },
};

function NavButton({ title, disabled, onClick, children }) {
  const button = (
    <span>
      <IconButton size="small" disabled={disabled} onClick={onClick} sx={navButtonSx}>
        {children}
      </IconButton>
    </span>
  );

  // Tooltips need a non-disabled wrapper, hence the <span>.
  return disabled ? button : <Tooltip title={title}>{button}</Tooltip>;
}

/**
 * Pagination bar used by every admin list. Page numbers are 1-indexed,
 * matching the API rather than MUI's 0-indexed TablePagination.
 */
export default function Pagination({
  page = 1,
  limit = 10,
  total = 0,
  onPageChange,
  onLimitChange,
  rowsPerPageOptions = [10, 25, 50, 100],
}) {
  // The option list stays fixed; an off-list size falls back to the first
  // option so the Select never renders blank.
  const selected = rowsPerPageOptions.includes(limit) ? limit : rowsPerPageOptions[0];

  const pageCount = Math.max(1, Math.ceil(total / limit));
  const current = Math.min(Math.max(1, page), pageCount);
  const from = total === 0 ? 0 : (current - 1) * limit + 1;
  const to = Math.min(current * limit, total);

  const goTo = (next) => {
    const clamped = Math.min(Math.max(1, next), pageCount);
    if (clamped !== current) onPageChange?.(clamped);
  };

  return (
    <Box
      sx={{
        px: 2,
        py: 1.25,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 1.5,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          Rows per page:
        </Typography>

        <Select
          size="small"
          value={selected}
          onChange={(e) => onLimitChange?.(Number(e.target.value))}
          sx={{
            minWidth: 76,
            borderRadius: 2,
            '& .MuiSelect-select': { py: 0.75, fontSize: 13.5, fontWeight: 600 },
          }}
        >
          {rowsPerPageOptions.map((option) => (
            <MenuItem key={option} value={option} sx={{ fontSize: 13.5 }}>
              {option}
            </MenuItem>
          ))}
        </Select>

        <Typography variant="body2" color="text.secondary">
          {from}–{to} of{' '}
          <Box component="span" sx={{ color: 'text.primary', fontWeight: 700 }}>
            {total}
          </Box>
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          Page{' '}
          <Box component="span" sx={{ color: 'text.primary', fontWeight: 700 }}>
            {current}
          </Box>{' '}
          of{' '}
          <Box component="span" sx={{ color: 'text.primary', fontWeight: 700 }}>
            {pageCount}
          </Box>
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <NavButton title="First page" disabled={current === 1} onClick={() => goTo(1)}>
            <FirstPageIcon fontSize="small" />
          </NavButton>
          <NavButton title="Previous page" disabled={current === 1} onClick={() => goTo(current - 1)}>
            <PrevPageIcon fontSize="small" />
          </NavButton>

          <Box
            sx={{
              ...navButtonSx,
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'primary.main',
              borderColor: 'primary.main',
              color: '#fff',
              fontSize: 13.5,
              fontWeight: 700,
            }}
          >
            {current}
          </Box>

          <NavButton
            title="Next page"
            disabled={current === pageCount}
            onClick={() => goTo(current + 1)}
          >
            <NextPageIcon fontSize="small" />
          </NavButton>
          <NavButton
            title="Last page"
            disabled={current === pageCount}
            onClick={() => goTo(pageCount)}
          >
            <LastPageIcon fontSize="small" />
          </NavButton>
        </Box>
      </Box>
    </Box>
  );
}
