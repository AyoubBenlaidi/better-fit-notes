import { useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { getSettings, seedLibrary, getMuscleGroups } from '@/lib/api';

async function setupUserData(userId: string, updateSettings: (p: Partial<any>) => void) {
  const [settings, muscleGroups] = await Promise.all([
    getSettings(userId),
    getMuscleGroups(userId),
  ]);
  if (settings) updateSettings(settings);
  if (muscleGroups.length === 0) {
    console.log('[Auth] 🌱 First login — seeding library…');
    await seedLibrary(userId);
    const seeded = await getSettings(userId);
    if (seeded) updateSettings(seeded);
  }
}

export function useAuthInit() {
  const { setUser, setLoading } = useAuthStore();
  const { updateSettings } = useSettingsStore();

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setUser(null);
      setLoading(false);
      return;
    }

    // Resolve loading immediately from localStorage (no network required).
    // If the access token is expired, Supabase may make one refresh call here,
    // but it will always resolve (session or null) rather than hanging forever.
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error) console.warn('[Auth] getSession error:', error.message);

      const user = session?.user ?? null;
      setUser(user);
      setLoading(false);

      if (user) {
        try { await setupUserData(user.id, updateSettings); }
        catch (err) { console.error('[Auth] ❌ Post-init setup failed', err); }
      }
    });

    // Keep listening for sign-in / sign-out / token refresh events.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        console.log(`[Auth] ✅ SIGNED_IN — ${session.user.email}`);
        setUser(session.user);
        setLoading(false);
        try { await setupUserData(session.user.id, updateSettings); }
        catch (err) { console.error('[Auth] ❌ Post-login setup failed', err); }
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        setUser(session.user);
      } else if (event === 'SIGNED_OUT') {
        console.log('[Auth] 🚪 Signed out');
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
  console.log('[Auth] 📝 Signing up:', email);
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;

  // Send welcome email asynchronously (don't fail signup if email fails)
  console.log('[Auth] 📧 Triggering welcome email for:', email);
  try {
    const response = await fetch('/api/auth/send-welcome-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name: email.split('@')[0] }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.warn('[Auth] ⚠️ Email API error:', response.status, errorData);
    } else {
      const successData = await response.json();
      console.log('[Auth] ✅ Welcome email sent:', successData);
    }
  } catch (err) {
    console.warn('[Auth] ⚠️ Failed to send welcome email:', err);
    // Don't throw — signup should succeed even if email fails
  }
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
  
  // Clear Supabase session
  await supabase.auth.signOut();
  
  // Clear local storage leftovers from previous app versions.
  try {
    const keys = Object.keys(localStorage).filter(
      (key) =>
        key.startsWith('sb-') ||
        key === 'auth' ||
        key === 'supabase' ||
        key === 'bfn-auth-store' ||
        key === 'bfn-query-cache' ||
        key === 'bfn-session-store' ||
        key === 'bfn-settings',
    );

    keys.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.warn('[Auth] Failed to clear local storage during sign out', error);
  }
}

export async function resetPassword(email: string) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}
