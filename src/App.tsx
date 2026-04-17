import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, focusManager, onlineManager, useIsFetching } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { CalendarPage } from '@/pages/CalendarPage';
import { ExercisesPage } from '@/pages/ExercisesPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SessionPage } from '@/pages/SessionPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { TemplatesPage } from '@/pages/TemplatesPage';
import { AuthPage } from '@/pages/AuthPage';
import { useAuthInit } from '@/domains/auth/hooks/useAuth';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAuthStore } from '@/stores/authStore';
import { Spinner } from '@/components/ui/Spinner';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Server state is intentionally memory-only. After a full reload, queries
      // must rebuild from the network instead of reviving a persisted snapshot.
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 60 * 24, // Keep cache for 24h
      networkMode: 'always',
      retry: 1,
    },
    mutations: {
      networkMode: 'always',
      retry: 0,
    },
  },
});

function AppLifecycleRecoveryManager() {
  useEffect(() => {
    function blurActiveElement() {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement) {
        activeElement.blur();
      }
    }

    function cleanupTransientUi() {
      document.body.style.overflow = '';
      blurActiveElement();
      window.dispatchEvent(new Event('app-background'));
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        cleanupTransientUi();
        return;
      }

      document.body.style.overflow = '';
    }

    function handlePageHide() {
      cleanupTransientUi();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  return null;
}

function QueryLifecycleManager() {
  useEffect(() => {
    function syncOnlineState() {
      onlineManager.setOnline(window.navigator.onLine);
    }

    function syncFocusState() {
      focusManager.setFocused(document.visibilityState === 'visible');
    }

    async function recoverInteractiveState() {
      syncOnlineState();
      syncFocusState();

      if (document.visibilityState !== 'visible') {
        return;
      }

      // When the app comes back to the foreground, replay any paused work and
      // refresh active screens so they can rebuild from fresh server state.
      await queryClient.resumePausedMutations();
      await queryClient.refetchQueries({ type: 'active' });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void recoverInteractiveState();
        return;
      }

      syncFocusState();
    }

    function handleWindowFocus() {
      void recoverInteractiveState();
    }

    function handleOnline() {
      void recoverInteractiveState();
    }

    function handleOffline() {
      syncOnlineState();
    }

    syncOnlineState();
    syncFocusState();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handleWindowFocus);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handleWindowFocus);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return null;
}

function RefreshInteractionGuard() {
  const { user, isLoading, isRefreshLockActive, setRefreshLock } = useAuthStore();
  const isFetching = useIsFetching();
  const [isVisible, setIsVisible] = useState(false);
  const lockStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRefreshLockActive || !user || isLoading) {
      setIsVisible(false);
      lockStartedAtRef.current = null;
      return;
    }

    if (lockStartedAtRef.current === null) {
      lockStartedAtRef.current = performance.now();
    }

    if (isFetching > 0) {
      setIsVisible(true);
      return;
    }

    const elapsed = performance.now() - lockStartedAtRef.current;
    const remaining = Math.max(0, 220 - elapsed);
    const timeoutId = window.setTimeout(() => {
      setIsVisible(false);
      setRefreshLock(false);
      lockStartedAtRef.current = null;
    }, remaining);

    return () => window.clearTimeout(timeoutId);
  }, [isFetching, isLoading, isRefreshLockActive, setRefreshLock, user]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-[55] bg-surface-base/6 backdrop-blur-[1px]">
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-safe pt-3">
        <div className="flex items-center gap-2 rounded-full border border-border/70 bg-surface-card/92 px-3 py-2 shadow-card">
          <Spinner variant="inline" size="sm" />
          <span className="text-xs font-medium text-text-secondary">Mise a jour…</span>
        </div>
      </div>
    </div>
  );
}

function applyTheme(theme: 'dark' | 'light' | 'system') {
  const root = document.documentElement;
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  root.classList.toggle('dark', isDark);
  root.classList.toggle('light', !isDark);
}

function ThemeManager() {
  const { settings } = useSettingsStore();

  useEffect(() => {
    applyTheme(settings.theme);

    if (settings.theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [settings.theme]);

  return null;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuthStore();

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-dvh bg-surface-base">
      <div className="h-2 w-2 rounded-full bg-accent animate-bounce" />
    </div>
  );
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  useAuthInit();

  return (
    <Routes>
      {/* Pages with bottom nav — protected */}
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/" element={<CalendarPage />} />
        <Route path="/exercises" element={<ExercisesPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
      </Route>

      {/* Full-screen pages — session is protected */}
      <Route path="/session/:id" element={<RequireAuth><SessionPage /></RequireAuth>} />
      <Route path="/auth" element={<AuthPage />} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function AppContent() {
  return (
    <BrowserRouter>
      <AppLifecycleRecoveryManager />
      <QueryLifecycleManager />
      <RefreshInteractionGuard />
      <ThemeManager />
      <AppRoutes />
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
