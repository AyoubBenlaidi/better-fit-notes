import { useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { getSettings, seedLibrary, getMuscleGroups } from '@/lib/api';

export function useAuthInit() {
  const { setUser, setLoading } = useAuthStore();
  const { updateSettings } = useSettingsStore();

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        console.log(`[Auth] ✅ ${event} — ${session.user.email}`);
        setUser(session.user);
        setLoading(false);

        // Load or seed user data
        const userId = session.user.id;
        try {
          const [settings, muscleGroups] = await Promise.all([
            getSettings(userId),
            getMuscleGroups(userId),
          ]);

          // Apply settings from Supabase if they exist
          if (settings) updateSettings(settings);

          // First login: seed the exercise library
          if (muscleGroups.length === 0) {
            console.log('[Auth] 🌱 First login — seeding library…');
            await seedLibrary(userId);
            // Re-fetch settings after seed
            const seeded = await getSettings(userId);
            if (seeded) updateSettings(seeded);
          }
        } catch (err) {
          console.error('[Auth] ❌ Post-login setup failed', err);
        }
      } else {
        console.log(`[Auth] 🚪 ${event} — signed out`);
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [setUser, setLoading, updateSettings]);
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}

export async function signInWithMagicLink(email: string) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function resetPassword(email: string) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}
