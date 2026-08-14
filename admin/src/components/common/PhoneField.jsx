import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';

/**
 * The admin's mobile number box — the same locked `+91` chip the storefront
 * shows, wrapped around an ordinary MUI `TextField` so it still carries the
 * label, helper text and error state every other field in a dialog does.
 *
 * The country code is presentation only: `onChange` always hands back the bare
 * ten digits the platform stores, so a pasted "+91 98765 43210" lands as
 * "9876543210" rather than being refused on submit.
 */
export default function PhoneField({ value, onChange, InputProps, inputProps, ...props }) {
  const handleChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '');
    const local = digits.length > 10 && digits.startsWith('91') ? digits.slice(2) : digits;
    onChange({ target: { name: props.name, value: local.slice(0, 10) } });
  };

  return (
    <TextField
      value={value}
      onChange={handleChange}
      inputProps={{ inputMode: 'numeric', maxLength: 10, autoComplete: 'tel', ...inputProps }}
      InputProps={{
        ...InputProps,
        sx: { pl: 0, alignItems: 'stretch', overflow: 'hidden', ...InputProps?.sx },
        startAdornment: (
          <InputAdornment
            position="start"
            sx={{ mr: 0, ml: 0, height: 'auto', maxHeight: 'none', alignItems: 'stretch' }}
          >
            <Box
              component="span"
              sx={{
                alignSelf: 'stretch',
                display: 'grid',
                placeItems: 'center',
                px: 1.5,
                mr: 1.5,
                borderRight: 1,
                borderColor: 'divider',
                bgcolor: 'action.hover',
                fontSize: 14,
                fontWeight: 600,
                color: 'text.secondary',
              }}
            >
              +91
            </Box>
          </InputAdornment>
        ),
      }}
      {...props}
    />
  );
}
