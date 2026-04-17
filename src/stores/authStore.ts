import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isRefreshLockActive: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setRefreshLock: (locked: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isLoading: true,
  isRefreshLockActive: false,
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
  setRefreshLock: (isRefreshLockActive) => set({ isRefreshLockActive }),
  reset: () => set({ user: null, isLoading: true, isRefreshLockActive: false }),
}));
