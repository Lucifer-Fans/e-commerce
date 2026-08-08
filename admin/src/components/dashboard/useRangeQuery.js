import { useCallback, useMemo, useState } from 'react';

export const RANGE_OPTIONS = [
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'all', label: 'All time' },
];

export const today = () => new Date().toISOString().slice(0, 10);

/**
 * Shared range state for every dashboard panel: the three presets plus a custom
 * window, exposed as the query object the API expects. `queryKey` is a stable
 * string so useFetch can depend on it without re-running on identical objects.
 */
export default function useRangeQuery(initialKey = 'all') {
  const [rangeKey, setRangeKey] = useState(initialKey);
  const [custom, setCustom] = useState({ from: '', to: '' });

  const query = useMemo(
    () => (rangeKey === 'custom' ? { range: 'custom', from: custom.from, to: custom.to } : { range: rangeKey }),
    [rangeKey, custom],
  );

  const select = useCallback((key, range) => {
    setRangeKey(key);
    if (range) setCustom(range);
  }, []);

  const reset = useCallback(() => {
    setRangeKey(initialKey);
    setCustom({ from: '', to: '' });
  }, [initialKey]);

  return {
    rangeKey,
    custom,
    query,
    queryKey: JSON.stringify(query),
    select,
    reset,
    isDefault: rangeKey === initialKey,
  };
}
