import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useDoc } from '@/hooks/useDoc';
import { useCollection } from '@/hooks/useCollection';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Badge } from '@/components/ui/Badge';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { QrPanel } from '@/features/hanzi/components/QrPanel';
import { AssignmentStatusBadge, SubmissionStatusBadge } from '@/features/hanzi/components/StatusBadge';
import { useGroups, useStudents } from '@/features/hanzi/hooks';
import {
  assignmentShareUrl,
  deleteHanziAssignment,
  hanziAssignmentsCol,
  itemsQuery,
  keysQuery,
  publishHanziAssignment,
  refreshHanziTargets,
  setHanziAssignmentStatus,
} from '@/features/hanzi/assignments-service';
import {
  adminAssignmentSubmissionsQuery,
  computeAutoResult,
  effectiveStatus,
  isLate,
  saveAutoResult,
  teacherAssignmentSubmissionsQuery,
} from '@/features/hanzi/submissions-service';
import { buildCsv, downloadCsv } from '@/utils/csv';
import { formatDateTime } from '@/utils/date';
import type { HanziSubmission, WithId } from '@/types/models';

export function AssignmentDetailPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const { profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const base = `/${profile?.role}/hanzi`;

  const aRef = useMemo(() => (assignmentId ? doc(hanziAssignmentsCol, assignmentId) : null), [assignmentId]);
  const { data: a, loading } = useDoc(aRef);
  const iq = useMemo(() => (assignmentId ? itemsQuery(assignmentId) : null), [assignmentId]);
  const { data: itemsRaw } = useCollection(iq);
  const kq = useMemo(() => (assignmentId ? keysQuery(assignmentId) : null), [assignmentId]);
  const { data: keysRaw } = useCollection(kq);
  const sq = useMemo(() => {
    if (!assignmentId || !profile) return null;
    return profile.role === 'admin' ? adminAssignmentSubmissionsQuery(assignmentId) : teacherAssignmentSubmissionsQuery(profile.uid, assignmentId);
  }, [assignmentId, profile?.uid, profile?.role]);
  const { data: submissions } = useCollection(sq);
  const { byId: students } = useStudents();
  const { data: groups } = useGroups();

  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showItems, setShowItems] = useState(false);

  const items = useMemo(() => [...itemsRaw].sort((x, y) => x.order - y.order), [itemsRaw]);
  const keys = useMemo(() => new Map(keysRaw.map((k) => [k.id, k])), [keysRaw]);
  const subByStudent = useMemo(() => new Map(submissions.map((s) => [s.studentId, s])), [submissions]);
  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);

  // Automatic check fallback: anything submitted without a result yet is
  // graded here, in the teacher's session (keys never reach students).
  // If the optional hanziAutoCheck Cloud Function is deployed it usually
  // got there first and this finds nothing to do.
  const autoChecked = useRef(new Set<string>());
  useEffect(() => {
    if (!a || items.length === 0 || keys.size < items.length) return;
    for (const s of submissions) {
      const tag = `${s.id}:${s.submittedAt?.toMillis() ?? 0}`;
      if (s.status === 'draft' || s.autoResult || autoChecked.current.has(tag)) continue;
      autoChecked.current.add(tag);
      void saveAutoResult(a.id, s.studentId, computeAutoResult(a, items, keys, s.answers)).catch(() => {
        autoChecked.current.delete(tag);
      });
    }
  }, [a, items, keys, submissions]);

  if (loading) return <Spinner label={t('loading')} />;
  if (!a || !assignmentId || !profile) return <EmptyState title={t('hanzi.common.notFound')} />;
  const assignment = a;

  const studentIds = [...new Set([...assignment.targetStudentIds, ...submissions.map((s) => s.studentId)])];
  const rows = studentIds
    .map((id) => {
      const st = students.get(id);
      const sub = subByStudent.get(id) ?? null;
      const groupsOf = (st?.groupIds ?? []).filter((g) => assignment.groupIds.includes(g)).map((g) => groupName.get(g) ?? g);
      return { id, name: st?.name ?? id, groups: groupsOf, sub };
    })
    .sort((x, y) => x.groups.join().localeCompare(y.groups.join()) || x.name.localeCompare(y.name));

  const counts = {
    sent: submissions.filter((s) => s.status !== 'draft').length,
    toReview: submissions.filter((s) => s.status === 'submitted' || s.status === 'in_review').length,
    reviewed: submissions.filter((s) => s.status === 'reviewed').length,
  };

  async function run(label: string, fn: () => Promise<unknown>, success: string) {
    setBusy(label);
    try {
      await fn();
      toast.show(success, 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setBusy(null);
    }
  }

  function exportCsv() {
    const csv = buildCsv(
      [t('hanzi.csv.student'), t('hanzi.csv.group'), t('hanzi.csv.status'), t('hanzi.csv.attempts'), t('hanzi.csv.autoScore'), t('hanzi.csv.teacherScore'), t('hanzi.csv.maxScore'), t('hanzi.csv.submittedAt'), t('hanzi.csv.late'), t('hanzi.csv.feedback')],
      rows.map((r) => [
        r.name,
        r.groups.join(' / '),
        t(`hanzi.status.${effectiveStatus(r.sub)}`),
        String(r.sub?.attemptsUsed ?? 0),
        r.sub?.autoResult ? String(r.sub.autoResult.score) : '',
        r.sub?.teacherScore != null ? String(r.sub.teacherScore) : '',
        String(assignment.maxScore),
        r.sub?.submittedAt ? formatDateTime(r.sub.submittedAt, i18n.language) : '',
        r.sub && isLate(r.sub, assignment) ? '1' : '',
        r.sub?.teacherFeedback ?? '',
      ]),
    );
    downloadCsv(`hanzi-${assignment.title.replace(/[^\p{L}\p{N}]+/gu, '-')}.csv`, csv);
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <Link to={base} className="text-sm text-steel-500 hover:underline">
          ← {t('hanzi.title')}
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold">{assignment.title}</h1>
            <p className="mt-1 text-sm text-text-muted">
              {t('hanzi.assignments.items', { count: assignment.itemCount })} ·{' '}
              {assignment.exerciseTypes.map((x) => t(`hanzi.types.${x}`)).join(', ')} ·{' '}
              {assignment.dueAt ? t('homework.due', { date: formatDateTime(assignment.dueAt, i18n.language) }) : t('hanzi.assignments.noDeadline')} · {t('hanzi.builder.maxScore')}: {assignment.maxScore} ·{' '}
              {t('hanzi.builder.maxAttempts')}: {assignment.maxAttempts}
            </p>
            {assignment.instructions && <p className="mt-2 whitespace-pre-wrap text-sm">{assignment.instructions}</p>}
          </div>
          <AssignmentStatusBadge status={assignment.status} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to={`${base}/assignments/${assignment.id}/edit`} className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-surface-raised">
            {t('common.edit')}
          </Link>
          {assignment.status === 'draft' && (
            <Button
              loading={busy === 'publish'}
              onClick={() => void run('publish', () => publishHanziAssignment(profile, assignment), t('hanzi.assignments.publishedShort'))}
            >
              {t('homework.publish')}
            </Button>
          )}
          {assignment.status === 'published' && (
            <>
              <Button variant="secondary" loading={busy === 'refresh'} onClick={() => void run('refresh', () => refreshHanziTargets(profile, assignment), t('hanzi.assignments.refreshed'))}>
                {t('hanzi.assignments.refreshTargets')}
              </Button>
              <Button variant="secondary" loading={busy === 'close'} onClick={() => void run('close', () => setHanziAssignmentStatus(profile, assignment, 'closed'), t('hanzi.assignments.closed'))}>
                {t('homework.close')}
              </Button>
            </>
          )}
          {assignment.status === 'closed' && (
            <Button variant="secondary" loading={busy === 'reopen'} onClick={() => void run('reopen', () => setHanziAssignmentStatus(profile, assignment, 'published'), t('hanzi.assignments.reopened'))}>
              {t('hanzi.assignments.reopen')}
            </Button>
          )}
          <Button variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>
            {t('gradebook.exportCsv')}
          </Button>
          {(assignment.status === 'draft' || profile.role === 'admin') && (
            <Button variant="ghost" className="text-coral-500" onClick={() => setConfirmDelete(true)}>
              {t('common.delete')}
            </Button>
          )}
        </div>
      </div>

      {assignment.status === 'draft' ? (
        <p className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-muted">{t('hanzi.assignments.draftNote')}</p>
      ) : (
        <QrPanel url={assignmentShareUrl(assignment.id)} fileName={assignment.title} title={assignment.title} />
      )}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display font-semibold">{t('hanzi.assignments.students')}</h2>
          <p className="text-sm text-text-muted">
            {t('hanzi.assignments.sentOf', { sent: counts.sent, total: assignment.targetStudentIds.length })} · {t('hanzi.assignments.toReview', { count: counts.toReview })} ·{' '}
            {t('hanzi.assignments.reviewedCount', { count: counts.reviewed })}
          </p>
        </div>
        <div className="mt-3">
          {rows.length === 0 ? (
            <EmptyState title={assignment.status === 'draft' ? t('hanzi.assignments.noTargetsDraft') : t('hanzi.assignments.noTargets')} />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>{t('hanzi.csv.student')}</Th>
                  <Th className="hidden sm:table-cell">{t('hanzi.csv.group')}</Th>
                  <Th>{t('hanzi.csv.status')}</Th>
                  <Th className="hidden md:table-cell">{t('hanzi.csv.attempts')}</Th>
                  <Th>{t('hanzi.review.auto')}</Th>
                  <Th>{t('hanzi.review.final')}</Th>
                  <Th />
                </Tr>
              </Thead>
              <Tbody>
                {rows.map((r) => (
                  <StudentRow key={r.id} row={r} maxAttempts={assignment.maxAttempts} late={Boolean(r.sub && isLate(r.sub, assignment))} reviewHref={`${base}/assignments/${assignment.id}/review/${r.id}`} />
                ))}
              </Tbody>
            </Table>
          )}
        </div>
      </section>

      <section>
        <button type="button" onClick={() => setShowItems((v) => !v)} className="font-display font-semibold hover:underline">
          {showItems ? '▾' : '▸'} {t('hanzi.assignments.itemsList')} ({items.length})
        </button>
        {showItems && (
          <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it, i) => {
              const k = keys.get(it.id);
              return (
                <li key={it.id} className="flex items-center gap-3 rounded-lg border border-border p-2 text-sm">
                  <span className="w-6 text-right text-text-muted">{i + 1}.</span>
                  <span className="font-kai text-xl">{k?.hanzi}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {k?.pinyin} · {k?.translation}
                  </span>
                  <Badge tone="steel">{t(`hanzi.types.${it.type}`)}</Badge>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {confirmDelete && (
        <ConfirmDialog
          open
          title={t('hanzi.assignments.deleteTitle')}
          message={t('hanzi.assignments.deleteMessage', { title: assignment.title })}
          confirmLabel={t('common.delete')}
          destructive
          requireReason={assignment.status !== 'draft'}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async (reason) => {
            try {
              await deleteHanziAssignment(profile, assignment, reason);
              toast.show(t('hanzi.assignments.deleted'), 'success');
              navigate(base);
            } catch {
              toast.show(t('auth.errors.generic'), 'error');
              setConfirmDelete(false);
            }
          }}
        />
      )}
    </div>
  );
}

function StudentRow({
  row,
  maxAttempts,
  late,
  reviewHref,
}: {
  row: { id: string; name: string; groups: string[]; sub: WithId<HanziSubmission> | null };
  maxAttempts: number;
  late: boolean;
  reviewHref: string;
}) {
  const { t } = useTranslation();
  const { sub } = row;
  return (
    <Tr>
      <Td className="font-medium">
        {row.name}
        {late && <span className="ml-2"><Badge tone="amber">{t('homework.submittedLate')}</Badge></span>}
      </Td>
      <Td className="hidden text-text-muted sm:table-cell">{row.groups.join(', ') || '—'}</Td>
      <Td>
        <SubmissionStatusBadge status={effectiveStatus(sub)} />
      </Td>
      <Td className="hidden md:table-cell">
        {sub?.attemptsUsed ?? 0}/{maxAttempts}
      </Td>
      <Td>{sub?.autoResult ? `${sub.autoResult.score}` : '—'}</Td>
      <Td className="font-medium">{sub?.teacherScore != null ? sub.teacherScore : '—'}</Td>
      <Td className="text-right">
        {sub && sub.status !== 'draft' && (
          <Link to={reviewHref} className="text-sm font-medium text-steel-500 hover:underline">
            {sub.status === 'reviewed' ? t('hanzi.review.view') : t('hanzi.review.check')}
          </Link>
        )}
      </Td>
    </Tr>
  );
}
