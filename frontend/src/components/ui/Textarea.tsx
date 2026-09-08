import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  wrapperClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, helperText, className, wrapperClassName, id, ...props },
  ref,
) {
  const autoId = useId();
  const textareaId = id || autoId;
  return (
    <div className={cn('w-full', wrapperClassName)}>
      {label && <label htmlFor={textareaId} className="label-sm block">{label}</label>}
      <textarea
        ref={ref}
        id={textareaId}
        className={cn('input-field', 'h-auto min-h-[80px] py-2.5', error && 'border-danger', className)}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${textareaId}-error` : helperText ? `${textareaId}-helper` : undefined}
        {...props}
      />
      {error ? (
        <p id={`${textareaId}-error`} className="text-xs text-danger mt-1">{error}</p>
      ) : helperText ? (
        <p id={`${textareaId}-helper`} className="text-xs text-tx3 mt-1">{helperText}</p>
      ) : null}
    </div>
  );
});
