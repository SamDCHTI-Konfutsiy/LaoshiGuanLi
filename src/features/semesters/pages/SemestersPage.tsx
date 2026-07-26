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
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import {
  createSemester,
  deleteSemester,
  semestersQuery,
  updateSemester,
  type SemesterInput,
} from '@/features/semesters/service';
import { formatDate, toDateInputValue } from '@/utils/date';
import type { Semester, WithId } from '@/types/models';

export function SemestersPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const { t, i18n } = useTranslation();
  const semQuery = useMemo(() => semestersQuery(), []);
  const { data: semesters, loading } = useCollection(semQuery);

  const [editing, setEditing] = useState<WithId<Semester> | 'new' | null>(null);
  const [deleting, setDeleting] = useState<WithId<Semester> | null>(null);

  async function handleSave(input: SemesterInput, reason: string) {
    if (!profile) return;
    try {
      if (editing === 'new') {
        await createSemester(profile, input, reason);
        toast.show(t('admin.semesters.created'), 'success');
      } else if (editing) {
        await updateSemester(profile, editing.id, editing, input, reason);
        toast.show(t('admin.semesters.updated'), 'success');
      }
      setEditing(null);
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    }
  }

  async function handleDelete(reason: string) {
    if (!profile || !deleting) return;
    try {
      await deleteSemester(profile, deleting.id, deleting, reason);
      toast.show(t('admin.semesters.deleted'), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold">{t('admin.semesters.title')}</h1>
        <Button onClick={() => setEditing('new')}>{t('admin.semesters.new')}</Button>
      </div>

      {loading ? (
        <Spinner label={t('loading')} />
      ) : semesters.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={t('admin.semesters.empty')}
            action={<Button onClick={() => setEditing('new')}>{t('admin.semesters.new')}</Button>}
          />
        </div>
      ) : (
        <div className="mt-6">
          <Table>
            <Thead>
              <Tr>
                <Th>{t('admin.semesters.name')}</Th>
                <Th>{t('admin.semesters.startAt')}</Th>
                <Th>{t('admin.semesters.endAt')}</Th>
                <Th>{t('admin.semesters.status')}</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {semesters.map((s) => (
                <Tr key={s.id}>
                  <Td className="font-medium">{s.name}</Td>
                  <Td>{formatDate(s.startAt, i18n.language)}</Td>
                  <Td>{formatDate(s.endAt, i18n.language)}</Td>
                  <Td>
                    {s.isActive ? (
                      <Badge tone="teal">{t('admin.semesters.active')}</Badge>
                    ) : (
                      <Badge>{t('admin.semesters.inactive')}</Badge>
                    )}
                  </Td>
                  <Td className="text-right">
                    <button
                      type="button"
                      onClick={() => setEditing(s)}
                      className="text-sm font-medium text-steel-500 hover:underline"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(s)}
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
        <SemesterFormModal
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      {deleting && (
        <ConfirmDialog
          open
          title={t('admin.semesters.deleteTitle')}
          message={t('admin.semesters.deleteMessage', { name: deleting.name })}
          confirmLabel={t('common.delete')}
          destructive
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

function SemesterFormModal({
  initial,
  onClose,
  onSave,
}: {
  initial: WithId<Semester> | null;
  onClose: () => void;
  onSave: (input: SemesterInput, reason: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [startAt, setStartAt] = useState(initial ? toDateInputValue(initial.startAt) : '');
  const [endAt, setEndAt] = useState(initial ? toDateInputValue(initial.endAt) : '');
  const [isActive, setIsActive] = useState(initial?.isActive ?? false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ name, startAt, endAt, isActive }, reason);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={initial ? t('admin.semesters.editTitle') : t('admin.semesters.newTitle')}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <TextField label={t('admin.semesters.name')} required value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t('admin.semesters.startAt')}
            type="date"
            required
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
          />
          <TextField
            label={t('admin.semesters.endAt')}
            type="date"
            required
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          {t('admin.semesters.active')}
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
