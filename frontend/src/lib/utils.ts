import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
