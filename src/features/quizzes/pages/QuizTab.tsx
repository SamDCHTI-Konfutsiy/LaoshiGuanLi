import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useCollection } from '@/hooks/useCollection';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { TextAreaField } from '@/components/ui/TextAreaField';
import { SelectField } from '@/components/ui/SelectField';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  adminOverrideQuiz,
  closeQuiz,
  createQuiz,
  deleteQuiz,
  publishQuiz,
  quizzesQuery,
  updateDraftQuiz,
  type QuizInput,
} from '@/features/quizzes/service';
import { findMyAttempts } from '@/features/quizzes/attempts-service';
import { formatDateTime, toDateTimeInputValue } from '@/utils/date';
import type { Quiz, WithId } from '@/types/models';

interface QuizTabProps {
  courseId: string;
  basePath: string;
  canManage: boolean;
  isAdmin: boolean;
  courseGroupIds: string[];
}

export function QuizTab({ courseId, basePath, canManage, isAdmin, courseGroupIds }: QuizTabProps) {
  const { profile } = useAuth();
  const toast = useToast();
  const { t, i18n } = useTranslation();
  const qQuery = useMemo(() => quizzesQuery(courseId), [courseId]);
  const { data: quizzes, loading } = useCollection(qQuery);
  const sorted = useMemo(() => [...quizzes].sort((a, b) => a.dueAt.toMillis() - b.dueAt.toMillis()), [quizzes]);

  const [editing, setEditing] = useState<WithId<Quiz> | 'new' | null>(null);
  const [deleting, setDeleting] = useState<WithId<Quiz> | null>(null);
  const [overriding, setOverriding] = useState<WithId<Quiz> | null>(null);
  const [confirmingTransition, setConfirmingTransition] = useState<{ quiz: WithId<Quiz>; action: 'publish' | 'close' } | null>(
    null,
  );

  async function handleTransition(reason: string) {
    if (!profile || !confirmingTransition) return;
    const { quiz, action } = confirmingTransition;
    try {
      if (action === 'publish') await publishQuiz(profile, quiz.id, quiz, reason);
      if (action === 'close') await closeQuiz(profile, quiz.id, quiz, reason);
      toast.show(t('quiz.updated'), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setConfirmingTransition(null);
    }
  }

  async function handleDelete(reason: string) {
    if (!profile || !deleting) return;
    try {
      await deleteQuiz(profile, deleting.id, deleting, reason);
      toast.show(t('quiz.deleted'), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => setEditing('new')}>{t('quiz.new')}</Button>
        </div>
      )}

      <div className="mt-4">
        {loading ? (
          <Spinner label={t('loading')} />
        ) : sorted.length === 0 ? (
          <EmptyState title={t('quiz.empty')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {sorted.map((quiz) => (
              <li key={quiz.id} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-medium">{quiz.title}</h2>
                      <StatusBadge status={quiz.status} />
                    </div>
                    <p className="mt-1 text-sm text-text-muted">
                      {t('homework.due', { date: formatDateTime(quiz.dueAt, i18n.language) })} · {quiz.durationMin}{' '}
                      {t('quiz.minutes')}
                    </p>
                  </div>

                  {canManage ? (
                    <div className="flex flex-wrap justify-end gap-3">
                      {quiz.status === 'draft' && (
                        <>
                          <RowAction label={t('common.edit')} onClick={() => setEditing(quiz)} />
                          <Link
                            to={`${basePath}/quizzes/${quiz.id}/builder`}
                            className="text-sm font-medium text-steel-500 hover:underline"
                          >
                            {t('quiz.manageQuestions')}
                          </Link>
                          <RowAction
                            label={t('homework.publish')}
                            onClick={() => setConfirmingTransition({ quiz, action: 'publish' })}
                          />
                          <RowAction label={t('common.delete')} tone="danger" onClick={() => setDeleting(quiz)} />
                        </>
                      )}
                      {quiz.status !== 'draft' && (
                        <>
                          <Link
                            to={`${basePath}/quizzes/${quiz.id}/attempts`}
                            className="text-sm font-medium text-steel-500 hover:underline"
                          >
                            {t('quiz.viewAttempts')}
                          </Link>
                          {quiz.status === 'published' && (
                            <RowAction
                              label={t('homework.close')}
                              onClick={() => setConfirmingTransition({ quiz, action: 'close' })}
                            />
                          )}
                          {isAdmin && <RowAction label={t('homework.adminOverride')} onClick={() => setOverriding(quiz)} />}
                        </>
                      )}
                    </div>
                  ) : (
                    profile && <StudentQuizStatus quiz={quiz} studentId={profile.uid} basePath={basePath} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing && (
        <QuizFormModal
          courseId={courseId}
          courseGroupIds={courseGroupIds}
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      {overriding && <AdminOverrideQuizModal quiz={overriding} onClose={() => setOverriding(null)} />}

      {confirmingTransition && (
        <ConfirmDialog
          open
          title={t(`homework.${confirmingTransition.action}Title`)}
          message={t(`homework.${confirmingTransition.action}Message`, { title: confirmingTransition.quiz.title })}
          confirmLabel={t(`homework.${confirmingTransition.action}`)}
          onCancel={() => setConfirmingTransition(null)}
          onConfirm={handleTransition}
        />
      )}

      {deleting && (
        <ConfirmDialog
          open
          title={t('quiz.deleteTitle')}
          message={t('quiz.deleteMessage', { title: deleting.title })}
          confirmLabel={t('common.delete')}
          destructive
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Quiz['status'] }) {
  const { t } = useTranslation();
  const tone = status === 'draft' ? 'neutral' : status === 'published' ? 'teal' : 'amber';
  return <Badge tone={tone}>{t(`homework.status.${status}`)}</Badge>;
}

function RowAction({ label, onClick, tone = 'default' }: { label: string; onClick: () => void; tone?: 'default' | 'danger' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={'text-sm font-medium hover:underline ' + (tone === 'danger' ? 'text-coral-500' : 'text-steel-500')}
    >
      {label}
    </button>
  );
}

function StudentQuizStatus({ quiz, studentId, basePath }: { quiz: WithId<Quiz>; studentId: string; basePath: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [attempts, setAttempts] = useState<Awaited<ReturnType<typeof findMyAttempts>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void findMyAttempts(quiz.id, studentId, quiz.attemptsAllowed).then((result) => {
      if (!cancelled) setAttempts(result);
    });
    return () => {
      cancelled = true;
    };
  }, [quiz.id, studentId, quiz.attemptsAllowed]);

  if (attempts === null) return null;

  const latest = attempts[attempts.length - 1];
  const pastDue = Date.now() > quiz.dueAt.toMillis();
  const canStart = quiz.status === 'published' && !pastDue && attempts.length < quiz.attemptsAllowed;

  if (latest?.data.status === 'graded') {
    return <Badge tone="teal">{t('quiz.graded', { score: latest.data.score, max: latest.data.maxScore })}</Badge>;
  }
  if (latest?.data.status === 'submitted') {
    return <Badge tone="steel">{t('quiz.awaitingGrade')}</Badge>;
  }
  if (latest?.data.status === 'in_progress') {
    return (
      <RowAction
        label={t('quiz.continue')}
        onClick={() => navigate(`${basePath}/quizzes/${quiz.id}/take/${latest.data.attemptNumber}`)}
      />
    );
  }
  if (!canStart) {
    return <Badge tone="coral">{t('quiz.notAvailable')}</Badge>;
  }
  return (
    <RowAction
      label={t('quiz.start')}
      onClick={() => navigate(`${basePath}/quizzes/${quiz.id}/take/${attempts.length + 1}`)}
    />
  );
}

function QuizFormModal({
  courseId,
  courseGroupIds,
  initial,
  onClose,
}: {
  courseId: string;
  courseGroupIds: string[];
  initial: WithId<Quiz> | null;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();

  const [title, setTitle] = useState(initial?.title ?? '');
  const [durationMin, setDurationMin] = useState(initial?.durationMin ?? 30);
  const [publishAt, setPublishAt] = useState(initial ? toDateTimeInputValue(initial.publishAt) : '');
  const [dueAt, setDueAt] = useState(initial ? toDateTimeInputValue(initial.dueAt) : '');
  const [attemptsAllowed, setAttemptsAllowed] = useState(initial?.attemptsAllowed ?? 1);
  const [shuffle, setShuffle] = useState(initial?.shuffle ?? false);
  const [passingScore, setPassingScore] = useState(initial?.passingScore ?? 60);
  const [autoGrade, setAutoGrade] = useState(initial?.autoGrade ?? true);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!profile) return;
    setSaving(true);
    const input: QuizInput = {
      title,
      durationMin,
      publishAt,
      dueAt,
      attemptsAllowed,
      shuffle,
      passingScore,
      autoGrade,
      groupIds: courseGroupIds,
    };
    try {
      if (initial) {
        await updateDraftQuiz(profile, initial.id, initial, input, reason);
      } else {
        await createQuiz(profile, courseId, input, reason);
      }
      onClose();
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={initial ? t('quiz.editTitle') : t('quiz.newTitle')}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
        className="flex flex-col gap-4"
      >
        <TextField label={t('quiz.quizTitle')} required value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t('homework.publishAt')}
            type="datetime-local"
            required
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
          />
          <TextField
            label={t('homework.dueAt')}
            type="datetime-local"
            required
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t('quiz.durationMin')}
            type="number"
            min={1}
            required
            value={durationMin}
            onChange={(e) => setDurationMin(Number(e.target.value))}
          />
          <TextField
            label={t('quiz.attemptsAllowed')}
            type="number"
            min={1}
            required
            value={attemptsAllowed}
            onChange={(e) => setAttemptsAllowed(Number(e.target.value))}
          />
        </div>
        <TextField
          label={t('quiz.passingScore')}
          type="number"
          min={0}
          required
          value={passingScore}
          onChange={(e) => setPassingScore(Number(e.target.value))}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} className="h-4 w-4 rounded border-border" />
          {t('quiz.shuffle')}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoGrade}
            onChange={(e) => setAutoGrade(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          {t('quiz.autoGrade')}
        </label>
        <TextAreaField label={t('common.reasonOptional')} value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={saving}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AdminOverrideQuizModal({ quiz, onClose }: { quiz: WithId<Quiz>; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  const [publishAt, setPublishAt] = useState(toDateTimeInputValue(quiz.publishAt));
  const [dueAt, setDueAt] = useState(toDateTimeInputValue(quiz.dueAt));
  const [status, setStatus] = useState(quiz.status);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!profile) return;
    if (!reason.trim()) {
      toast.show(t('common.reasonRequired'), 'error');
      return;
    }
    setSaving(true);
    try {
      await adminOverrideQuiz(profile, quiz.id, quiz, { publishAt, dueAt, status }, reason.trim());
      onClose();
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t('homework.adminOverrideTitle')}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
        className="flex flex-col gap-4"
      >
        <p className="text-sm text-text-muted">{t('homework.adminOverrideNote')}</p>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t('homework.publishAt')}
            type="datetime-local"
            required
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
          />
          <TextField
            label={t('homework.dueAt')}
            type="datetime-local"
            required
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </div>
        <SelectField label={t('admin.users.status')} value={status} onChange={(e) => setStatus(e.target.value as Quiz['status'])}>
          <option value="published">{t('homework.status.published')}</option>
          <option value="closed">{t('homework.status.closed')}</option>
        </SelectField>
        <TextAreaField label={t('common.reasonRequired')} required value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={saving}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
