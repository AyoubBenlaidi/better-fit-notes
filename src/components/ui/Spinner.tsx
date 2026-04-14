import { clsx } from 'clsx';
import { createPortal } from 'react-dom';

type SpinnerVariant = 'default' | 'overlay' | 'inline';
type SpinnerSize = 'sm' | 'md' | 'lg';

interface SpinnerProps {
  /** Visual style variant */
  variant?: SpinnerVariant;
  /** Size of the spinner */
  size?: SpinnerSize;
  /** Optional label/message below the spinner */
  label?: string;
  /** Custom className for container */
  className?: string;
}

const sizeClasses: Record<SpinnerSize, { spinner: string; label: string }> = {
  sm: { spinner: 'w-6 h-6', label: 'text-xs' },
  md: { spinner: 'w-10 h-10', label: 'text-sm' },
  lg: { spinner: 'w-14 h-14', label: 'text-base' },
};

/**
 * Spinner component for loading states
 *
 * @example
 * // Inline spinner in a button
 * <Spinner variant="inline" size="sm" />
 *
 * @example
 * // Overlay spinner for long operations
 * {isLoading && <Spinner variant="overlay" label="Copying session..." />}
 *
 * @example
 * // Default spinner with label
 * <Spinner size="md" label="Loading analytics..." />
 */
export function Spinner({ variant = 'default', size = 'md', label, className }: SpinnerProps) {
  const sizeConfig = sizeClasses[size];

  // Inline spinner - just the rotating circle
  if (variant === 'inline') {
    return (
      <div className={clsx(sizeConfig.spinner, 'animate-spin', className)}>
        <svg
          className="w-full h-full text-accent"
          fill="none"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </div>
    );
  }

  // Overlay spinner - full viewport overlay with centered content via portal
  if (variant === 'overlay') {
    return createPortal(
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-xs animate-fade-in">
        <div className="flex flex-col items-center gap-3 bg-surface-card rounded-2xl px-6 py-8 shadow-2xl">
          <div className={clsx(sizeConfig.spinner, 'animate-spin')}>
            <svg
              className="w-full h-full text-accent"
              fill="none"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
          {label && (
            <p className={clsx(sizeConfig.label, 'font-medium text-text-primary text-center max-w-xs')}>
              {label}
            </p>
          )}
        </div>
      </div>,
      document.body
    );
  }

  // Default - centered column layout with optional label
  return (
    <div className={clsx('flex flex-col items-center gap-3', className)}>
      <div className={clsx(sizeConfig.spinner, 'animate-spin')}>
        <svg
          className="w-full h-full text-accent"
          fill="none"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </div>
      {label && (
        <p className={clsx(sizeConfig.label, 'font-medium text-text-primary text-center')}>
          {label}
        </p>
      )}
    </div>
  );
}
