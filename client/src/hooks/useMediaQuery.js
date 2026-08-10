import { useEffect, useState } from 'react';

/**
 * Subscribes to a CSS media query so layout-dependent behaviour (not just
 * styling) can branch in JS — e.g. only touch/handheld widths open the image
 * viewer popup while desktop keeps its hover magnifier.
 *
 *   const isDesktop = useMediaQuery('(min-width: 1024px)');
 */
export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const list = window.matchMedia(query);
    const onChange = (event) => setMatches(event.matches);

    setMatches(list.matches);
    list.addEventListener('change', onChange);

    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
