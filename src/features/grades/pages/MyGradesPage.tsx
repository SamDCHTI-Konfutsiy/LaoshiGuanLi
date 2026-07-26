import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useCollection } from '@/hooks/useCollection';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { studentManualGradesQuery } from '@/features/grades/service';
import { coursesQuery } from '@/features/courses/service';
import { formatDate } from '@/utils/date';

export function MyGradesPage() {
  const { profile } = useAuth();
  const { t, i18n } = useTranslation();

  const gQuery = useMemo(() => (profile ? studentManualGradesQuery(profile.uid) : null), [profile]);
  const { data: grades, loading } = useCollection(gQuery);
  const cQuery = useMemo(() => coursesQuery(), []);
  const { data: courses } = useCollection(cQuery);
  const courseName = useMemo(() => new Map(courses.map((c) => [c.id, c.title])), [courses]);

  const sorted = useMemo(() => [...grades].sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)), [grades]);

  return (
    <div className="p-6">
      <h1 className="font-display text-xl font-semibold">{t('nav.grades')}</h1>
      <p className="mt-1 text-sm text-text-muted">{t('grades.myGradesNote')}</p>

      <div className="mt-6">
        {loading ? (
          <Spinner label={t('loading')} />
        ) : sorted.length === 0 ? (
          <EmptyState title={t('grades.empty')} />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>{t('nav.myCourses')}</Th>
                <Th>{t('grades.itemTitle')}</Th>
                <Th>{t('homework.score')}</Th>
                <Th>{t('homework.feedback')}</Th>
                <Th>{t('admin.users.joined')}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {sorted.map((g) => (
                <Tr key={g.id}>
                  <Td>{courseName.get(g.courseId) ?? '—'}</Td>
                  <Td className="font-medium">{g.title}</Td>
                  <Td>
                    {g.score} / {g.maxScore}
                  </Td>
                  <Td className="max-w-xs truncate text-text-muted">{g.comment || '—'}</Td>
                  <Td>{formatDate(g.createdAt, i18n.language)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
