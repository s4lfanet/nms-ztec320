import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number from its previous value to `value` over `duration`ms.
 * Skips the animation entirely on mount (first render shows the real value
 * immediately) and on prefers-reduced-motion, so it only animates on
 * meaningful *changes* — e.g. a stat card updating after a refresh.
 */
export function useCountUp(value: number, duration = 600): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const mountedRef = useRef(false);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const from = fromRef.current;
    const to = value;
    if (prefersReduced || from === to) {
      fromRef.current = to;
      setDisplay(to);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return display;
}
