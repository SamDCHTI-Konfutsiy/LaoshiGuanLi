import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useUnreadNotificationCount } from '@/features/notifications/useUnreadCount';
import type { Role } from '@/types/enums';

interface RoleShellProps {
  role: Role;
  basePath: string;
  extraNavItems?: { to: string; label: string }[];
}

export function RoleShell({ role, basePath, extraNavItems = [] }: RoleShellProps) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const unread = useUnreadNotificationCount(profile?.uid);

  const navItems = [
    { to: basePath, label: t('nav.home'), end: true, badge: 0 },
    ...extraNavItems.map((item) => ({ ...item, end: false, badge: 0 })),
    { to: `${basePath}/search`, label: t('nav.search'), end: false, badge: 0 },
    { to: `${basePath}/announcements`, label: t('nav.announcements'), end: false, badge: 0 },
    { to: `${basePath}/schedule`, label: t('nav.schedule'), end: false, badge: 0 },
    { to: `${basePath}/notifications`, label: t('nav.notifications'), end: false, badge: unread },
    { to: `${basePath}/profile`, label: t('nav.profile'), end: false, badge: 0 },
  ];

  return (
    <div className="flex flex-1">
      <nav className="w-56 shrink-0 border-r border-border p-4">
        <span className="inline-block rounded-full bg-steel-50 px-2.5 py-1 text-xs font-medium text-steel-600 dark:bg-surface-raised dark:text-steel-300">
          {t(`auth.roles.${role}`)}
        </span>
        <ul className="mt-4 flex flex-col gap-1">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  'flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ' +
                  (isActive ? 'bg-surface-raised text-text' : 'text-text-muted hover:bg-surface-raised hover:text-text')
                }
              >
                <span>{item.label}</span>
                {item.badge > 0 && (
                  <span className="rounded-full bg-coral-500 px-1.5 py-0.5 text-xs font-semibold text-white">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="flex flex-1 flex-col">
        {profile && <Outlet />}
      </main>
    </div>
  );
}
