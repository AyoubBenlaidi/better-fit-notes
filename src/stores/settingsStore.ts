import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserSettings } from '@/types/entities';

interface SettingsState {
  settings: UserSettings;
  updateSettings: (partial: Partial<UserSettings>) => void;
}

const defaultSettings: UserSettings = {
  id: 'user-settings',
  weightUnit: 'kg',
  dateFormat: 'DD/MM/YYYY',
  theme: 'dark',
  firstDayOfWeek: 1,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      updateSettings: (partial) =>
        set((state) => ({ settings: { ...state.settings, ...partial } })),
    }),
    { name: 'bfn-settings' }
  )
);

export function convertWeight(value: number, from: 'kg' | 'lbs', to: 'kg' | 'lbs'): number {
  if (from === to) return value;
  return from === 'kg' ? value * 2.20462 : value / 2.20462;
}

export function displayWeight(kg: number, unit: 'kg' | 'lbs'): string {
  const value = unit === 'kg' ? kg : convertWeight(kg, 'kg', 'lbs');
  return `${Math.round(value * 4) / 4}${unit}`;
}
