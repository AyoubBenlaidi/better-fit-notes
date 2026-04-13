import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';

/**
 * Hook that waits for all Zustand stores to be rehydrated from localStorage.
 * This ensures state is available before React Query queries start executing.
 */
export function useStoresHydrated() {
  const authHydrated = useAuthStore((state) => state._hydrated);
  const settingsHydrated = useSettingsStore((state) => state._hydrated);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (authHydrated && settingsHydrated) {
      setIsHydrated(true);
    }
  }, [authHydrated, settingsHydrated]);

  return isHydrated;
}
