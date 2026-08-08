import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { PageLoader } from '../components/common/Spinner';

/**
 * Gate for account-only routes. Waits for the session probe to finish so a hard
 * refresh on /account doesn't bounce a logged-in user to the login page.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, initialising } = useSelector((s) => s.auth);
  const location = useLocation();

  if (initialising) return <PageLoader label="Checking your session…" />;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }

  return children;
}
