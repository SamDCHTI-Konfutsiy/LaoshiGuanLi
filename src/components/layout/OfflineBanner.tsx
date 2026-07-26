import { useTranslation } from 'react-i18next';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export function OfflineBanner() {
  const online = useOnlineStatus();
  const { t } = useTranslation();

  if (online) return null;

  return (
    <div role="status" className="bg-amber-100 px-4 py-1.5 text-center text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
      {t('offline.banner')}
    </div>
  );
}
