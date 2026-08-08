import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';

import VisibilityIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOffOutlined';
import LockIcon from '@mui/icons-material/LockOutlined';

import { login, clearError } from '../store/authSlice';
import { APP_NAME } from '../utils/constants';

export default function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, error, errorCode, isAuthenticated } = useSelector((s) => s.auth);

  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);

  const redirectTo = location.state?.from || '/';

  useEffect(() => {
    if (isAuthenticated) navigate(redirectTo, { replace: true });
  }, [isAuthenticated, navigate, redirectTo]);

  useEffect(() => () => dispatch(clearError()), [dispatch]);

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const submit = (e) => {
    e.preventDefault();

    const found = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email)) found.email = 'Enter a valid email address';
    if (!values.password) found.password = 'Password is required';
    if (Object.keys(found).length) return setErrors(found);

    dispatch(login(values));
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        p: 2,
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)',
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Stack alignItems="center" sx={{ mb: 3 }}>
            <Box
              sx={{
                display: 'grid',
                placeItems: 'center',
                width: 56,
                height: 56,
                borderRadius: 3,
                bgcolor: 'primary.main',
                color: '#fff',
                mb: 2,
              }}
            >
              <LockIcon />
            </Box>
            <Typography variant="h5" fontWeight={800}>
              {APP_NAME}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Sign in to manage your store
            </Typography>
          </Stack>

          <form onSubmit={submit} noValidate>
            <Stack spacing={2.5}>
              {error && (
                // The countdown before a lockout is still a warning — there is
                // something the admin can do about it — so it reads amber, not red.
                <Alert severity={errorCode === 'INVALID_CREDENTIALS_WARNING' ? 'warning' : 'error'}>
                  {error}
                </Alert>
              )}

              <TextField
                fullWidth
                required
                type="email"
                label="Email address"
                value={values.email}
                onChange={set('email')}
                error={Boolean(errors.email)}
                helperText={errors.email}
                autoComplete="username"
                size="medium"
              />

              <TextField
                fullWidth
                required
                type={showPassword ? 'text' : 'password'}
                label="Password"
                value={values.password}
                onChange={set('password')}
                error={Boolean(errors.password)}
                helperText={errors.password}
                autoComplete="current-password"
                size="medium"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword((v) => !v)}
                        edge="end"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <Button
                type="submit"
                variant="contained"
                size="large"
                fullWidth
                disabled={loading}
                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
              >
                Sign in
              </Button>
            </Stack>
          </form>

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3, textAlign: 'center' }}>
            This panel is restricted to administrator accounts.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
