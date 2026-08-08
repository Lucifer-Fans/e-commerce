import { useRouteError, isRouteErrorResponse, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Icon from '../components/common/Icon';

/**
 * Router-level `errorElement`. Replaces React Router's raw "Unexpected
 * Application Error" screen for anything the in-layout <ErrorBoundary> can't
 * catch — a crash in the Layout itself, a failed lazy chunk, a loader throw.
 */
export default function ErrorPage() {
  // This renders outside the storefront layout, so it leans on `common` only —
  // the one namespace guaranteed to be resolved.
  const { t } = useTranslation();
  const error = useRouteError();
  const navigate = useNavigate();

  const status = isRouteErrorResponse(error) ? error.status : undefined;

  // A failed dynamic import means the deployed chunk hash moved under an open tab.
  const isChunkError = /dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(
    error?.message || '',
  );

  let title = t('errors.crashTitle');
  let message = t('errors.crashMessage');

  if (status === 404) {
    title = t('errors.notFoundHeading');
    message = t('errors.notFoundMessage');
  } else if (isChunkError) {
    title = t('errors.staleChunkTitle');
    message = t('errors.staleChunkMessage');
  }

  return (
    <div className="container-page flex min-h-[70vh] flex-col items-center justify-center text-center">
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-red-50 text-danger">
        <Icon name="alert" size={36} />
      </div>

      {status && <p className="mb-2 text-5xl font-black text-ink-300">{status}</p>}

      <h1 className="mb-2 text-2xl font-bold text-ink-900">{title}</h1>
      <p className="mb-7 max-w-md text-sm text-ink-500">{message}</p>

      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => window.location.reload()} className="btn-primary">
          <Icon name="refresh" size={16} />
          {t('errors.reload')}
        </button>
        <button type="button" onClick={() => navigate(-1)} className="btn-outline">
          {t('actions.back')}
        </button>
        <Link to="/" className="btn-outline">
          {t('actions.goHome')}
        </Link>
      </div>

      {import.meta.env.DEV && error && (
        <pre className="mt-8 max-h-72 max-w-2xl overflow-auto rounded-lg bg-ink-900 p-4 text-left text-xs text-red-300">
          {error.stack || error.data || String(error)}
        </pre>
      )}
    </div>
  );
}
