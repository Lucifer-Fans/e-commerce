import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Small data-fetching hook with loading/error state and a refetch handle.
 * Guards against setting state after unmount and against out-of-order responses.
 *
 * The active language is an implicit dependency of every request: the server
 * returns catalogue copy in whatever language the client asked for, so switching
 * language makes the data on screen stale. Handling it here means no caller has to
 * remember to add it, and no page can quietly miss it.
 *
 * @param {() => Promise<any>} fetcher
 * @param {Array} deps      re-runs when these change
 * @param {{ enabled?: boolean, initialData?: any }} [options]
 */
export default function useFetch(fetcher, deps = [], { enabled = true, initialData = null } = {}) {
  const { i18n } = useTranslation();
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  const mounted = useRef(true);
  const requestId = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    try {
      const result = await fetcher();
      // A slower earlier request must not overwrite a newer response.
      if (mounted.current && id === requestId.current) setData(result);
    } catch (err) {
      if (mounted.current && id === requestId.current) setError(err);
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, i18n.language, ...deps]);

  useEffect(() => {
    run();
  }, [run]);

  return { data, loading, error, refetch: run, setData };
}
