import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useCollection } from '@/hooks/useCollection';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { TextAreaField } from '@/components/ui/TextAreaField';
import { SelectField } from '@/components/ui/SelectField';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { AttachmentLink } from '@/components/ui/AttachmentLink';
import { isAllowedAttachmentType, MAX_ATTACHMENT_BYTES } from '@/services/attachments';
import {
  createLesson,
  deleteLesson,
  lessonsQuery,
  removeAttachment,
  updateLesson,
  type LessonInput,
} from '@/features/courses/lessons-service';
import { formatDate } from '@/utils/date';
import type { Lesson, LessonAttachment, WithId } from '@/types/models';

export function LessonsTab({
  courseId,
  canManage,
  classrooms,
}: {
  courseId: string;
  canManage: boolean;
  classrooms: { id: string; name: string }[];
}) {
  const { t, i18n } = useTranslation();
  const lQuery = lessonsQuery(courseId);
  const { data: lessons, loading } = useCollection(lQuery);

  const [editing, setEditing] = useState<WithId<Lesson> | 'new' | null>(null);
  const [deleting, setDeleting] = useState<WithId<Lesson> | null>(null);
  const { profile } = useAuth();

  return (
    <div>
      <div className="flex justify-end">
        {canManage && <Button onClick={() => setEditing('new')}>{t('admin.lessons.new')}</Button>}
      </div>

      <div className="mt-4">
        {loading ? (
          <Spinner label={t('loading')} />
        ) : lessons.length === 0 ? (
          <EmptyState title={t('admin.lessons.empty')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {lessons.map((lesson) => (
              <li key={lesson.id} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-medium">{lesson.title}</h2>
                    <p className="text-sm text-text-muted">{formatDate(lesson.date, i18n.language)}</p>
                  </div>
                  {canManage && (
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setEditing(lesson)}
                        className="text-sm font-medium text-steel-500 hover:underline"
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(lesson)}
                        className="text-sm font-medium text-coral-500 hover:underline"
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  )}
                </div>
                {lesson.description && <p className="mt-2 text-sm text-text-muted">{lesson.description}</p>}
                {lesson.attachments.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1">
                    {lesson.attachments.map((att) => (
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
        <LessonFormModal
          courseId={courseId}
          initial={editing === 'new' ? null : editing}
          classrooms={classrooms}
          nextOrder={editing === 'new' ? lessons.length : editing.order}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting && profile && (
        <ConfirmDialog
          open
          title={t('admin.lessons.deleteTitle')}
          message={t('admin.lessons.deleteMessage', { title: deleting.title })}
          confirmLabel={t('common.delete')}
          destructive
          onCancel={() => setDeleting(null)}
          onConfirm={async (reason) => {
            await deleteLesson(profile, courseId, deleting.id, deleting, reason);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}

function LessonFormModal({
  courseId,
  initial,
  classrooms,
  nextOrder,
  onClose,
}: {
  courseId: string;
  initial: WithId<Lesson> | null;
  classrooms: { id: string; name: string }[];
  nextOrder: number;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();

  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [date, setDate] = useState(initial ? initial.date.toDate().toISOString().slice(0, 10) : '');
  const [classroomId, setClassroomId] = useState(initial?.classroomId ?? '');
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
    const input: LessonInput = { title, description, order: nextOrder, date, classroomId: classroomId || null };
    try {
      if (initial) {
        await updateLesson(profile, courseId, initial.id, initial, input, files, reason);
      } else {
        await createLesson(profile, courseId, input, files, reason);
      }
      onClose();
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={initial ? t('admin.lessons.editTitle') : t('admin.lessons.newTitle')}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <TextField label={t('admin.lessons.lessonTitle')} required value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextAreaField
          label={t('admin.courses.description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <TextField label={t('admin.lessons.date')} type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        <SelectField label={t('admin.lessons.classroom')} value={classroomId} onChange={(e) => setClassroomId(e.target.value)}>
          <option value="">{t('admin.lessons.noClassroom')}</option>
          {classrooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
            </option>
          ))}
        </SelectField>
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
        {initial && initial.attachments.length > 0 && (
          <ExistingAttachments courseId={courseId} lessonId={initial.id} lesson={initial} />
        )}
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

function ExistingAttachments({
  courseId,
  lessonId,
  lesson,
}: {
  courseId: string;
  lessonId: string;
  lesson: WithId<Lesson>;
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  const [busyPath, setBusyPath] = useState<string | null>(null);

  async function handleRemove(att: LessonAttachment) {
    if (!profile) return;
    setBusyPath(att.path);
    try {
      await removeAttachment(profile, courseId, lessonId, lesson, att, '');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setBusyPath(null);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text">{t('admin.lessons.currentAttachments')}</span>
      <ul className="flex flex-col gap-1">
        {lesson.attachments.map((att) => (
          <li key={att.path} className="flex items-center justify-between text-sm">
            <span className="text-text-muted">{att.name}</span>
            <button
              type="button"
              disabled={busyPath === att.path}
              onClick={() => void handleRemove(att)}
              className="font-medium text-coral-500 hover:underline disabled:opacity-50"
            >
              {t('common.remove')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
