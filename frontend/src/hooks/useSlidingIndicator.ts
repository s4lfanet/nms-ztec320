import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

/**
 * Posisi sorotan yang MELUNCUR ke elemen aktif (tab, menu samping, bar bawah).
 * Mengukur elemen yang cocok dengan `selector` di dalam `container`, lalu
 * mengembalikan style absolut (transform + ukuran) — transisinya di CSS.
 * Kali pertama tampil tanpa transisi supaya tidak "terbang" dari pojok.
 */
export function useSlidingIndicator<T extends HTMLElement>(
  selector: string,
  deps: unknown[],
): { ref: RefObject<T | null>; style: CSSProperties; ready: boolean } {
  const ref = useRef<T | null>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      const el = root.querySelector<HTMLElement>(selector);
      if (!el || el.offsetWidth === 0) { setBox(null); return; }
      setBox({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(root);
    root.querySelectorAll<HTMLElement>(':scope > *').forEach(n => ro?.observe(n));
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const first = !placed.current && box !== null;
  if (box) placed.current = true;
  const style: CSSProperties = box
    ? {
        width: box.w, height: box.h,
        transform: `translate3d(${box.x}px, ${box.y}px, 0)`,
        opacity: 1,
        transition: first ? 'none' : undefined,
      }
    : { opacity: 0 };
  return { ref, style, ready: box !== null };
}
