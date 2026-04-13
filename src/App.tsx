import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
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
import { useStoresHydrated } from '@/lib/useHydrateStore';
import { isSupabaseConfigured } from '@/lib/supabase';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 60 * 24, // Keep cache for 24h
      retry: 1,
    },
  },
});

const localStoragePersister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'bfn-query-cache',
});

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

  if (!isSupabaseConfigured) return <>{children}</>;
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
  const storesHydrated = useStoresHydrated();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  // Force refetch all main queries after stores are hydrated AND user is available
  useEffect(() => {
    if (storesHydrated && user) {
      console.log('[App] Rehydrated + user available, refetching all queries...');
      // Refetch all queries to ensure fresh data after hydration
      queryClient.refetchQueries();
    }
  }, [storesHydrated, user?.id, queryClient]);

  // Wait for stores to rehydrate before rendering routes
  if (!storesHydrated) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-surface-base">
        <div className="h-2 w-2 rounded-full bg-accent animate-bounce" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <ThemeManager />
      <AppRoutes />
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: localStoragePersister,
        maxAge: 1000 * 60 * 60 * 24, // Reuse cache for 24h
      }}
    >
      <AppContent />
    </PersistQueryClientProvider>
  );
}
