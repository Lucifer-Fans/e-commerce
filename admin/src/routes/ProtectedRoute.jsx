import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, user, initialising } = useSelector((s) => s.auth);
  const location = useLocation();

  if (initialising) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  // Belt and braces: the API also enforces the admin role on every route.
  if (!isAuthenticated || user?.role !== 'admin') {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return children;
}
