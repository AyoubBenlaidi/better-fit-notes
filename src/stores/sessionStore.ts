import { create } from 'zustand';

interface SessionStoreState {
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  restTimerSeconds: number;
  restTimerActive: boolean;
  startRestTimer: (seconds: number) => void;
  stopRestTimer: () => void;
  reset: () => void;
}

export const useSessionStore = create<SessionStoreState>()((set) => ({
  activeSessionId: null,
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  restTimerSeconds: 90,
  restTimerActive: false,
  startRestTimer: (seconds) => set({ restTimerSeconds: seconds, restTimerActive: true }),
  stopRestTimer: () => set({ restTimerActive: false }),
  reset: () =>
    set({
      activeSessionId: null,
      restTimerSeconds: 90,
      restTimerActive: false,
    }),
}));
