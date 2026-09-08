import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning' | 'accent' | 'icon';

const variantClass: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-cancel border border-brd',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  warning: 'btn-warning',
  accent: 'btn-accent',
  icon: 'p-2 rounded-lg text-tx2 hover:text-tx1 hover:bg-glass transition-colors active:scale-95',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: ReactNode;
}

/**
 * Wraps the existing .btn-* CSS classes (see index.css) so button usage is
 * consistent across pages instead of each page re-implementing hover/active/
 * disabled/loading states inline.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', loading = false, icon, disabled, className, children, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(variantClass[variant], 'inline-flex items-center justify-center gap-2', className)}
      {...props}
    >
      {loading ? <Spinner size="sm" /> : icon}
      {children}
    </button>
  );
});
