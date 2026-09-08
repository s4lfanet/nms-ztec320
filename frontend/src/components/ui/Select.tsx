import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  error?: string;
  helperText?: string;
  options?: SelectOption[];
  children?: ReactNode;
  wrapperClassName?: string;
}

/** Wraps the themed native <select> (index.css) with label/helper/error slots. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, helperText, options, children, className, wrapperClassName, id, ...props },
  ref,
) {
  const autoId = useId();
  const selectId = id || autoId;
  return (
    <div className={cn('w-full', wrapperClassName)}>
      {label && <label htmlFor={selectId} className="label-sm block">{label}</label>}
      <select
        ref={ref}
        id={selectId}
        className={cn('input-field', error && 'border-danger', className)}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${selectId}-error` : helperText ? `${selectId}-helper` : undefined}
        {...props}
      >
        {options
          ? options.map(opt => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>
            ))
          : children}
      </select>
      {error ? (
        <p id={`${selectId}-error`} className="text-xs text-danger mt-1">{error}</p>
      ) : helperText ? (
        <p id={`${selectId}-helper`} className="text-xs text-tx3 mt-1">{helperText}</p>
      ) : null}
    </div>
  );
});
