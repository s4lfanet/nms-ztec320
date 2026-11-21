import { useEffect, useRef, useState } from 'react';

/** Kelas kedip singkat sesuai status baru (danger/warning/success). */
export function flashClass(status: string | undefined | null): string {
  const s = (status || '').toLowerCase();
  if (s === 'los' || s === 'offline' || s === 'down') return 'status-flash status-flash-danger';
  if (s === 'dyinggasp' || s === 'warning') return 'status-flash status-flash-warning';
  if (s === 'online' || s === 'up') return 'status-flash status-flash-success';
  return '';
}

/**
 * ID item yang statusnya BERUBAH sejak data sebelumnya (bukan saat muat
 * pertama). Dipakai untuk mengedipkan baris/kartu ±2 detik ketika refresh
 * otomatis membawa gangguan baru atau pemulihan.
 */
export function useStatusFlash<T>(
  items: T[] | undefined,
  getId: (t: T) => string | number,
  getStatus: (t: T) => string | undefined | null,
  durationMs = 2200,
): Map<string | number, string> {
  const prev = useRef<Map<string | number, string> | null>(null);
  const [flashing, setFlashing] = useState<Map<string | number, string>>(new Map());

  useEffect(() => {
    if (!items) return;
    const now = new Map<string | number, string>();
    for (const it of items) now.set(getId(it), String(getStatus(it) ?? ''));
    const before = prev.current;
    prev.current = now;
    if (!before) return;                         // muat pertama: tidak berkedip
    const changed = new Map<string | number, string>();
    now.forEach((st, id) => {
      if (before.has(id) && before.get(id) !== st) changed.set(id, st);
    });
    if (changed.size === 0) return;
    setFlashing(changed);
    const t = window.setTimeout(() => setFlashing(new Map()), durationMs);
    return () => window.clearTimeout(t);
    // getId/getStatus dianggap stabil (fungsi inline murni)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, durationMs]);

  return flashing;
}
