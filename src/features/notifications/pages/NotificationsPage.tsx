import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCollection } from '@/hooks/useCollection';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { markAsRead, notificationsQuery } from '@/features/notifications/service';
import { formatDateTime } from '@/utils/date';

export function NotificationsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const nQuery = useMemo(() => (profile ? notificationsQuery(profile.uid) : null), [profile]);
  const { data: notifications, loading } = useCollection(nQuery);

  async function handleOpen(id: string, link: string) {
    if (profile) void markAsRead(profile.uid, id);
    navigate(`/${profile?.role}/${link}`);
  }

  return (
    <div className="p-6">
      <h1 className="font-display text-xl font-semibold">{t('nav.notifications')}</h1>

      <div className="mt-6">
        {loading ? (
          <Spinner label={t('loading')} />
        ) : notifications.length === 0 ? (
          <EmptyState title={t('notifications.empty')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => void handleOpen(n.id, n.link)}
                  className={
                    'flex w-full items-start justify-between gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-surface-raised ' +
                    (n.read ? 'border-border' : 'border-steel-500/40 bg-steel-50 dark:bg-surface-raised')
                  }
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{n.title}</span>
                      {!n.read && <Badge tone="steel">{t('notifications.new')}</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-text-muted">{formatDateTime(n.createdAt, i18n.language)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
