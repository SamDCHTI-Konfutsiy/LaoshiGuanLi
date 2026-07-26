import { useEffect, useMemo, useState, type FormEvent } from 'react';
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
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  groupMembersQuery,
  groupsQuery,
  removeGroupMember,
  updateGroup,
  type GroupInput,
} from '@/features/groups/service';
import { semestersQuery } from '@/features/semesters/service';
import { usersQuery } from '@/features/users/service';
import type { Group, UserProfile, WithId } from '@/types/models';

export function GroupsPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();

  const gQuery = useMemo(() => groupsQuery(), []);
  const { data: groups, loading } = useCollection(gQuery);
  const sQuery = useMemo(() => semestersQuery(), []);
  const { data: semesters } = useCollection(sQuery);
  const tQuery = useMemo(() => usersQuery('teacher'), []);
  const { data: teachers } = useCollection(tQuery);

  const semesterName = useMemo(() => new Map(semesters.map((s) => [s.id, s.name])), [semesters]);

  const [editing, setEditing] = useState<WithId<Group> | 'new' | null>(null);
  const [deleting, setDeleting] = useState<WithId<Group> | null>(null);
  const [managing, setManaging] = useState<WithId<Group> | null>(null);

  async function handleSave(input: GroupInput, reason: string) {
    if (!profile) return;
    try {
      if (editing === 'new') {
        await createGroup(profile, input, reason);
        toast.show(t('admin.groups.created'), 'success');
      } else if (editing) {
        await updateGroup(profile, editing.id, editing, input, reason);
        toast.show(t('admin.groups.updated'), 'success');
      }
      setEditing(null);
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    }
  }

  async function handleDelete(reason: string) {
    if (!profile || !deleting) return;
    if (deleting.memberCount > 0) {
      toast.show(t('admin.groups.cannotDeleteWithMembers'), 'error');
      setDeleting(null);
      return;
    }
    try {
      await deleteGroup(profile, deleting.id, deleting, reason);
      toast.show(t('admin.groups.deleted'), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold">{t('admin.groups.title')}</h1>
        <Button onClick={() => setEditing('new')}>{t('admin.groups.new')}</Button>
      </div>

      {loading ? (
        <Spinner label={t('loading')} />
      ) : groups.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={t('admin.groups.empty')}
            action={<Button onClick={() => setEditing('new')}>{t('admin.groups.new')}</Button>}
          />
        </div>
      ) : (
        <div className="mt-6">
          <Table>
            <Thead>
              <Tr>
                <Th>{t('admin.groups.name')}</Th>
                <Th>{t('admin.groups.semester')}</Th>
                <Th>{t('admin.groups.teachers')}</Th>
                <Th>{t('admin.groups.members')}</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {groups.map((g) => (
                <Tr key={g.id}>
                  <Td className="font-medium">{g.name}</Td>
                  <Td>{semesterName.get(g.semesterId) ?? '—'}</Td>
                  <Td>{g.teacherIds.length}</Td>
                  <Td>
                    <Badge tone="steel">{g.memberCount}</Badge>
                  </Td>
                  <Td className="text-right">
                    <button
                      type="button"
                      onClick={() => setManaging(g)}
                      className="text-sm font-medium text-steel-500 hover:underline"
                    >
                      {t('admin.groups.manageMembers')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(g)}
                      className="ml-3 text-sm font-medium text-steel-500 hover:underline"
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
        </div>
      )}

      {editing && (
        <GroupFormModal
          initial={editing === 'new' ? null : editing}
          semesters={semesters}
          teachers={teachers}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      {managing && <MembersModal group={managing} onClose={() => setManaging(null)} />}

      {deleting && (
        <ConfirmDialog
          open
          title={t('admin.groups.deleteTitle')}
          message={t('admin.groups.deleteMessage', { name: deleting.name })}
          confirmLabel={t('common.delete')}
          destructive
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

function GroupFormModal({
  initial,
  semesters,
  teachers,
  onClose,
  onSave,
}: {
  initial: WithId<Group> | null;
  semesters: { id: string; name: string }[];
  teachers: WithId<UserProfile>[];
  onClose: () => void;
  onSave: (input: GroupInput, reason: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? '');
  const [semesterId, setSemesterId] = useState(initial?.semesterId ?? '');
  const [teacherIds, setTeacherIds] = useState<string[]>(initial?.teacherIds ?? []);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!semesterId && semesters[0]) setSemesterId(semesters[0].id);
  }, [semesters, semesterId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!semesterId) {
      toast.show(t('admin.groups.selectSemester'), 'error');
      return;
    }
    setSaving(true);
    try {
      await onSave({ name, semesterId, teacherIds }, reason);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={initial ? t('admin.groups.editTitle') : t('admin.groups.newTitle')}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <TextField label={t('admin.groups.name')} required value={name} onChange={(e) => setName(e.target.value)} />
        <SelectField
          label={t('admin.groups.semester')}
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
          label={t('admin.groups.teachers')}
          multiple
          value={teacherIds}
          onChange={(e) => setTeacherIds(Array.from(e.target.selectedOptions, (o) => o.value))}
          className="h-auto py-1"
        >
          {teachers.map((tch) => (
            <option key={tch.uid} value={tch.uid}>
              {tch.name}
            </option>
          ))}
        </SelectField>
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

function MembersModal({ group, onClose }: { group: WithId<Group>; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();

  const mQuery = useMemo(() => groupMembersQuery(group.id), [group.id]);
  const { data: members, loading: membersLoading } = useCollection(mQuery);
  const sQuery = useMemo(() => usersQuery('student'), []);
  const { data: students, loading: studentsLoading } = useCollection(sQuery);

  const [adding, setAdding] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [busy, setBusy] = useState(false);

  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);
  const studentByUid = useMemo(() => new Map(students.map((s) => [s.uid, s])), [students]);
  const availableStudents = useMemo(() => students.filter((s) => !memberIds.has(s.uid)), [students, memberIds]);

  async function handleAdd() {
    const student = studentByUid.get(selectedStudent);
    if (!profile || !student) return;
    setBusy(true);
    try {
      await addGroupMember(profile, group, student, '');
      setSelectedStudent('');
      setAdding(false);
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(uid: string) {
    const student = studentByUid.get(uid);
    if (!profile || !student) return;
    setBusy(true);
    try {
      await removeGroupMember(profile, group, student, '');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setBusy(false);
    }
  }

  const loading = membersLoading || studentsLoading;

  return (
    <Modal open onClose={onClose} title={t('admin.groups.membersTitle', { name: group.name })}>
      {loading ? (
        <Spinner label={t('loading')} />
      ) : (
        <>
          <div className="max-h-64 overflow-y-auto">
            {members.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-muted">{t('admin.groups.noMembers')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between py-2">
                    <span className="text-sm">{studentByUid.get(m.id)?.name ?? m.id}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleRemove(m.id)}
                      className="text-sm font-medium text-coral-500 hover:underline disabled:opacity-50"
                    >
                      {t('common.remove')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {adding ? (
            <div className="mt-4 flex items-end gap-2">
              <div className="flex-1">
                <SelectField
                  label={t('admin.groups.addStudent')}
                  value={selectedStudent}
                  onChange={(e) => setSelectedStudent(e.target.value)}
                >
                  <option value="" disabled>
                    {t('admin.groups.selectStudent')}
                  </option>
                  {availableStudents.map((s) => (
                    <option key={s.uid} value={s.uid}>
                      {s.name}
                    </option>
                  ))}
                </SelectField>
              </div>
              <Button loading={busy} disabled={!selectedStudent} onClick={() => void handleAdd()}>
                {t('common.add')}
              </Button>
            </div>
          ) : (
            <Button variant="secondary" className="mt-4" onClick={() => setAdding(true)}>
              {t('admin.groups.addStudent')}
            </Button>
          )}
        </>
      )}
    </Modal>
  );
}
