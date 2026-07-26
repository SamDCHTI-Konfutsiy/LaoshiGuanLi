import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useCollection } from '@/hooks/useCollection';
import { useDoc } from '@/hooks/useDoc';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { TextAreaField } from '@/components/ui/TextAreaField';
import { SelectField } from '@/components/ui/SelectField';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { AttachmentLink } from '@/components/ui/AttachmentLink';
import { isAllowedAttachmentType, MAX_ATTACHMENT_BYTES } from '@/services/attachments';
import {
  adminOverrideHomework,
  closeHomework,
  createHomework,
  deleteHomework,
  homeworkQuery,
  markHomeworkGraded,
  publishHomework,
  updateDraftHomework,
  updateHomeworkContent,
  type HomeworkInput,
} from '@/features/homework/service';
import { submissionRef, submitHomework } from '@/features/homework/submissions-service';
import { formatDateTime, toDateTimeInputValue } from '@/utils/date';
import type { Homework, HomeworkAttachment, WithId } from '@/types/models';

interface HomeworkTabProps {
  courseId: string;
  basePath: string; // '/admin/courses/:id' or '/teacher/courses/:id' — for the "view submissions" link
  canManage: boolean;
  isAdmin: boolean;
  courseGroupIds: string[];
  lessons: { id: string; title: string }[];
}

export function HomeworkTab({ courseId, basePath, canManage, isAdmin, courseGroupIds, lessons }: HomeworkTabProps) {
  const { profile } = useAuth();
  const toast = useToast();
  const { t, i18n } = useTranslation();
  const hQuery = useMemo(() => homeworkQuery(courseId), [courseId]);
  const { data: homework, loading } = useCollection(hQuery);

  const sorted = useMemo(() => [...homework].sort((a, b) => a.dueAt.toMillis() - b.dueAt.toMillis()), [homework]);

  const [editing, setEditing] = useState<WithId<Homework> | 'new' | null>(null);
  const [deleting, setDeleting] = useState<WithId<Homework> | null>(null);
  const [overriding, setOverriding] = useState<WithId<Homework> | null>(null);
  const [confirmingTransition, setConfirmingTransition] = useState<{
    hw: WithId<Homework>;
    action: 'publish' | 'close' | 'grade';
  } | null>(null);
  const [submittingFor, setSubmittingFor] = useState<WithId<Homework> | null>(null);

  async function handleTransition(reason: string) {
    if (!profile || !confirmingTransition) return;
    const { hw, action } = confirmingTransition;
    try {
      if (action === 'publish') await publishHomework(profile, hw.id, hw, reason);
      if (action === 'close') await closeHomework(profile, hw.id, hw, reason);
      if (action === 'grade') await markHomeworkGraded(profile, hw.id, hw, reason);
      toast.show(t('homework.updated'), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setConfirmingTransition(null);
    }
  }

  async function handleDelete(reason: string) {
    if (!profile || !deleting) return;
    try {
      await deleteHomework(profile, deleting.id, deleting, reason);
      toast.show(t('homework.deleted'), 'success');
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
          <Button onClick={() => setEditing('new')}>{t('homework.new')}</Button>
        </div>
      )}

      <div className="mt-4">
        {loading ? (
          <Spinner label={t('loading')} />
        ) : sorted.length === 0 ? (
          <EmptyState title={t('homework.empty')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {sorted.map((hw) => (
              <li key={hw.id} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-medium">{hw.title}</h2>
                      <StatusBadge status={hw.status} />
                    </div>
                    <p className="mt-1 text-sm text-text-muted">
                      {t('homework.due', { date: formatDateTime(hw.dueAt, i18n.language) })}
                    </p>
                  </div>

                  {canManage ? (
                    <div className="flex flex-wrap justify-end gap-3">
                      {hw.status === 'draft' && (
                        <>
                          <RowAction label={t('common.edit')} onClick={() => setEditing(hw)} />
                          <RowAction
                            label={t('homework.publish')}
                            onClick={() => setConfirmingTransition({ hw, action: 'publish' })}
                          />
                          <RowAction label={t('common.delete')} tone="danger" onClick={() => setDeleting(hw)} />
                        </>
                      )}
                      {hw.status !== 'draft' && (
                        <>
                          <RowAction label={t('common.edit')} onClick={() => setEditing(hw)} />
                          <Link
                            to={`${basePath}/homework/${hw.id}`}
                            className="text-sm font-medium text-steel-500 hover:underline"
                          >
                            {t('homework.viewSubmissions')}
                          </Link>
                          {hw.status === 'published' && (
                            <RowAction
                              label={t('homework.close')}
                              onClick={() => setConfirmingTransition({ hw, action: 'close' })}
                            />
                          )}
                          {hw.status !== 'graded' && (
                            <RowAction
                              label={t('homework.markGraded')}
                              onClick={() => setConfirmingTransition({ hw, action: 'grade' })}
                            />
                          )}
                          {isAdmin && (
                            <RowAction label={t('homework.adminOverride')} onClick={() => setOverriding(hw)} />
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    profile && (
                      <StudentSubmissionStatus
                        hw={hw}
                        studentId={profile.uid}
                        onSubmit={() => setSubmittingFor(hw)}
                      />
                    )
                  )}
                </div>
                {hw.instructions && <p className="mt-2 text-sm text-text-muted">{hw.instructions}</p>}
                {hw.attachments.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1">
                    {hw.attachments.map((att) => (
                      <li key={att.path}>
                        <AttachmentLink name={att.name} path={att.path} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing && (
        <HomeworkFormModal
          courseId={courseId}
          courseGroupIds={courseGroupIds}
          lessons={lessons}
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      {overriding && <AdminOverrideModal hw={overriding} onClose={() => setOverriding(null)} />}

      {submittingFor && profile && (
        <SubmitHomeworkModal hw={submittingFor} student={profile} onClose={() => setSubmittingFor(null)} />
      )}

      {confirmingTransition && (
        <ConfirmDialog
          open
          title={t(`homework.${confirmingTransition.action}Title`)}
          message={t(`homework.${confirmingTransition.action}Message`, { title: confirmingTransition.hw.title })}
          confirmLabel={t(`homework.${confirmingTransition.action}`)}
          onCancel={() => setConfirmingTransition(null)}
          onConfirm={handleTransition}
        />
      )}

      {deleting && (
        <ConfirmDialog
          open
          title={t('homework.deleteTitle')}
          message={t('homework.deleteMessage', { title: deleting.title })}
          confirmLabel={t('common.delete')}
          destructive
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Homework['status'] }) {
  const { t } = useTranslation();
  const tone = status === 'draft' ? 'neutral' : status === 'published' ? 'teal' : status === 'closed' ? 'amber' : 'steel';
  return <Badge tone={tone}>{t(`homework.status.${status}`)}</Badge>;
}

function RowAction({
  label,
  onClick,
  tone = 'default',
}: {
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
}) {
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

function StudentSubmissionStatus({
  hw,
  studentId,
  onSubmit,
}: {
  hw: WithId<Homework>;
  studentId: string;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const ref = useMemo(() => submissionRef(hw.id, studentId), [hw.id, studentId]);
  const { data: submission, loading } = useDoc(ref);

  if (loading) return null;

  const pastDue = Date.now() > hw.dueAt.toMillis();
  const canSubmit = hw.status === 'published' && (!pastDue || hw.allowLate) && (!submission || submission.score === null);

  if (submission?.score !== null && submission?.score !== undefined) {
    return (
      <div className="text-right">
        <Badge tone="teal">{t('homework.graded', { score: submission.score, max: hw.maxScore })}</Badge>
      </div>
    );
  }

  if (submission) {
    return (
      <div className="flex flex-col items-end gap-1 text-right">
        <Badge tone={submission.isLate ? 'amber' : 'steel'}>
          {submission.isLate ? t('homework.submittedLate') : t('homework.submitted')}
        </Badge>
        {canSubmit && <RowAction label={t('homework.resubmit')} onClick={onSubmit} />}
      </div>
    );
  }

  if (!canSubmit) {
    return <Badge tone="coral">{t('homework.notSubmittedClosed')}</Badge>;
  }

  return <RowAction label={t('homework.submit')} onClick={onSubmit} />;
}

function HomeworkFormModal({
  courseId,
  courseGroupIds,
  lessons,
  initial,
  onClose,
}: {
  courseId: string;
  courseGroupIds: string[];
  lessons: { id: string; title: string }[];
  initial: WithId<Homework> | null;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  const isDraftEdit = !initial || initial.status === 'draft';

  const [title, setTitle] = useState(initial?.title ?? '');
  const [instructions, setInstructions] = useState(initial?.instructions ?? '');
  const [publishAt, setPublishAt] = useState(initial ? toDateTimeInputValue(initial.publishAt) : '');
  const [dueAt, setDueAt] = useState(initial ? toDateTimeInputValue(initial.dueAt) : '');
  const [allowLate, setAllowLate] = useState(initial?.allowLate ?? false);
  const [maxScore, setMaxScore] = useState(initial?.maxScore ?? 100);
  const [lessonId, setLessonId] = useState(initial?.lessonId ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    const invalid = picked.find((f) => !isAllowedAttachmentType(f) || f.size > MAX_ATTACHMENT_BYTES);
    if (invalid) {
      setFileError(t('admin.lessons.fileRejected', { name: invalid.name }));
      setFiles([]);
      return;
    }
    setFileError(null);
    setFiles(picked);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      if (!initial) {
        const input: HomeworkInput = {
          title,
          instructions,
          publishAt,
          dueAt,
          allowLate,
          maxScore,
          lessonId: lessonId || null,
          groupIds: courseGroupIds,
        };
        await createHomework(profile, courseId, input, files, reason);
      } else if (isDraftEdit) {
        const input: HomeworkInput = {
          title,
          instructions,
          publishAt,
          dueAt,
          allowLate,
          maxScore,
          lessonId: lessonId || null,
          groupIds: courseGroupIds,
        };
        await updateDraftHomework(profile, initial.id, initial, input, files, reason);
      } else {
        await updateHomeworkContent(
          profile,
          initial.id,
          initial,
          { title, instructions, allowLate, maxScore, lessonId: lessonId || null, groupIds: courseGroupIds },
          files,
          reason,
        );
      }
      onClose();
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={initial ? t('homework.editTitle') : t('homework.newTitle')}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <TextField label={t('homework.homeworkTitle')} required value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextAreaField
          label={t('homework.instructions')}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
        {!isDraftEdit && (
          <p className="rounded-lg bg-surface px-3 py-2 text-xs text-text-muted">{t('homework.datesLocked')}</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t('homework.publishAt')}
            type="datetime-local"
            required
            disabled={!isDraftEdit}
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
          />
          <TextField
            label={t('homework.dueAt')}
            type="datetime-local"
            required
            disabled={!isDraftEdit}
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </div>
        <TextField
          label={t('homework.maxScore')}
          type="number"
          min={1}
          required
          value={maxScore}
          onChange={(e) => setMaxScore(Number(e.target.value))}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allowLate}
            onChange={(e) => setAllowLate(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          {t('homework.allowLate')}
        </label>
        {lessons.length > 0 && (
          <SelectField label={t('homework.linkedLesson')} value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
            <option value="">{t('homework.noLesson')}</option>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </SelectField>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text">{t('admin.lessons.attachments')}</label>
          <input
            type="file"
            multiple
            onChange={handleFileChange}
            className="text-sm text-text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text hover:file:bg-border"
          />
          <p className="text-xs text-text-muted">{t('admin.lessons.allowedTypes')}</p>
          {fileError && (
            <p role="alert" className="text-sm text-coral-500">
              {fileError}
            </p>
          )}
        </div>
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

function AdminOverrideModal({ hw, onClose }: { hw: WithId<Homework>; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  const [publishAt, setPublishAt] = useState(toDateTimeInputValue(hw.publishAt));
  const [dueAt, setDueAt] = useState(toDateTimeInputValue(hw.dueAt));
  const [status, setStatus] = useState(hw.status);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    if (!reason.trim()) {
      toast.show(t('common.reasonRequired'), 'error');
      return;
    }
    setSaving(true);
    try {
      await adminOverrideHomework(profile, hw.id, hw, { publishAt, dueAt, status }, reason.trim());
      onClose();
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t('homework.adminOverrideTitle')}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
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
        <SelectField
          label={t('admin.users.status')}
          value={status}
          onChange={(e) => setStatus(e.target.value as Homework['status'])}
        >
          <option value="published">{t('homework.status.published')}</option>
          <option value="closed">{t('homework.status.closed')}</option>
          <option value="graded">{t('homework.status.graded')}</option>
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

function SubmitHomeworkModal({
  hw,
  student,
  onClose,
}: {
  hw: WithId<Homework>;
  student: { uid: string };
  onClose: () => void;
}) {
  const toast = useToast();
  const { t } = useTranslation();
  const { profile } = useAuth();
  const ref = useMemo(() => submissionRef(hw.id, student.uid), [hw.id, student.uid]);
  const { data: existing } = useDoc(ref);

  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    const invalid = picked.find((f) => !isAllowedAttachmentType(f) || f.size > MAX_ATTACHMENT_BYTES);
    if (invalid) {
      setFileError(t('admin.lessons.fileRejected', { name: invalid.name }));
      setFiles([]);
      return;
    }
    setFileError(null);
    setFiles(picked);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      const existingFiles: HomeworkAttachment[] = existing?.files ?? [];
      await submitHomework(profile, hw.id, hw.courseId, { text: text || existing?.text || '' }, files, existingFiles, hw.dueAt);
      toast.show(t('homework.submitSuccess'), 'success');
      onClose();
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t('homework.submitTitle', { title: hw.title })}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <TextAreaField
          label={t('homework.submissionText')}
          value={text || existing?.text || ''}
          onChange={(e) => setText(e.target.value)}
          rows={5}
        />
        {existing && existing.files.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text">{t('admin.lessons.currentAttachments')}</span>
            <ul className="flex flex-col gap-1">
              {existing.files.map((f) => (
                <li key={f.path}>
                  <AttachmentLink name={f.name} path={f.path} />
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text">{t('homework.addFiles')}</label>
          <input
            type="file"
            multiple
            onChange={handleFileChange}
            className="text-sm text-text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text hover:file:bg-border"
          />
          <p className="text-xs text-text-muted">{t('admin.lessons.allowedTypes')}</p>
          {fileError && (
            <p role="alert" className="text-sm text-coral-500">
              {fileError}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={saving}>
            {existing ? t('homework.resubmit') : t('homework.submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
