import { useTranslation } from 'react-i18next';
import { RoleShell } from '@/app/layouts/RoleShell';

export function AdminLayout() {
  const { t } = useTranslation();
  return (
    <RoleShell
      role="admin"
      basePath="/admin"
      extraNavItems={[
        { to: '/admin/users', label: t('admin.nav.users') },
        { to: '/admin/semesters', label: t('admin.nav.semesters') },
        { to: '/admin/classrooms', label: t('admin.nav.classrooms') },
        { to: '/admin/groups', label: t('admin.nav.groups') },
        { to: '/admin/courses', label: t('admin.nav.courses') },
        { to: '/admin/payments', label: t('nav.payments') },
        { to: '/admin/audit', label: t('admin.nav.audit') },
      ]}
    />
  );
}
