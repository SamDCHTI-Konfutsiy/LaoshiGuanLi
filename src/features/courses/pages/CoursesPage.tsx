import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
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
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { coursesQuery, createCourse, deleteCourse, updateCourse, type CourseInput } from '@/features/courses/service';
import { groupsQuery } from '@/features/groups/service';
import { semestersQuery } from '@/features/semesters/service';
import { usersQuery } from '@/features/users/service';
import type { Course, UserProfile, WithId } from '@/types/models';

export function CoursesPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();

  const cQuery = useMemo(() => coursesQuery(), []);
  const { data: courses, loading } = useCollection(cQuery);
  const tQuery = useMemo(() => usersQuery('teacher'), []);
  const { data: teachers } = useCollection(tQuery);
  const gQuery = useMemo(() => groupsQuery(), []);
  const { data: groups } = useCollection(gQuery);
  const sQuery = useMemo(() => semestersQuery(), []);
  const { data: semesters } = useCollection(sQuery);

  const teacherName = useMemo(() => new Map(teachers.map((tch) => [tch.uid, tch.name])), [teachers]);

  const [editing, setEditing] = useState<WithId<Course> | 'new' | null>(null);
  const [deleting, setDeleting] = useState<WithId<Course> | null>(null);

  async function handleSave(input: CourseInput, reason: string) {
    if (!profile) return;
    try {
      if (editing === 'new') {
        await createCourse(profile, input, reason);
        toast.show(t('admin.courses.created'), 'success');
      } else if (editing) {
        await updateCourse(profile, editing.id, editing, input, reason);
        toast.show(t('admin.courses.updated'), 'success');
      }
      setEditing(null);
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    }
  }

  async function handleDelete(reason: string) {
    if (!profile || !deleting) return;
    try {
      await deleteCourse(profile, deleting.id, deleting, reason);
      toast.show(t('admin.courses.deleted'), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold">{t('admin.courses.title')}</h1>
        <Button onClick={() => setEditing('new')} disabled={teachers.length === 0}>
          {t('admin.courses.new')}
        </Button>
      </div>
      {teachers.length === 0 && (
        <p className="mt-2 text-sm text-text-muted">{t('admin.courses.needTeacherFirst')}</p>
      )}

      {loading ? (
        <Spinner label={t('loading')} />
      ) : courses.length === 0 ? (
        <div className="mt-6">
          <EmptyState title={t('admin.courses.empty')} />
        </div>
      ) : (
        <div className="mt-6">
          <Table>
            <Thead>
              <Tr>
                <Th>{t('admin.courses.courseTitle')}</Th>
                <Th>{t('admin.courses.teacher')}</Th>
                <Th>{t('admin.courses.groups')}</Th>
                <Th>{t('admin.courses.status')}</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {courses.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-medium">
                    <Link to={`/admin/courses/${c.id}`} className="text-steel-500 hover:underline">
                      {c.title}
                    </Link>
                  </Td>
                  <Td>{teacherName.get(c.teacherId) ?? '—'}</Td>
                  <Td>{c.groupIds.length}</Td>
                  <Td>
                    {c.archived ? (
                      <Badge>{t('admin.courses.archived')}</Badge>
                    ) : (
                      <Badge tone="teal">{t('admin.courses.active')}</Badge>
                    )}
                  </Td>
                  <Td className="text-right">
                    <button
                      type="button"
                      onClick={() => setEditing(c)}
                      className="text-sm font-medium text-steel-500 hover:underline"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(c)}
                      className="ml-3 text-sm font-medium text-coral-500 hover:underline"
                    >
                      {t('common.delete')}
                    </button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      {editing && (
        <CourseFormModal
          initial={editing === 'new' ? null : editing}
          teachers={teachers}
          groups={groups}
          semesters={semesters}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      {deleting && (
        <ConfirmDialog
          open
          title={t('admin.courses.deleteTitle')}
          message={t('admin.courses.deleteMessage', { title: deleting.title })}
          confirmLabel={t('common.delete')}
          destructive
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

function CourseFormModal({
  initial,
  teachers,
  groups,
  semesters,
  onClose,
  onSave,
}: {
  initial: WithId<Course> | null;
  teachers: WithId<UserProfile>[];
  groups: { id: string; name: string }[];
  semesters: { id: string; name: string }[];
  onClose: () => void;
  onSave: (input: CourseInput, reason: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [teacherId, setTeacherId] = useState(initial?.teacherId ?? '');
  const [groupIds, setGroupIds] = useState<string[]>(initial?.groupIds ?? []);
  const [semesterId, setSemesterId] = useState(initial?.semesterId ?? '');
  const [archived, setArchived] = useState(initial?.archived ?? false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!teacherId && teachers[0]) setTeacherId(teachers[0].uid);
  }, [teachers, teacherId]);

  useEffect(() => {
    if (!semesterId && semesters[0]) setSemesterId(semesters[0].id);
  }, [semesters, semesterId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!teacherId || !semesterId) {
      toast.show(t('admin.groups.selectSemester'), 'error');
      return;
    }
    setSaving(true);
    try {
      await onSave({ title, description, teacherId, groupIds, semesterId, archived }, reason);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={initial ? t('admin.courses.editTitle') : t('admin.courses.newTitle')}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <TextField
          label={t('admin.courses.courseTitle')}
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <TextAreaField
          label={t('admin.courses.description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <SelectField
          label={t('admin.courses.teacher')}
          required
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
        >
          {teachers.map((tch) => (
            <option key={tch.uid} value={tch.uid}>
              {tch.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('admin.courses.semester')}
          required
          value={semesterId}
          onChange={(e) => setSemesterId(e.target.value)}
        >
          <option value="" disabled>
            {t('admin.groups.selectSemester')}
          </option>
          {semesters.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('admin.courses.groups')}
          multiple
          value={groupIds}
          onChange={(e) => setGroupIds(Array.from(e.target.selectedOptions, (o) => o.value))}
          className="h-auto py-1"
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </SelectField>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          {t('admin.courses.archived')}
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
