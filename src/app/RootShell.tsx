import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { LangToggle } from '@/components/layout/LangToggle';
import { OfflineBanner } from '@/components/layout/OfflineBanner';
import { Spinner } from '@/components/ui/Spinner';

export function RootShell() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-full flex-col">
      <OfflineBanner />
      <header className="flex h-14 items-center justify-between border-b border-border px-4">
        <span className="font-display text-lg font-semibold tracking-tight">
          {t('appName')}
        </span>
        <div className="flex items-center gap-3">
          <LangToggle />
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 flex-col">
        <Suspense fallback={<div className="flex flex-1 items-center justify-center p-8"><Spinner label={t('loading')} /></div>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
