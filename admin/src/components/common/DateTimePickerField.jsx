import { useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Popover from '@mui/material/Popover';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Typography from '@mui/material/Typography';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad = (n) => String(n).padStart(2, '0');

/** The `YYYY-MM-DDTHH:mm` local string the rest of the app already speaks. */
const toLocalString = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;

const fromLocalString = (s) => {
  if (!s) return null;
  const [date, time = '00:00'] = String(s).split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  if (!y || !m || !d) return null;
  const parsed = new Date(y, m - 1, d, h || 0, min || 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * "12-08-2026 10:15" — what the closed field reads. Deliberately the same
 * `DD-MM-YYYY HH:mm` the native `datetime-local` input showed here, so the
 * field looks unchanged to anyone already used to reading it.
 */
const formatDisplay = (d) =>
  `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a, b) =>
  a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** The six-week grid a month is drawn on, with the neighbouring days it borrows. */
const buildCells = (year, month) => {
  const first = new Date(year, month, 1);
  const lead = first.getDay();
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(year, month, 1 - lead + i);
    cells.push({ date, outside: date.getMonth() !== month });
  }
  return cells;
};

/** One reusable spinner column: a value between an up and a down chevron. */
function Spinner({ label, value, onStep }) {
  return (
    <Stack alignItems="center" spacing={0.25} sx={{ minWidth: 58 }}>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.25 }}>
        {label}
      </Typography>
      <IconButton size="small" aria-label={`${label} up`} onClick={() => onStep(1)}>
        <KeyboardArrowUpIcon fontSize="small" />
      </IconButton>
      <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', lineHeight: 1.6 }}>{value}</Typography>
      <IconButton size="small" aria-label={`${label} down`} onClick={() => onStep(-1)}>
        <KeyboardArrowDownIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
}

/**
 * A date *and* time picker in one panel: month grid on the left, hour / minute /
 * meridiem spinners on the right, committed with "Done".
 *
 * It stands in for `<input type="datetime-local">`, whose popup is drawn by the
 * browser and so looks nothing like the rest of the panel and differs per OS.
 * The value contract is identical — a `YYYY-MM-DDTHH:mm` local string handed
 * back through an `onChange` that receives `{ target: { value } }` — so callers
 * keep the change handlers and the timezone conversion they already had.
 *
 * Nothing is applied while the panel is open: dismissing it discards the draft,
 * which keeps a stray click from silently rewriting a slot already on record.
 */
export default function DateTimePickerField({
  value,
  onChange,
  label,
  required = false,
  error = false,
  helperText,
  min,
  fullWidth = true,
  name,
}) {
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);

  const selected = fromLocalString(value);
  const minDate = fromLocalString(min);

  // Draft state, live only while the panel is open.
  const [view, setView] = useState({ year: 2000, month: 0 });
  const [day, setDay] = useState(null);
  const [hour, setHour] = useState(12);
  const [minute, setMinute] = useState(0);
  const [meridiem, setMeridiem] = useState('AM');

  const seed = (from) => {
    const base = from || minDate || new Date();
    setView({ year: base.getFullYear(), month: base.getMonth() });
    setDay(startOfDay(base));
    setHour(base.getHours() % 12 || 12);
    setMinute(base.getMinutes());
    setMeridiem(base.getHours() < 12 ? 'AM' : 'PM');
  };

  // Re-seed whenever the panel opens, so it always reflects the current value.
  useEffect(() => {
    if (open) seed(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const draft = useMemo(() => {
    if (!day) return null;
    const h24 = (hour % 12) + (meridiem === 'PM' ? 12 : 0);
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h24, minute, 0, 0);
  }, [day, hour, minute, meridiem]);

  const cells = useMemo(() => buildCells(view.year, view.month), [view]);
  const today = startOfDay(new Date());
  const minDay = minDate ? startOfDay(minDate) : null;
  const tooEarly = Boolean(minDate && draft && draft.getTime() < minDate.getTime());

  // Enough years to schedule ahead, without a scroll that never ends.
  const years = useMemo(() => {
    const first = (minDate || new Date()).getFullYear();
    const span = Array.from({ length: 6 }, (_, i) => first + i);
    return span.includes(view.year) ? span : [view.year, ...span].sort((a, b) => a - b);
  }, [minDate, view.year]);

  const shiftMonth = (delta) => {
    const next = new Date(view.year, view.month + delta, 1);
    setView({ year: next.getFullYear(), month: next.getMonth() });
  };

  const stepHour = (delta) => setHour((h) => ((h - 1 + delta + 12) % 12) + 1);
  const stepMinute = (delta) => setMinute((m) => (m + delta + 60) % 60);
  const toggleMeridiem = () => setMeridiem((m) => (m === 'AM' ? 'PM' : 'AM'));

  const jumpTo = (date) => {
    setView({ year: date.getFullYear(), month: date.getMonth() });
    setDay(startOfDay(date));
  };

  const setNow = () => {
    const now = new Date();
    jumpTo(now);
    setHour(now.getHours() % 12 || 12);
    setMinute(now.getMinutes());
    setMeridiem(now.getHours() < 12 ? 'AM' : 'PM');
  };

  const done = () => {
    if (!draft) return;
    onChange?.({ target: { name, value: toLocalString(draft) } });
    setOpen(false);
  };

  return (
    <>
      <TextField
        fullWidth={fullWidth}
        required={required}
        label={label}
        error={error}
        helperText={helperText}
        value={selected ? formatDisplay(selected) : ''}
        placeholder="dd-mm-yyyy --:--"
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        inputRef={anchorRef}
        InputLabelProps={{ shrink: true }}
        InputProps={{
          readOnly: true,
          endAdornment: (
            <InputAdornment position="end">
              <IconButton size="small" edge="end" aria-label="Open date and time picker">
                <CalendarMonthOutlinedIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ),
        }}
        sx={{ '& .MuiInputBase-input': { cursor: 'pointer' } }}
      />

      <Popover
        open={open}
        anchorEl={anchorRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              p: 2,
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              boxShadow: '0 12px 32px rgba(15,23,42,.12)',
            },
          },
        }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5}>
          {/* Calendar */}
          <Box>
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1 }}>
              <IconButton size="small" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
                <ChevronLeftIcon fontSize="small" />
              </IconButton>

              <Select
                size="small"
                value={view.month}
                onChange={(e) => setView((v) => ({ ...v, month: Number(e.target.value) }))}
                variant="standard"
                disableUnderline
                sx={{ fontSize: '.875rem', fontWeight: 600, flex: 1 }}
              >
                {MONTHS.map((m, i) => (
                  <MenuItem key={m} value={i}>
                    {m}
                  </MenuItem>
                ))}
              </Select>

              <Select
                size="small"
                value={view.year}
                onChange={(e) => setView((v) => ({ ...v, year: Number(e.target.value) }))}
                variant="standard"
                disableUnderline
                sx={{ fontSize: '.875rem', fontWeight: 600 }}
              >
                {years.map((y) => (
                  <MenuItem key={y} value={y}>
                    {y}
                  </MenuItem>
                ))}
              </Select>

              <IconButton size="small" aria-label="Next month" onClick={() => shiftMonth(1)}>
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </Stack>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 34px)',
                gap: 0.25,
                justifyItems: 'center',
              }}
            >
              {WEEKDAYS.map((w) => (
                <Typography key={w} variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {w}
                </Typography>
              ))}

              {cells.map(({ date, outside }) => {
                const disabled = outside || (minDay && date.getTime() < minDay.getTime());
                const isSelected = sameDay(date, day);
                const isToday = sameDay(date, today);
                return (
                  <ButtonBase
                    key={date.toISOString()}
                    disabled={disabled}
                    onClick={() => setDay(startOfDay(date))}
                    aria-label={date.toDateString()}
                    aria-current={isToday ? 'date' : undefined}
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: 1,
                      fontSize: '.8125rem',
                      fontWeight: isSelected ? 700 : 500,
                      color: disabled ? 'text.disabled' : 'text.primary',
                      border: '1px solid',
                      borderColor: isToday && !isSelected ? 'divider' : 'transparent',
                      ...(isSelected && {
                        bgcolor: 'primary.main',
                        color: 'common.white',
                        '&:hover': { bgcolor: 'primary.dark' },
                      }),
                      '&:hover': isSelected ? undefined : { bgcolor: 'action.hover' },
                    }}
                  >
                    {date.getDate()}
                  </ButtonBase>
                );
              })}
            </Box>
          </Box>

          {/* Time + actions */}
          <Stack spacing={1.5} sx={{ minWidth: 200 }}>
            <Typography variant="subtitle2">Time</Typography>

            <Stack direction="row" justifyContent="space-between">
              <Spinner label="Hour" value={pad(hour)} onStep={stepHour} />
              <Spinner label="Minute" value={pad(minute)} onStep={stepMinute} />
              <Spinner label="AM / PM" value={meridiem} onStep={toggleMeridiem} />
            </Stack>

            <Box sx={{ flexGrow: 1 }} />

            <Stack direction="row" spacing={1}>
              {[
                { label: 'Today', onClick: () => jumpTo(new Date()) },
                { label: 'Now', onClick: setNow },
              ].map((action) => (
                <Button
                  key={action.label}
                  fullWidth
                  variant="contained"
                  onClick={action.onClick}
                  sx={{
                    bgcolor: 'grey.100',
                    color: 'text.primary',
                    '&:hover': { bgcolor: 'grey.200' },
                  }}
                >
                  {action.label}
                </Button>
              ))}
            </Stack>

            <Button fullWidth variant="contained" onClick={done} disabled={!draft || tooEarly}>
              Done
            </Button>

            {tooEarly && (
              <Typography variant="caption" color="error">
                Pick a time in the future
              </Typography>
            )}
          </Stack>
        </Stack>
      </Popover>
    </>
  );
}
