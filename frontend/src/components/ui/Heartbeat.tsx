import { cn } from '../../lib/utils';

export interface HeartbeatBeat {
  /** 0 tenang · 1 sedikit · 2 banyak · 3 parah · -1 tanpa data */
  level: number;
  title?: string;
}

/**
 * Strip riwayat status (gaya Uptime Kuma): satu batang per periode, warna
 * menurut tingkat gangguan. Terbaru di kanan.
 */
export function Heartbeat({ beats, className, label }: { beats: HeartbeatBeat[]; className?: string; label?: string }) {
  return (
    <div className={cn('heartbeat', className)} role="img" aria-label={label}>
      {beats.map((b, i) => (
        <span key={i} className="heartbeat-beat" data-level={b.level} title={b.title} />
      ))}
    </div>
  );
}
