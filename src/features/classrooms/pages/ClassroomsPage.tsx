import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useCollection } from '@/hooks/useCollection';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { TextAreaField } from '@/components/ui/TextAreaField';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import {
  classroomsQuery,
  createClassroom,
  deleteClassroom,
  updateClassroom,
  type ClassroomInput,
} from '@/features/classrooms/service';
import type { Classroom, WithId } from '@/types/models';

export function ClassroomsPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  const roomsQuery = useMemo(() => classroomsQuery(), []);
  const { data: classrooms, loading } = useCollection(roomsQuery);

  const [editing, setEditing] = useState<WithId<Classroom> | 'new' | null>(null);
  const [deleting, setDeleting] = useState<WithId<Classroom> | null>(null);

  async function handleSave(input: ClassroomInput, reason: string) {
    if (!profile) return;
    try {
      if (editing === 'new') {
        await createClassroom(profile, input, reason);
        toast.show(t('admin.classrooms.created'), 'success');
      } else if (editing) {
        await updateClassroom(profile, editing.id, editing, input, reason);
        toast.show(t('admin.classrooms.updated'), 'success');
      }
      setEditing(null);
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    }
  }

  async function handleDelete(reason: string) {
    if (!profile || !deleting) return;
    try {
      await deleteClassroom(profile, deleting.id, deleting, reason);
      toast.show(t('admin.classrooms.deleted'), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold">{t('admin.classrooms.title')}</h1>
        <Button onClick={() => setEditing('new')}>{t('admin.classrooms.new')}</Button>
      </div>

      {loading ? (
        <Spinner label={t('loading')} />
      ) : classrooms.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={t('admin.classrooms.empty')}
            action={<Button onClick={() => setEditing('new')}>{t('admin.classrooms.new')}</Button>}
          />
        </div>
      ) : (
        <div className="mt-6">
          <Table>
            <Thead>
              <Tr>
                <Th>{t('admin.classrooms.name')}</Th>
                <Th>{t('admin.classrooms.location')}</Th>
                <Th>{t('admin.classrooms.capacity')}</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {classrooms.map((room) => (
                <Tr key={room.id}>
                  <Td className="font-medium">{room.name}</Td>
                  <Td>{room.location}</Td>
                  <Td>{room.capacity}</Td>
                  <Td className="text-right">
                    <button
                      type="button"
                      onClick={() => setEditing(room)}
                      className="text-sm font-medium text-steel-500 hover:underline"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(room)}
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
        <ClassroomFormModal
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      {deleting && (
        <ConfirmDialog
          open
          title={t('admin.classrooms.deleteTitle')}
          message={t('admin.classrooms.deleteMessage', { name: deleting.name })}
          confirmLabel={t('common.delete')}
          destructive
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

function ClassroomFormModal({
  initial,
  onClose,
  onSave,
}: {
  initial: WithId<Classroom> | null;
  onClose: () => void;
  onSave: (input: ClassroomInput, reason: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [capacity, setCapacity] = useState(initial?.capacity ?? 20);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ name, location, capacity }, reason);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={initial ? t('admin.classrooms.editTitle') : t('admin.classrooms.newTitle')}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <TextField label={t('admin.classrooms.name')} required value={name} onChange={(e) => setName(e.target.value)} />
        <TextField
          label={t('admin.classrooms.location')}
          required
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <TextField
          label={t('admin.classrooms.capacity')}
          type="number"
          min={1}
          required
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value))}
        />
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
