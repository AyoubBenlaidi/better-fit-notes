import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { getSettings, seedLibrary, getMuscleGroups } from '@/lib/api';

// These keys represent legacy app-managed auth/cache state. If one of them
// becomes invalid, we clear all of them together to avoid half-hydrated clients.
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
    // Supabase owns its session keys, but when a stored session is invalid we
    // must clear both Supabase keys and legacy Better Fit Notes keys together.
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
  const wasHiddenRef = useRef(false);
  // Prevents duplicate setupUserData() calls across StrictMode double-invoke
  // and concurrent INITIAL_SESSION + SIGNED_IN events for the same user.
  const setupDoneForRef = useRef<string | null>(null);

  const recoverSession = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || syncInFlightRef.current) return;

    const currentUser = useAuthStore.getState().user;
    if (!currentUser || document.visibilityState !== 'visible') return;

    syncInFlightRef.current = true;

    try {
      const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();

      if (refreshError) {
        // Network/transient error — keep the user logged in and refetch optimistically.
        // A genuine expiry fires SIGNED_OUT via onAuthStateChange which handles logout.
        console.warn('[Auth] refreshSession error on recovery (kept session):', refreshError.message);
        await queryClient.refetchQueries({ type: 'active' });
        return;
      }

      if (!refreshedData.session) {
        // Refresh returned no session without error = refresh_token revoked.
        // onAuthStateChange already fired SIGNED_OUT and cleared state.
        return;
      }

      setUser(refreshedData.session.user);
      await queryClient.refetchQueries({ type: 'active' });
    } finally {
      syncInFlightRef.current = false;
    }
  }, [queryClient, setUser]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setUser(null);
      setLoading(false);
      return;
    }

    function handleOnline() {
      if (document.visibilityState !== 'visible') return;
      void recoverSession();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        wasHiddenRef.current = true;
        return;
      }

      if (!wasHiddenRef.current) return;

      wasHiddenRef.current = false;
      void recoverSession();
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[Auth] onAuthStateChange', event, { hasSession: !!session, hasUser: !!session?.user });

      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        if (session?.user) {
          setUser(session.user);
          setLoading(false);
          if (setupDoneForRef.current !== session.user.id) {
            setupDoneForRef.current = session.user.id;
            setupUserData(session.user.id, updateSettings).catch((err) =>
              console.error('[Auth] ❌ Post-login setup failed', err),
            );
          }
        } else {
          setUser(null);
          queryClient.clear();
          setLoading(false);
        }
        return;
      }

      if (event === 'TOKEN_REFRESHED' && session?.user) {
        setUser(session.user);
        return;
      }

      if (event === 'SIGNED_OUT') {
        console.log('[Auth] 🚪 Signed out');
        setupDoneForRef.current = null;
        clearAuthBrowserStorage();
        queryClient.clear();
        setUser(null);
        setLoading(false);
      }
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [queryClient, recoverSession, setLoading, setUser, updateSettings]);
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
