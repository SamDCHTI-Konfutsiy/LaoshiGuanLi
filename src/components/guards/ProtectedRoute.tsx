import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';

export function ProtectedRoute() {
  const { status, profile, signOutUser } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();

  if (status === 'initializing') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-sm text-text-muted">{t('loading')}</span>
      </div>
    );
  }

  if (status === 'signed-out' || status === 'disabled') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (status === 'incomplete') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="max-w-sm text-sm text-text-muted">{t('auth.errors.incompleteAccount')}</p>
        <button
          type="button"
          onClick={() => void signOutUser()}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-raised"
        >
          {t('auth.signOut')}
        </button>
      </div>
    );
  }

  if (status === 'pending') {
    if (!profile) return null; // AuthContext always sets profile before status='pending'
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="font-display text-lg font-semibold">{t('auth.pendingTitle')}</h1>
        <p className="max-w-sm text-sm text-text-muted">
          {t('auth.pendingMessage', { role: t(`auth.roles.${profile.role}`) })}
        </p>
        <button
          type="button"
          onClick={() => void signOutUser()}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-raised"
        >
          {t('auth.signOut')}
        </button>
      </div>
    );
  }

  return <Outlet />;
}
