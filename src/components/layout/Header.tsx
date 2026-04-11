import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { clsx } from 'clsx';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  right?: ReactNode;
  transparent?: boolean;
  className?: string;
}

export function Header({ title, subtitle, showBack, right, transparent, className }: HeaderProps) {
  const navigate = useNavigate();

  return (
    <header
      className={clsx(
        'sticky top-0 z-30 flex items-center gap-3 px-4 h-14 safe-top flex-shrink-0',
        transparent
          ? 'bg-transparent'
          : 'bg-nav border-b border-border',
        className,
      )}
    >
      {showBack && (
        <button
          onClick={() => navigate(-1)}
          className="h-9 w-9 flex items-center justify-center rounded-xl text-text-secondary active:bg-surface-raised transition-colors duration-fast -ml-1 flex-shrink-0"
        >
          <ArrowLeft size={20} strokeWidth={1.75} />
        </button>
      )}

      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold text-text-primary truncate leading-tight">{title}</h1>
        {subtitle && (
          <p className="text-xs text-text-secondary truncate leading-tight mt-0.5">{subtitle}</p>
        )}
      </div>

      {right && (
        <div className="flex items-center gap-2 flex-shrink-0">{right}</div>
      )}
    </header>
  );
}
