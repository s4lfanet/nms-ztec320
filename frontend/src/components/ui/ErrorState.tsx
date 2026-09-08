import { AlertCircle } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ title = 'Failed to Load', message = 'Terjadi kesalahan. Coba lagi.', onRetry }: ErrorStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon text-danger">
        <AlertCircle size={22} />
      </div>
      <p className="empty-state-title">{title}</p>
      <p className="empty-state-desc">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-accent mt-4">
          Retry
        </button>
      )}
    </div>
  );
}
