import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCollection } from '@/hooks/useCollection';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { enrolledCoursesQuery, teachingCoursesQuery } from '@/features/courses/service';

export function MyCoursesPage() {
  const { profile } = useAuth();
  const { t } = useTranslation();

  const isTeacher = profile?.role === 'teacher';
  const groupIds = profile?.groupIds ?? [];

  const tQuery = useMemo(
    () => (isTeacher && profile ? teachingCoursesQuery(profile.uid) : null),
    [isTeacher, profile],
  );
  const eQuery = useMemo(
    () => (!isTeacher && groupIds.length > 0 ? enrolledCoursesQuery(groupIds) : null),
    [isTeacher, groupIds.join(',')],
  );
  const { data: taught, loading: taughtLoading } = useCollection(tQuery);
  const { data: enrolled, loading: enrolledLoading } = useCollection(eQuery);

  if (!profile) return null;

  const courses = isTeacher ? taught : enrolled;
  const loading = isTeacher ? taughtLoading : enrolledLoading;
  const basePath = isTeacher ? '/teacher/courses' : '/student/courses';

  return (
    <div className="p-6">
      <h1 className="font-display text-xl font-semibold">{t('nav.myCourses')}</h1>

      <div className="mt-6">
        {loading ? (
          <Spinner label={t('loading')} />
        ) : courses.length === 0 ? (
          <EmptyState title={t('nav.noCourses')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {courses.map((c) => (
              <li key={c.id}>
                <Link
                  to={`${basePath}/${c.id}`}
                  className="block rounded-xl border border-border p-4 hover:bg-surface-raised"
                >
                  <span className="font-medium">{c.title}</span>
                  {c.description && <p className="mt-1 text-sm text-text-muted">{c.description}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
