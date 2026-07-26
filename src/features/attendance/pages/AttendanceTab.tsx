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
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { attendanceQuery, takeAttendance, updateAttendance } from '@/features/attendance/service';
import { groupMembersQuery } from '@/features/groups/service';
import { usersQuery } from '@/features/users/service';
import { formatDate } from '@/utils/date';
import { ATTENDANCE_STATUSES, type AttendanceStatus } from '@/types/enums';
import type { AttendanceRecord, WithId } from '@/types/models';

const STATUS_TONE: Record<AttendanceStatus, 'teal' | 'amber' | 'coral' | 'steel'> = {
  present: 'teal',
  late: 'amber',
  absent: 'coral',
  excused: 'steel',
};

export function AttendanceTab({
  courseId,
  canManage,
  groups,
  lessons,
}: {
  courseId: string;
  canManage: boolean;
  groups: { id: string; name: string }[];
  lessons: { id: string; title: string }[];
}) {
  const { t, i18n } = useTranslation();
  const aQuery = useMemo(() => attendanceQuery(courseId), [courseId]);
  const { data: sessions, loading } = useCollection(aQuery);
  const stQuery = useMemo(() => usersQuery('student'), []);
  const { data: students } = useCollection(stQuery);
  const studentName = useMemo(() => new Map(students.map((s) => [s.uid, s.name])), [students]);

  const sorted = useMemo(() => [...sessions].sort((a, b) => b.date.toMillis() - a.date.toMillis()), [sessions]);

  const [taking, setTaking] = useState<'new' | WithId<AttendanceRecord> | null>(null);

  return (
    <div>
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => setTaking('new')} disabled={groups.length === 0}>
            {t('attendance.take')}
          </Button>
        </div>
      )}
      {canManage && groups.length === 0 && <p className="mt-2 text-sm text-text-muted">{t('attendance.needGroup')}</p>}

      <div className="mt-4">
        {loading ? (
          <Spinner label={t('loading')} />
        ) : sorted.length === 0 ? (
          <EmptyState title={t('attendance.empty')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {sorted.map((session) => {
              const counts = Object.values(session.records).reduce<Record<string, number>>((acc, status) => {
                acc[status] = (acc[status] ?? 0) + 1;
                return acc;
              }, {});
              return (
                <li key={session.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{formatDate(session.date, i18n.language)}</span>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => setTaking(session)}
                        className="text-sm font-medium text-steel-500 hover:underline"
                      >
                        {t('common.edit')}
                      </button>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ATTENDANCE_STATUSES.map(
                      (status) =>
                        counts[status] && (
                          <Badge key={status} tone={STATUS_TONE[status]}>
                            {t(`attendance.status.${status}`)}: {counts[status]}
                          </Badge>
                        ),
                    )}
                  </div>
                  {!canManage && (
                    <ul className="mt-2 flex flex-col gap-1 text-sm">
                      {Object.entries(session.records).map(([uid, status]) => (
                        <li key={uid} className="flex justify-between">
                          <span>{studentName.get(uid) ?? uid}</span>
                          <Badge tone={STATUS_TONE[status]}>{t(`attendance.status.${status}`)}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {taking && (
        <TakeAttendanceModal
          courseId={courseId}
          groups={groups}
          lessons={lessons}
          initial={taking === 'new' ? null : taking}
          onClose={() => setTaking(null)}
        />
      )}
    </div>
  );
}

function TakeAttendanceModal({
  courseId,
  groups,
  lessons,
  initial,
  onClose,
}: {
  courseId: string;
  groups: { id: string; name: string }[];
  lessons: { id: string; title: string }[];
  initial: WithId<AttendanceRecord> | null;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();

  const [groupId, setGroupId] = useState(initial?.groupId ?? groups[0]?.id ?? '');
  const [lessonId, setLessonId] = useState(initial?.lessonId ?? '');
  const [date, setDate] = useState(initial ? initial.date.toDate().toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>(initial?.records ?? {});
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const membersQ = useMemo(() => groupMembersQuery(groupId), [groupId]);
  const { data: members, loading: membersLoading } = useCollection(membersQ);
  const stQuery = useMemo(() => usersQuery('student'), []);
  const { data: students } = useCollection(stQuery);
  const studentName = useMemo(() => new Map(students.map((s) => [s.uid, s.name])), [students]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      if (initial) {
        await updateAttendance(profile, initial.id, initial, statuses, reason);
      } else {
        await takeAttendance(profile, courseId, { groupId, lessonId: lessonId || null, date, records: statuses }, reason);
      }
      onClose();
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={initial ? t('attendance.editTitle') : t('attendance.take')}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        {!initial && (
          <>
            <SelectField label={t('admin.groups.title')} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </SelectField>
            <TextField label={t('attendance.date')} type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
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
          </>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text">{t('attendance.students')}</span>
          {membersLoading ? (
            <Spinner label={t('loading')} />
          ) : members.length === 0 ? (
            <p className="text-sm text-text-muted">{t('admin.groups.noMembers')}</p>
          ) : (
            members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2">
                <span className="text-sm">{studentName.get(m.id) ?? m.id}</span>
                <div className="flex gap-1">
                  {ATTENDANCE_STATUSES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setStatuses((prev) => ({ ...prev, [m.id]: status }))}
                      aria-pressed={statuses[m.id] === status}
                      className={
                        'rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ' +
                        (statuses[m.id] === status
                          ? 'border-steel-500 bg-steel-50 text-steel-600 dark:bg-surface-raised dark:text-steel-300'
                          : 'border-border text-text-muted hover:text-text')
                      }
                    >
                      {t(`attendance.status.${status}`)}
                    </button>
                  ))}
                </div>
              </div>
            ))
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
