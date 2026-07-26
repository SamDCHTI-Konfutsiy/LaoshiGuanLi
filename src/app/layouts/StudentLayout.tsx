import { useTranslation } from 'react-i18next';
import { RoleShell } from '@/app/layouts/RoleShell';

export function StudentLayout() {
  const { t } = useTranslation();
  return (
    <RoleShell
      role="student"
      basePath="/student"
      extraNavItems={[
        { to: '/student/courses', label: t('nav.myCourses') },
        { to: '/student/grades', label: t('nav.grades') },
      ]}
    />
  );
}
