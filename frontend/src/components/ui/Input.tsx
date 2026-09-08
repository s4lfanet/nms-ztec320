import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  error?: string;
  helperText?: string;
  icon?: ReactNode;
  /** Trailing slot inside the field, e.g. a show/hide password toggle. */
  suffix?: ReactNode;
  wrapperClassName?: string;
}

/**
 * Wraps .input-field (index.css) with label/helper/error slots so form
 * validation messages render next to the field instead of only via toast
 * (per FORM UX guidance — error state near the related field).
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, helperText, icon, suffix, className, wrapperClassName, id, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <div className={cn('w-full', wrapperClassName)}>
      {label && <label htmlFor={inputId} className="label-sm block">{label}</label>}
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-tx3 pointer-events-none">{icon}</span>}
        <input
          ref={ref}
          id={inputId}
          className={cn('input-field', icon && 'pl-9', suffix && 'pr-10', error && 'border-danger', className)}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
          {...props}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-tx3">{suffix}</span>}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="text-xs text-danger mt-1">{error}</p>
      ) : helperText ? (
        <p id={`${inputId}-helper`} className="text-xs text-tx3 mt-1">{helperText}</p>
      ) : null}
    </div>
  );
});
