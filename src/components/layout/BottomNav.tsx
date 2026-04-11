import { NavLink } from 'react-router-dom';
import { Calendar, Dumbbell, BarChart2, Settings } from 'lucide-react';
import { clsx } from 'clsx';

const NAV_ITEMS = [
  { to: '/', icon: Calendar, label: 'Calendar', end: true },
  { to: '/exercises', icon: Dumbbell, label: 'Exercises', end: false },
  { to: '/analytics', icon: BarChart2, label: 'Analytics', end: false },
  { to: '/settings', icon: Settings, label: 'Settings', end: false },
];

export function BottomNav() {
  return (
    <nav
      className={clsx(
        'fixed bottom-0 left-0 right-0 z-40 safe-bottom',
        'bg-nav',
        'border-t border-border',
      )}
    >
      <div className="flex items-center justify-around h-16 px-2">
        {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className="flex-1 flex items-center justify-center py-1"
          >
            {({ isActive }) => (
              <div
                className={clsx(
                  'flex flex-col items-center gap-1 px-4 py-1.5 rounded-2xl',
                  'transition-all duration-150',
                  isActive
                    ? 'bg-accent/12 text-accent'
                    : 'text-text-secondary hover:text-text-primary active:bg-surface-raised',
                )}
              >
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.25 : 1.5}
                  className="transition-all duration-150"
                />
                <span
                  className={clsx(
                    'text-[10px] font-semibold tracking-wide leading-none transition-all duration-150',
                    isActive ? 'opacity-100' : 'opacity-70',
                  )}
                >
                  {label}
                </span>
              </div>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
