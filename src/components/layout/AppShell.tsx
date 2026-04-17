import { type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { ToastContainer } from '@/components/ui/Toast';

interface AppShellProps {
  children?: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="h-dvh bg-surface-base text-text-primary flex flex-col overflow-hidden">
      <main className="flex-1 pb-16 overflow-y-auto overscroll-none">
        {children ?? <Outlet />}
      </main>
      <BottomNav />
      <ToastContainer />
    </div>
  );
}
