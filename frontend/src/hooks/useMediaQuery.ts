import { useEffect, useState } from 'react';

/** true saat media query cocok; ikut berubah saat layar diputar/di-resize. */
export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const on = () => setMatches(mql.matches);
    on();
    mql.addEventListener?.('change', on);
    return () => mql.removeEventListener?.('change', on);
  }, [query]);
  return matches;
}

/** Lebar HP (di bawah breakpoint md 768 px). */
export const useIsMobile = () => !useMediaQuery('(min-width: 768px)');
