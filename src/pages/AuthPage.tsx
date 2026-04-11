import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v4';
import { Dumbbell } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { signIn, signUp, signInWithMagicLink, resetPassword } from '@/domains/auth/hooks/useAuth';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

type AuthMode = 'login' | 'signup' | 'magic' | 'forgot';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const emailSchema = z.object({
  email: z.string().email('Enter a valid email'),
});

type LoginForm = z.infer<typeof loginSchema>;
type EmailForm = z.infer<typeof emailSchema>;

export function AuthPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [mode, setMode] = useState<AuthMode>('login');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  // Redirect when user becomes authenticated
  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const emailForm = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
  });

  if (!isSupabaseConfigured) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh px-6 gap-6">
        <div className="flex flex-col items-center gap-3">
          <div className="h-16 w-16 rounded-2xl bg-accent/20 flex items-center justify-center">
            <Dumbbell size={32} className="text-accent" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Better Fit Notes</h1>
          <p className="text-sm text-text-secondary text-center">
            Auth is disabled — Supabase is not configured. The app works fully offline.
          </p>
        </div>
      </div>
    );
  }

  async function handleLogin(data: LoginForm) {
    try {
      setLoading(true);
      await signIn(data.email, data.password);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(data: LoginForm) {
    try {
      setLoading(true);
      await signUp(data.email, data.password);
      setSuccess('Check your email to confirm your account.');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink(data: EmailForm) {
    try {
      setLoading(true);
      await signInWithMagicLink(data.email);
      setSuccess('Magic link sent! Check your email.');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(data: EmailForm) {
    try {
      setLoading(true);
      await resetPassword(data.email);
      setSuccess('Password reset email sent.');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh px-6 gap-6">
        <div className="bg-success/10 border border-success/30 rounded-2xl p-6 text-center">
          <p className="text-success font-medium">{success}</p>
        </div>
        <Button variant="ghost" onClick={() => { setSuccess(''); setMode('login'); }}>
          Back to login
        </Button>
      </div>
    );
  }

  const isEmailOnly = mode === 'magic' || mode === 'forgot';

  return (
    <div className="flex flex-col min-h-dvh px-6 justify-center gap-8">
      {/* Logo */}
      <div className="flex flex-col items-center gap-3">
        <div className="h-16 w-16 rounded-2xl bg-accent/20 flex items-center justify-center">
          <Dumbbell size={32} className="text-accent" />
        </div>
        <h1 className="text-2xl font-bold text-text-primary">Better Fit Notes</h1>
        <p className="text-sm text-text-secondary">
          {mode === 'login' && 'Sign in to sync your workouts'}
          {mode === 'signup' && 'Create your account'}
          {mode === 'magic' && 'Sign in without a password'}
          {mode === 'forgot' && 'Reset your password'}
        </p>
      </div>

      {/* Form */}
      {isEmailOnly ? (
        <form
          onSubmit={emailForm.handleSubmit(mode === 'magic' ? handleMagicLink : handleForgot)}
          className="flex flex-col gap-4"
        >
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            error={emailForm.formState.errors.email?.message}
            {...emailForm.register('email')}
          />
          <Button type="submit" fullWidth loading={loading}>
            {mode === 'magic' ? 'Send Magic Link' : 'Send Reset Email'}
          </Button>
        </form>
      ) : (
        <form
          onSubmit={loginForm.handleSubmit(mode === 'login' ? handleLogin : handleSignup)}
          className="flex flex-col gap-4"
        >
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            error={loginForm.formState.errors.email?.message}
            {...loginForm.register('email')}
          />
          <Input
            label="Password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder="••••••••"
            error={loginForm.formState.errors.password?.message}
            {...loginForm.register('password')}
          />
          <Button type="submit" fullWidth loading={loading}>
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </Button>
        </form>
      )}

      {/* Mode switchers */}
      <div className="flex flex-col items-center gap-3 text-sm">
        {mode === 'login' && (
          <>
            <button
              type="button"
              className="text-accent"
              onClick={() => setMode('forgot')}
            >
              Forgot password?
            </button>
            <button
              type="button"
              className="text-accent"
              onClick={() => setMode('magic')}
            >
              Sign in with magic link
            </button>
            <div className="flex items-center gap-1 text-text-secondary">
              No account?
              <button type="button" className="text-accent" onClick={() => setMode('signup')}>
                Sign up
              </button>
            </div>
          </>
        )}
        {mode !== 'login' && (
          <button type="button" className="text-text-secondary" onClick={() => setMode('login')}>
            Back to login
          </button>
        )}
      </div>
    </div>
  );
}
