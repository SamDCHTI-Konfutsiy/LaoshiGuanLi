import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { authErrorKey, isAdminBootstrapAvailable } from '@/features/auth/service';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { SelectField } from '@/components/ui/SelectField';
import type { Role } from '@/types/enums';

type Mode = 'signup' | 'bootstrap';
type RequestableRole = Extract<Role, 'teacher' | 'student'>;

export function SignupPage() {
  const { signUp, signUpAsFirstAdmin, status } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [bootstrapAvailable, setBootstrapAvailable] = useState(false);
  const [mode, setMode] = useState<Mode>('signup');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [requestedRole, setRequestedRole] = useState<RequestableRole>('student');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void isAdminBootstrapAvailable().then((available) => {
      if (!cancelled) setBootstrapAvailable(available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'signed-in' || status === 'pending') return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t('auth.errors.passwordMismatch'));
      return;
    }

    setLoading(true);
    try {
      if (mode === 'bootstrap') {
        await signUpAsFirstAdmin({ name, email, password });
      } else {
        await signUp({ name, email, password, requestedRole });
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(t(`auth.${authErrorKey(err)}`));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-8">
      <form onSubmit={(e) => void handleSubmit(e)} className="w-full max-w-sm rounded-xl border border-border bg-surface-raised p-6">
        <h1 className="font-display text-xl font-semibold">
          {mode === 'bootstrap' ? t('auth.bootstrapTitle') : t('auth.signupTitle')}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          {mode === 'bootstrap' ? t('auth.bootstrapSubtitle') : t('auth.signupSubtitle')}
        </p>

        <div className="mt-6 flex flex-col gap-4">
          <TextField label={t('auth.name')} required value={name} onChange={(e) => setName(e.target.value)} />
          <TextField
            label={t('auth.email')}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {mode === 'signup' && (
            <SelectField
              label={t('auth.iAmA')}
              value={requestedRole}
              onChange={(e) => setRequestedRole(e.target.value as RequestableRole)}
            >
              <option value="student">{t('auth.roles.student')}</option>
              <option value="teacher">{t('auth.roles.teacher')}</option>
            </SelectField>
          )}
          <TextField
            label={t('auth.password')}
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <TextField
            label={t('auth.confirmPassword')}
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-coral-500">
            {error}
          </p>
        )}

        <Button type="submit" loading={loading} className="mt-6 w-full">
          {mode === 'bootstrap' ? t('auth.createAdminAccount') : t('auth.signUp')}
        </Button>

        {bootstrapAvailable && (
          <button
            type="button"
            onClick={() => setMode(mode === 'signup' ? 'bootstrap' : 'signup')}
            className="mt-4 w-full text-center text-sm text-steel-500 hover:underline"
          >
            {mode === 'signup' ? t('auth.switchToBootstrap') : t('auth.switchToSignup')}
          </button>
        )}

        <p className="mt-4 text-center text-sm text-text-muted">
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="font-medium text-steel-500 hover:underline">
            {t('auth.signIn')}
          </Link>
        </p>
      </form>
    </div>
  );
}
