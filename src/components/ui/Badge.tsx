import { type HTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  color?: string; // hex color for muscle group badges
  variant?: 'filled' | 'outline' | 'dot';
}

export function Badge({ color, variant = 'filled', className, children, style, ...props }: BadgeProps) {
  // Athletic Precision design: low opacity background + full opacity text + dot
  const colorStyle = color
    ? {
        backgroundColor: color + '1A', // 10% opacity
        color: color,
        borderColor: color + '33', // 20% opacity border
      }
    : {};

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors duration-100',
        !color && variant === 'filled' && 'bg-surface-raised text-text-secondary border-border',
        !color && variant === 'outline' && 'border-border text-text-secondary',
        variant === 'dot' && 'h-2 w-2 p-0',
        className
      )}
      style={{ ...colorStyle, ...style }}
      {...props}
    >
      {color && (
        <span
          className="h-2 w-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
      )}
      {variant !== 'dot' && children}
    </span>
  );
}

