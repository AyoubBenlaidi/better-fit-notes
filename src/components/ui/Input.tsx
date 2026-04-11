import { type InputHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label htmlFor={inputId} className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            'h-11 w-full rounded-2xl bg-surface-raised border px-4 py-2',
            'font-sans text-sm text-text-primary placeholder:text-text-muted',
            'focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60',
            'transition-all duration-fast',
            error ? 'border-danger/50' : 'border-border/60',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        {hint && !error && <p className="text-xs text-text-muted">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

// Numeric input optimized for gym data entry - uses monospace font
interface NumericInputProps extends Omit<InputProps, 'type' | 'inputMode'> {
  decimals?: boolean;
}

export const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(
  ({ decimals = true, className, ...props }, ref) => {
    return (
      <Input
        ref={ref}
        type="number"
        inputMode={decimals ? 'decimal' : 'numeric'}
        className={clsx('font-mono font-semibold text-center tabular-nums text-base', className)}
        {...props}
      />
    );
  }
);

NumericInput.displayName = 'NumericInput';
