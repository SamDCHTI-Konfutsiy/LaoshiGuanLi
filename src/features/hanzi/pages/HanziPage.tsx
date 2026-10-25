import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Tabs } from '@/components/ui/Tabs';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { AssignmentStatusBadge, SubmissionStatusBadge } from '@/features/hanzi/components/StatusBadge';
import { WordsTab } from '@/features/hanzi/pages/WordsTab';
import { StatsTab } from '@/features/hanzi/pages/StatsTab';
import { useManagedAssignments, useManagedCourses, useManagedSubmissions, useStudents } from '@/features/hanzi/hooks';
import { deleteHanziAssignment, publishHanziAssignment } from '@/features/hanzi/assignments-service';
import { isLate } from '@/features/hanzi/submissions-service';
import { formatDateTime, timestampSortKey } from '@/utils/date';
import type { HanziAssignment, WithId } from '@/types/models';

type Tab = 'assignments' | 'review' | 'words' | 'stats';
const TABS: Tab[] = ['assignments', 'review', 'words', 'stats'];

/** 汉字练习 — teacher/admin hub. One page, four tabs, tab kept in the URL (?tab=) so links and the back button work. */
export function HanziPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab') as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : 'assignments';
  const { profile } = useAuth();
  const { data: submissions } = useManagedSubmissions(profile);
  const pendingReview = submissions.filter((s) => s.status === 'submitted' || s.status === 'in_review').length;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold">
            <span lang="zh" className="font-kai">汉字练习</span> — {t('hanzi.title')}
          </h1>
          <p className="mt-1 text-sm text-text-muted">{t('hanzi.subtitle')}</p>
        </div>
        <div className="max-w-full overflow-x-auto">
          <Tabs
            value={tab}
            onChange={(v) => setParams(v === 'assignments' ? {} : { tab: v }, { replace: true })}
            items={[
              { value: 'assignments', label: t('hanzi.tabs.assignments') },
              { value: 'review', label: pendingReview > 0 ? `${t('hanzi.tabs.review')} (${pendingReview})` : t('hanzi.tabs.review') },
              { value: 'words', label: t('hanzi.tabs.words') },
              { value: 'stats', label: t('hanzi.tabs.stats') },
            ]}
          />
        </div>
      </div>
      <div className="mt-6">
        {tab === 'assignments' && <AssignmentsTab />}
        {tab === 'review' && <ReviewQueueTab />}
        {tab === 'words' && <WordsTab />}
        {tab === 'stats' && <StatsTab />}
      </div>
    </div>
  );
}

function AssignmentsTab() {
  const { profile } = useAuth();
  const toast = useToast();
  const { t, i18n } = useTranslation();
  const { data: assignments, loading, error } = useManagedAssignments(profile);
  const { data: submissions } = useManagedSubmissions(profile);
  const { data: courses } = useManagedCourses(profile);
  const [deleting, setDeleting] = useState<WithId<HanziAssignment> | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const base = `/${profile?.role}/hanzi`;

  const courseTitle = useMemo(() => new Map(courses.map((c) => [c.id, c.title])), [courses]);
  const subCounts = useMemo(() => {
    const m = new Map<string, { sent: number; toReview: number }>();
    for (const s of submissions) {
      const c = m.get(s.assignmentId) ?? { sent: 0, toReview: 0 };
      if (s.status !== 'draft') c.sent += 1;
      if (s.status === 'submitted' || s.status === 'in_review') c.toReview += 1;
      m.set(s.assignmentId, c);
    }
    return m;
  }, [submissions]);
  const sorted = useMemo(() => [...assignments].sort((a, b) => timestampSortKey(b.createdAt) - timestampSortKey(a.createdAt)), [assignments]);

  async function publish(a: WithId<HanziAssignment>) {
    if (!profile) return;
    setPublishingId(a.id);
    try {
      const n = await publishHanziAssignment(profile, a);
      toast.show(t('hanzi.assignments.published', { count: n }), n > 0 ? 'success' : 'error');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setPublishingId(null);
    }
  }

  async function remove(reason: string) {
    if (!profile || !deleting) return;
    try {
      await deleteHanziAssignment(profile, deleting, reason);
      toast.show(t('hanzi.assignments.deleted'), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setDeleting(null);
    }
  }

  if (!profile) return null;

  return (
    <div>
      <div className="flex justify-end">
        <Link to={`${base}/new`} className="inline-flex h-10 items-center rounded-lg bg-steel-500 px-4 text-sm font-medium text-white hover:bg-steel-600">
          {t('hanzi.assignments.new')}
        </Link>
      </div>
      <div className="mt-4">
        {loading ? (
          <Spinner label={t('loading')} />
        ) : error ? (
          <EmptyState title={t('hanzi.common.loadError')} />
        ) : sorted.length === 0 ? (
          <EmptyState title={t('hanzi.assignments.empty')} />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {sorted.map((a) => {
              const counts = subCounts.get(a.id) ?? { sent: 0, toReview: 0 };
              return (
                <li key={a.id} className="flex flex-col gap-3 rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`${base}/assignments/${a.id}`} className="font-medium hover:underline">
                        {a.title}
                      </Link>
                      <p className="mt-0.5 truncate text-sm text-text-muted">{courseTitle.get(a.courseId) ?? '—'}</p>
                    </div>
                    <AssignmentStatusBadge status={a.status} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-muted">
                    <span>{t('hanzi.assignments.items', { count: a.itemCount })}</span>
                    <span>{a.dueAt ? t('homework.due', { date: formatDateTime(a.dueAt, i18n.language) }) : t('hanzi.assignments.noDeadline')}</span>
                    {a.status !== 'draft' && (
                      <span>
                        {t('hanzi.assignments.sentOf', { sent: counts.sent, total: a.targetStudentIds.length })}
                        {counts.toReview > 0 && <span className="ml-1 font-medium text-amber-500">· {t('hanzi.assignments.toReview', { count: counts.toReview })}</span>}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link to={`${base}/assignments/${a.id}`} className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-raised">
                      {t('hanzi.assignments.open')}
                    </Link>
                    {a.status === 'draft' && (
                      <>
                        <Link to={`${base}/assignments/${a.id}/edit`} className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-raised">
                          {t('common.edit')}
                        </Link>
                        <Button className="h-9" loading={publishingId === a.id} onClick={() => void publish(a)}>
                          {t('homework.publish')}
                        </Button>
                      </>
                    )}
                    {(a.status === 'draft' || profile.role === 'admin') && (
                      <Button variant="ghost" className="h-9 text-coral-500" onClick={() => setDeleting(a)}>
                        {t('common.delete')}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {deleting && (
        <ConfirmDialog
          open
          title={t('hanzi.assignments.deleteTitle')}
          message={t('hanzi.assignments.deleteMessage', { title: deleting.title })}
          confirmLabel={t('common.delete')}
          destructive
          requireReason={profile.role === 'admin' && deleting.status !== 'draft'}
          onCancel={() => setDeleting(null)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}

/** Everything waiting for the teacher, oldest first — the "tekshirish" inbox. */
function ReviewQueueTab() {
  const { profile } = useAuth();
  const { t, i18n } = useTranslation();
  const { data: submissions, loading } = useManagedSubmissions(profile);
  const { data: assignments } = useManagedAssignments(profile);
  const { byId: students } = useStudents();
  const [showAll, setShowAll] = useState(false);
  const base = `/${profile?.role}/hanzi`;
  const assignmentById = useMemo(() => new Map(assignments.map((a) => [a.id, a])), [assignments]);

  const rows = useMemo(
    () =>
      submissions
        .filter((s) => s.status !== 'draft')
        .filter((s) => showAll || s.status === 'submitted' || s.status === 'in_review')
        .sort((a, b) => timestampSortKey(a.submittedAt) - timestampSortKey(b.submittedAt)),
    [submissions, showAll],
  );

  if (loading) return <Spinner label={t('loading')} />;

  return (
    <div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
        {t('hanzi.review.showAll')}
      </label>
      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState title={t('hanzi.review.queueEmpty')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((s) => {
              const a = assignmentById.get(s.assignmentId);
              return (
                <li key={s.id}>
                  <Link
                    to={`${base}/assignments/${s.assignmentId}/review/${s.studentId}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3 hover:bg-surface-raised"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{students.get(s.studentId)?.name ?? s.studentId}</p>
                      <p className="truncate text-sm text-text-muted">
                        {a?.title ?? '—'} · {formatDateTime(s.submittedAt, i18n.language)}
                        {a && isLate(s, a) && <span className="ml-1 text-amber-500">· {t('homework.submittedLate')}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.autoResult && (
                        <span className="text-sm text-text-muted">
                          {t('hanzi.review.auto')}: {s.autoResult.score}/{s.autoResult.maxScore}
                        </span>
                      )}
                      <SubmissionStatusBadge status={s.status} />
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
