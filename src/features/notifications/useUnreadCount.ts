import { useMemo } from 'react';
import { useCollection } from '@/hooks/useCollection';
import { notificationsQuery } from '@/features/notifications/service';

export function useUnreadNotificationCount(uid: string | undefined): number {
  const nQuery = useMemo(() => (uid ? notificationsQuery(uid) : null), [uid]);
  const { data } = useCollection(nQuery);
  return useMemo(() => data.filter((n) => !n.read).length, [data]);
}
