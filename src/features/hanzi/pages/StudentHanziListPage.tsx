import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCollection } from '@/hooks/useCollection';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { SubmissionStatusBadge } from '@/features/hanzi/components/StatusBadge';
import { studentAssignmentsQuery } from '@/features/hanzi/assignments-service';
import { effectiveStatus, studentSubmissionsQuery } from '@/features/hanzi/submissions-service';
import { formatDateTime } from '@/utils/date';

export function StudentHanziListPage() {
  const { profile } = useAuth();
  const { t, i18n } = useTranslation();
  const aq = useMemo(() => (profile ? studentAssignmentsQuery(profile.uid) : null), [profile?.uid]);
  const { data: assignments, loading, error } = useCollection(aq);
  const sq = useMemo(() => (profile ? studentSubmissionsQuery(profile.uid) : null), [profile?.uid]);
  const { data: subs } = useCollection(sq);
  const subByAssignment = useMemo(() => new Map(subs.map((s) => [s.assignmentId, s])), [subs]);

  const sorted = useMemo(() => {
    const open = (status: string) => (status === 'published' ? 0 : 1);
    return [...assignments].sort(
      (a, b) => open(a.status) - open(b.status) || (a.dueAt?.toMillis() ?? Infinity) - (b.dueAt?.toMillis() ?? Infinity),
    );
  }, [assignments]);

  return (
    <div className="p-4 sm:p-6">
      <h1 className="font-display text-xl font-semibold">
        <span lang="zh" className="font-kai">汉字练习</span> — {t('hanzi.title')}
      </h1>
      <p className="mt-1 text-sm text-text-muted">{t('hanzi.student.subtitle')}</p>
      <div className="mt-6">
        {loading ? (
          <Spinner label={t('loading')} />
        ) : error ? (
          <EmptyState title={t('hanzi.common.loadError')} />
        ) : sorted.length === 0 ? (
          <EmptyState title={t('hanzi.student.empty')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {sorted.map((a) => {
              const sub = subByAssignment.get(a.id) ?? null;
              const overdue = a.status === 'published' && a.dueAt && a.dueAt.toMillis() < Date.now() && !sub?.submittedAt;
              return (
                <li key={a.id}>
                  <Link to={`/student/hanzi/${a.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4 hover:bg-surface-raised">
                    <div className="min-w-0">
                      <p className="font-medium">{a.title}</p>
                      <p className={'mt-0.5 text-sm ' + (overdue ? 'text-coral-500' : 'text-text-muted')}>
                        {t('hanzi.assignments.items', { count: a.itemCount })} ·{' '}
                        {a.status === 'closed'
                          ? t('hanzi.assignmentStatus.closed')
                          : a.dueAt
                            ? t('homework.due', { date: formatDateTime(a.dueAt, i18n.language) })
                            : t('hanzi.assignments.noDeadline')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {sub?.status === 'reviewed' && sub.teacherScore != null && (
                        <span className="text-sm font-semibold">
                          {sub.teacherScore}/{a.maxScore}
                        </span>
                      )}
                      <SubmissionStatusBadge status={effectiveStatus(sub)} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
