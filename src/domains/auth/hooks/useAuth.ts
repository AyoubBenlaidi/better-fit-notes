import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { getSettings, seedLibrary, getMuscleGroups } from '@/lib/api';

const AUTH_STORAGE_KEYS = ['auth', 'supabase', 'bfn-auth-store', 'bfn-query-cache', 'bfn-session-store'];

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

function clearAuthBrowserStorage() {
  try {
    const keys = Object.keys(localStorage).filter(
      (key) => key.startsWith('sb-') || AUTH_STORAGE_KEYS.includes(key),
    );

    keys.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.warn('[Auth] Failed to clear invalid auth storage', error);
  }
}

export function useAuthInit() {
  const { setUser, setLoading } = useAuthStore();
  const { updateSettings } = useSettingsStore();
  const queryClient = useQueryClient();
  const syncInFlightRef = useRef(false);
  const hiddenAtRef = useRef<number | null>(null);

  const syncSession = useCallback(async (options?: { foregroundRecovery?: boolean; refreshQueries?: boolean; forceRefresh?: boolean }) => {
    if (!isSupabaseConfigured || !supabase || syncInFlightRef.current) return;

    syncInFlightRef.current = true;

    // Only show the full-screen loading indicator if we don't have a user yet
    // (first load). During foreground recovery the current page stays visible
    // while auth refreshes silently in the background.
    if (options?.foregroundRecovery && !useAuthStore.getState().user) {
      setLoading(true);
    }

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.warn('[Auth] getSession error:', sessionError.message);
      }

      if (!session) {
        setUser(null);

        if (options?.foregroundRecovery) {
          queryClient.clear();
        }

        return;
      }

      let validatedSession = session;

      if (options?.foregroundRecovery || options?.forceRefresh) {
        const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();

        if (refreshError) {
          console.warn('[Auth] refreshSession error:', refreshError.message);
        } else if (refreshedData.session) {
          validatedSession = refreshedData.session;
        }
      }

      const { data: userData, error: userError } = await supabase.auth.getUser(validatedSession.access_token);
      const user = userData.user ?? null;

      if (userError || !user) {
        console.warn('[Auth] Stored session is no longer valid', userError?.message ?? 'Missing user');
        clearAuthBrowserStorage();
        setUser(null);
        queryClient.clear();
        return;
      }

      setUser(user);

      try {
        await setupUserData(user.id, updateSettings);
      } catch (err) {
        console.error('[Auth] ❌ Post-init setup failed', err);
      }

      if (options?.foregroundRecovery || options?.refreshQueries) {
        await queryClient.cancelQueries();
        await queryClient.invalidateQueries();
        await queryClient.resumePausedMutations();
        await queryClient.refetchQueries({ type: 'active' });
      }
    } finally {
      setLoading(false);
      syncInFlightRef.current = false;
    }
  }, [queryClient, setLoading, setUser, updateSettings]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setUser(null);
      setLoading(false);
      return;
    }

    void syncSession({ forceRefresh: true });

    function recoverFromBackground() {
      if (document.visibilityState !== 'visible') return;

      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;

      if (hiddenAt === null) return;

      console.log('[Auth] Foreground recovery after tab inactivity');
      void syncSession({ foregroundRecovery: true });
    }

    function handleOnline() {
      if (document.visibilityState !== 'visible') return;
      void syncSession({ foregroundRecovery: true });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        return;
      }

      recoverFromBackground();
    }

    // Keep listening for sign-in / sign-out / token refresh events.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        console.log(`[Auth] ✅ SIGNED_IN — ${session.user.email}`);
        setUser(session.user);
        setLoading(false);
        try { await setupUserData(session.user.id, updateSettings); }
        catch (err) { console.error('[Auth] ❌ Post-login setup failed', err); }
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        void syncSession({ refreshQueries: document.visibilityState === 'visible' });
      } else if (event === 'SIGNED_OUT') {
        console.log('[Auth] 🚪 Signed out');
        clearAuthBrowserStorage();
        queryClient.clear();
        setUser(null);
        setLoading(false);
      }
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', recoverFromBackground);
    window.addEventListener('online', handleOnline);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', recoverFromBackground);
      window.removeEventListener('online', handleOnline);
    };
  }, [queryClient, setLoading, setUser, syncSession]);
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
  
  clearAuthBrowserStorage();
}

export async function resetPassword(email: string) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}
