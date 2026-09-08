import type { ReactNode } from 'react';
import { Wifi, WifiOff, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';

export type OnuStatus = 'online' | 'offline' | 'los' | 'dyinggasp';

const STATUS_CONFIG: Record<OnuStatus, { color: string; icon: ReactNode; label: string }> = {
  online: { color: 'bg-success/15 text-success border-success/20', icon: <Wifi size={13} />, label: 'Online' },
  offline: { color: 'bg-offline/15 text-tx3 border-offline/20', icon: <WifiOff size={13} />, label: 'Offline' },
  los: { color: 'bg-danger/15 text-danger border-danger/20', icon: <XCircle size={13} />, label: 'LOS' },
  dyinggasp: { color: 'bg-warning/15 text-warning border-warning/20', icon: <AlertTriangle size={13} />, label: 'DyingGasp' },
};

/**
 * Semantic ONU/OLT connectivity status badge — mirrors the local StatusBadge
 * already used in AllOnus.tsx so pages can share one implementation instead
 * of each redefining the same status->color/icon/label mapping.
 */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const c = STATUS_CONFIG[status as OnuStatus] || STATUS_CONFIG.offline;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border', c.color, className)}>
      {c.icon} {c.label}
    </span>
  );
}
