import { useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { initialSync, startSync, stopSync } from '@/lib/sync';

export function useAuthInit() {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      console.log('[Auth] ℹ️ Supabase not configured');
      setLoading(false);
      return;
    }

    console.log('[Auth] 🔍 Checking existing session...');

    // Single source of truth: onAuthStateChange fires immediately with the
    // current session (INITIAL_SESSION event), so we don't need getSession().
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        console.log(`[Auth] ✅ ${event} — ${session.user.email}`);
        setUser(session.user);
        setLoading(false);
        initialSync(session.user.id).catch(console.error);
        startSync();
      } else {
        console.log(`[Auth] 🚪 ${event} — signed out`);
        setUser(null);
        setLoading(false);
        stopSync();
      }
    });

    return () => subscription.unsubscribe();
  }, [setUser, setLoading]);
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
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function resetPassword(email: string) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}
