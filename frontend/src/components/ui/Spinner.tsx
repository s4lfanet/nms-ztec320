import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return <div className={cn('spinner', size === 'lg' && 'spinner-lg', size === 'sm' && 'spinner-sm', className)} />;
}

/* ─── LoadingOverlay (full card / section) ─── */
export function LoadingOverlay({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 size={28} className="text-accent animate-spin" />
      {label && <p className="text-tx3 text-sm mt-3">{label}</p>}
    </div>
  );
}
