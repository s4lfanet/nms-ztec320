import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import i18n from '../i18n';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPower(value: number | null): string {
  if (value === null || value === undefined) return 'N/A';
  return `${value.toFixed(2)} dBm`;
}

export function powerColor(value: number | null): string {
  if (value === null) return 'text-tx3';
  if (value >= -26) return 'text-success';
  if (value >= -28) return 'text-warning';
  return 'text-danger';
}

export function powerBg(value: number | null): string {
  if (value === null) return 'bg-gray-500/20';
  if (value >= -26) return 'bg-success/15';
  if (value >= -28) return 'bg-warning/15';
  return 'bg-danger/15';
}

export function statusColor(status: string): string {
  switch (status) {
    case 'online': return 'text-online';
    case 'offline': return 'text-offline';
    case 'los': return 'text-los';
    case 'dyinggasp': return 'text-dyinggasp';
    default: return 'text-tx3';
  }
}

// System timezone — fetched from branding API, defaults to Asia/Jakarta
let _systemTimezone = 'Asia/Jakarta';

export function setSystemTimezone(tz: string) {
  if (tz) _systemTimezone = tz;
}

export function getSystemTimezone(): string {
  return _systemTimezone;
}

// Teks & format tanggal mengikuti bahasa yang dipilih pengguna (id/en)
const locale = () => (i18n.language === 'en' ? 'en-GB' : 'id-ID');

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return i18n.t('time.never');
  return new Date(dateStr).toLocaleString(locale(), {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: _systemTimezone,
  });
}

export function timeAgo(dateStr: string | null): string {
  if (!dateStr) return i18n.t('time.never');
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return i18n.t('time.justNow');
  if (mins < 60) return i18n.t('time.minsAgo', { n: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return i18n.t('time.hoursAgo', { n: hrs });
  const days = Math.floor(hrs / 24);
  return i18n.t('time.daysAgo', { n: days });
}

/**
 * Format serial number for display (ZTE only — returns as-is).
 */
export function formatSn(sn: string): string {
  return sn || '-';
}
