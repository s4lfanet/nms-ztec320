import type { ReactNode } from 'react';
import { Wifi, WifiOff, XCircle, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

export type OnuStatus = 'online' | 'offline' | 'los' | 'dyinggasp';

const STATUS_CONFIG: Record<OnuStatus, { color: string; icon: ReactNode; labelKey: string }> = {
  online: { color: 'bg-success/15 text-success border-success/20', icon: <Wifi size={13} />, labelKey: 'status.online' },
  offline: { color: 'bg-offline/15 text-tx3 border-offline/20', icon: <WifiOff size={13} />, labelKey: 'status.offline' },
  los: { color: 'bg-danger/15 text-danger border-danger/20', icon: <XCircle size={13} />, labelKey: 'status.los' },
  dyinggasp: { color: 'bg-warning/15 text-warning border-warning/20', icon: <AlertTriangle size={13} />, labelKey: 'status.dyinggasp' },
};

/**
 * Semantic ONU/OLT connectivity status badge — mirrors the local StatusBadge
 * already used in AllOnus.tsx so pages can share one implementation instead
 * of each redefining the same status->color/icon/label mapping.
 */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const { t } = useTranslation();
  const c = STATUS_CONFIG[status as OnuStatus] || STATUS_CONFIG.offline;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border', c.color, className)}>
      {c.icon} {t(c.labelKey)}
    </span>
  );
}
