/** Format angka untuk halaman perangkat SNMP. */

export function fmtBps(v: number | null | undefined): string {
  if (v == null) return '—';
  const units = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'];
  let i = 0;
  let n = v;
  while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
  return `${n >= 100 || i === 0 ? n.toFixed(0) : n.toFixed(1)} ${units[i]}`;
}

export function fmtSpeed(mbps: number | null | undefined): string {
  if (!mbps) return '—';
  if (mbps >= 1000) return `${mbps % 1000 === 0 ? mbps / 1000 : (mbps / 1000).toFixed(1)}G`;
  return `${mbps}M`;
}

export function fmtUptime(s: number | null | undefined, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (s == null) return '—';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return t('dev.uptimeDH', { d, h });
  if (h > 0) return t('dev.uptimeHM', { h, m });
  return t('dev.uptimeM', { m });
}

export const STATUS_DOT: Record<string, string> = {
  up: 'bg-success',
  down: 'bg-danger',
  warn: 'bg-warning',
  unknown: 'bg-tx3',
};
