import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SessionStoreState {
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  restTimerSeconds: number;
  restTimerActive: boolean;
  startRestTimer: (seconds: number) => void;
  stopRestTimer: () => void;
  _hydrated: boolean;
}

export const useSessionStore = create<SessionStoreState>()(
  persist(
    (set) => ({
      activeSessionId: null,
      setActiveSessionId: (id) => set({ activeSessionId: id }),
      restTimerSeconds: 90,
      restTimerActive: false,
      startRestTimer: (seconds) => set({ restTimerSeconds: seconds, restTimerActive: true }),
      stopRestTimer: () => set({ restTimerActive: false }),
      _hydrated: false,
    }),
    {
      name: 'bfn-session-store',
      partialize: (state) => ({ activeSessionId: state.activeSessionId, restTimerSeconds: state.restTimerSeconds }),
      onRehydrateStorage: () => (state) => {
        if (state) state._hydrated = true;
      },
    }
  )
);
