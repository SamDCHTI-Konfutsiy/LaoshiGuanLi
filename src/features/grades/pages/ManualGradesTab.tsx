import { useMemo, useState, type FormEvent } from 'react';
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
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import {
  courseManualGradesQuery,
  createManualGrade,
  deleteManualGrade,
  updateManualGrade,
  type ManualGradeInput,
} from '@/features/grades/service';
import { usersQuery } from '@/features/users/service';
import { formatDate } from '@/utils/date';
import type { ManualGrade, WithId } from '@/types/models';

export function ManualGradesTab({ courseId }: { courseId: string }) {
  const { profile } = useAuth();
  const toast = useToast();
  const { t, i18n } = useTranslation();

  const gQuery = useMemo(() => courseManualGradesQuery(courseId), [courseId]);
  const { data: grades, loading } = useCollection(gQuery);
  const stQuery = useMemo(() => usersQuery('student'), []);
  const { data: students } = useCollection(stQuery);
  const studentName = useMemo(() => new Map(students.map((s) => [s.uid, s.name])), [students]);

  const sorted = useMemo(
    () => [...grades].sort((a, b) => (studentName.get(a.studentId) ?? '').localeCompare(studentName.get(b.studentId) ?? '')),
    [grades, studentName],
  );

  const [editing, setEditing] = useState<'new' | WithId<ManualGrade> | null>(null);
  const [deleting, setDeleting] = useState<WithId<ManualGrade> | null>(null);

  async function handleDelete(reason: string) {
    if (!profile || !deleting) return;
    try {
      await deleteManualGrade(profile, deleting.id, deleting, reason);
      toast.show(t('grades.deleted'), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')} disabled={students.length === 0}>
          {t('grades.new')}
        </Button>
      </div>

      <div className="mt-4">
        {loading ? (
          <Spinner label={t('loading')} />
        ) : sorted.length === 0 ? (
          <EmptyState title={t('grades.empty')} />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>{t('auth.name')}</Th>
                <Th>{t('grades.itemTitle')}</Th>
                <Th>{t('homework.score')}</Th>
                <Th>{t('admin.users.joined')}</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {sorted.map((g) => (
                <Tr key={g.id}>
                  <Td className="font-medium">{studentName.get(g.studentId) ?? g.studentId}</Td>
                  <Td>{g.title}</Td>
                  <Td>
                    {g.score} / {g.maxScore}
                  </Td>
                  <Td>{formatDate(g.createdAt, i18n.language)}</Td>
                  <Td className="text-right">
                    <button
                      type="button"
                      onClick={() => setEditing(g)}
                      className="text-sm font-medium text-steel-500 hover:underline"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(g)}
                      className="ml-3 text-sm font-medium text-coral-500 hover:underline"
                    >
                      {t('common.delete')}
                    </button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>

      {editing && (
        <GradeFormModal
          courseId={courseId}
          students={students}
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          open
          title={t('grades.deleteTitle')}
          message={t('grades.deleteMessage')}
          confirmLabel={t('common.delete')}
          destructive
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

function GradeFormModal({
  courseId,
  students,
  initial,
  onClose,
}: {
  courseId: string;
  students: { uid: string; name: string }[];
  initial: WithId<ManualGrade> | null;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();

  const [studentId, setStudentId] = useState(initial?.studentId ?? students[0]?.uid ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [score, setScore] = useState(initial?.score ?? 0);
  const [maxScore, setMaxScore] = useState(initial?.maxScore ?? 100);
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const input: ManualGradeInput = { studentId, title, score, maxScore, comment };
    try {
      if (initial) {
        await updateManualGrade(profile, initial.id, initial, input, reason);
      } else {
        await createManualGrade(profile, courseId, input, reason);
      }
      onClose();
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={initial ? t('grades.editTitle') : t('grades.newTitle')}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <SelectField label={t('auth.name')} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          {students.map((s) => (
            <option key={s.uid} value={s.uid}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <TextField label={t('grades.itemTitle')} required value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label={t('homework.score')} type="number" min={0} required value={score} onChange={(e) => setScore(Number(e.target.value))} />
          <TextField label={t('homework.maxScore')} type="number" min={1} required value={maxScore} onChange={(e) => setMaxScore(Number(e.target.value))} />
        </div>
        <TextAreaField label={t('homework.feedback')} value={comment} onChange={(e) => setComment(e.target.value)} />
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
