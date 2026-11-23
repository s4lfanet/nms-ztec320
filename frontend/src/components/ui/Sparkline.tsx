import { useId } from 'react';
import { cn } from '../../lib/utils';

/**
 * Garis tren kecil (SVG murni, tanpa library). `values` urut lama → baru.
 * Titik terakhir diberi penanda; area di bawah garis diwarnai tipis.
 */
export function Sparkline({ values, height = 40, className, tone = 'accent', label }: {
  values: number[]; height?: number; className?: string;
  tone?: 'accent' | 'success' | 'warning' | 'danger'; label?: string;
}) {
  const gid = useId().replace(/:/g, '');
  const w = 240;
  if (values.length < 2) return <div className={cn('sparkline-empty', className)} style={{ height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * w,
    pad + (1 - (v - min) / span) * (height - pad * 2),
  ]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w},${height} L0,${height} Z`;
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg className={cn('sparkline', `sparkline-${tone}`, className)} viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none" role="img" aria-label={label} style={{ height }}>
      <defs>
        <linearGradient id={`sg${gid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg${gid})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.75" vectorEffect="non-scaling-stroke"
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="2.6" fill="currentColor" vectorEffect="non-scaling-stroke" className="sparkline-head" />
    </svg>
  );
}
