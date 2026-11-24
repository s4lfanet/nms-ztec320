import { useEffect, useRef, useState } from 'react';
import { useIsFetching } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';

/**
 * Bilah progres tipis di tepi atas — hanya saat aplikasi MEMANG sedang memuat:
 * pindah halaman, atau data pertama sebuah halaman belum datang. Refresh latar
 * (refetchInterval) tidak memunculkannya, supaya tidak berkedip tiap 30 detik.
 * Muncul setelah 150 ms (muat cepat tidak perlu ditandai) lalu "menyelesaikan
 * diri" ke 100% dan memudar.
 */
export function TopProgress() {
  const loadingFirst = useIsFetching({ predicate: q => q.state.data === undefined && q.state.fetchStatus === 'fetching' });
  const { pathname } = useLocation();
  const [phase, setPhase] = useState<'idle' | 'run' | 'done'>('idle');
  const timers = useRef<number[]>([]);
  const navTick = useRef(false);

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  // Pindah halaman = satu "denyut" singkat walau datanya sudah di cache
  useEffect(() => {
    if (!navTick.current) { navTick.current = true; return; }
    clear();
    setPhase('run');
    timers.current.push(window.setTimeout(() => setPhase('done'), 280));
    timers.current.push(window.setTimeout(() => setPhase('idle'), 700));
  }, [pathname]);

  useEffect(() => {
    if (loadingFirst > 0) {
      clear();
      timers.current.push(window.setTimeout(() => setPhase('run'), 150));
    } else {
      setPhase(p => {
        if (p !== 'run') return p;
        clear();
        timers.current.push(window.setTimeout(() => setPhase('idle'), 420));
        return 'done';
      });
    }
  }, [loadingFirst]);

  useEffect(() => clear, []);

  return <div className="top-progress" data-phase={phase} aria-hidden="true" />;
}
