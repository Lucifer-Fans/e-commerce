import { useEffect, useRef } from 'react';

/** Closes dropdowns/drawers on an outside click or Escape. */
export default function useClickOutside(handler, active = true) {
  const ref = useRef(null);

  useEffect(() => {
    if (!active) return undefined;

    const onPointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) handler(event);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') handler(event);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [handler, active]);

  return ref;
}
