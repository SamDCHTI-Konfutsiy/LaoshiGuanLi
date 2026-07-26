import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { authErrorKey } from '@/features/auth/service';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';

export function LoginPage() {
  const { signIn, resetPassword, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  if (status === 'signed-in' || status === 'pending') return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      const from = (location.state as { from?: string } | null)?.from ?? '/';
      navigate(from, { replace: true });
    } catch (err) {
      setError(t(`auth.${authErrorKey(err)}`));
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await resetPassword(email);
      setResetSent(true);
    } catch (err) {
      setError(t(`auth.${authErrorKey(err)}`));
    } finally {
      setLoading(false);
    }
  }

  if (mode === 'reset') {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-surface-raised p-6">
          <h1 className="font-display text-xl font-semibold">{t('auth.resetTitle')}</h1>
          <p className="mt-1 text-sm text-text-muted">{t('auth.resetSubtitle')}</p>

          {resetSent ? (
            <>
              <p className="mt-6 text-sm text-teal-500">{t('auth.resetSent', { email })}</p>
              <Button
                variant="secondary"
                className="mt-6 w-full"
                onClick={() => {
                  setMode('login');
                  setResetSent(false);
                }}
              >
                {t('auth.backToSignIn')}
              </Button>
            </>
          ) : (
            <form onSubmit={(e) => void handleReset(e)}>
              <div className="mt-6">
                <TextField
                  label={t('auth.email')}
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {error && (
                <p role="alert" className="mt-4 text-sm text-coral-500">
                  {error}
                </p>
              )}
              <Button type="submit" loading={loading} className="mt-6 w-full">
                {t('auth.sendResetLink')}
              </Button>
              <button
                type="button"
                onClick={() => setMode('login')}
                className="mt-4 w-full text-center text-sm text-steel-500 hover:underline"
              >
                {t('auth.backToSignIn')}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <form onSubmit={(e) => void handleSubmit(e)} className="w-full max-w-sm rounded-xl border border-border bg-surface-raised p-6">
        <h1 className="font-display text-xl font-semibold">{t('auth.loginTitle')}</h1>
        <p className="mt-1 text-sm text-text-muted">{t('auth.loginSubtitle')}</p>

        <div className="mt-6 flex flex-col gap-4">
          <TextField
            label={t('auth.email')}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div>
            <TextField
              label={t('auth.password')}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setMode('reset')}
              className="mt-1.5 text-sm text-steel-500 hover:underline"
            >
              {t('auth.forgotPassword')}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-coral-500">
            {error}
          </p>
        )}

        <Button type="submit" loading={loading} className="mt-6 w-full">
          {t('auth.signIn')}
        </Button>

        <p className="mt-4 text-center text-sm text-text-muted">
          {t('auth.noAccount')}{' '}
          <Link to="/signup" className="font-medium text-steel-500 hover:underline">
            {t('auth.signUp')}
          </Link>
        </p>
      </form>
    </div>
  );
}
