import { useTranslation } from 'react-i18next';
import { RoleShell } from '@/app/layouts/RoleShell';

export function TeacherLayout() {
  const { t } = useTranslation();
  return (
    <RoleShell
      role="teacher"
      basePath="/teacher"
      extraNavItems={[
        { to: '/teacher/courses', label: t('nav.myCourses') },
        { to: '/teacher/question-bank', label: t('quiz.bank.title') },
      ]}
    />
  );
}
