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
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { createScheduleSlot, deleteScheduleSlot, schedulesQuery, type ScheduleSlotInput } from '@/features/schedule/service';
import { coursesQuery } from '@/features/courses/service';
import { groupsQuery } from '@/features/groups/service';
import { classroomsQuery } from '@/features/classrooms/service';
import { semestersQuery } from '@/features/semesters/service';
import type { ScheduleSlot, WithId } from '@/types/models';

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export function SchedulePage() {
  const { profile } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  const isAdmin = profile?.role === 'admin';

  const sQuery = useMemo(() => schedulesQuery(), []);
  const { data: slots, loading } = useCollection(sQuery);
  const cQuery = useMemo(() => coursesQuery(), []);
  const { data: courses } = useCollection(cQuery);
  const courseName = useMemo(() => new Map(courses.map((c) => [c.id, c.title])), [courses]);
  const gQuery = useMemo(() => groupsQuery(), []);
  const { data: groups } = useCollection(gQuery);
  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const rQuery = useMemo(() => classroomsQuery(), []);
  const { data: classrooms } = useCollection(rQuery);
  const classroomName = useMemo(() => new Map(classrooms.map((r) => [r.id, r.name])), [classrooms]);

  const byWeekday = useMemo(() => {
    const map = new Map<number, WithId<ScheduleSlot>[]>();
    for (const day of WEEKDAYS) map.set(day, []);
    for (const slot of slots) map.get(slot.weekday)?.push(slot);
    for (const day of WEEKDAYS) map.get(day)?.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [slots]);

  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<WithId<ScheduleSlot> | null>(null);

  async function handleDelete(reason: string) {
    if (!profile || !deleting) return;
    try {
      await deleteScheduleSlot(profile, deleting.id, deleting, reason);
      toast.show(t('schedule.deleted'), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold">{t('nav.schedule')}</h1>
        {isAdmin && <Button onClick={() => setCreating(true)}>{t('schedule.new')}</Button>}
      </div>

      <div className="mt-6">
        {loading ? (
          <Spinner label={t('loading')} />
        ) : slots.length === 0 ? (
          <EmptyState title={t('schedule.empty')} />
        ) : (
          <div className="flex flex-col gap-4">
            {WEEKDAYS.map((day) => {
              const daySlots = byWeekday.get(day) ?? [];
              if (daySlots.length === 0) return null;
              return (
                <div key={day}>
                  <h2 className="font-medium">{t(`schedule.weekday.${day}`)}</h2>
                  <ul className="mt-2 flex flex-col gap-2">
                    {daySlots.map((slot) => (
                      <li key={slot.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div className="text-sm">
                          <span className="font-mono text-text-muted">
                            {slot.startTime}–{slot.endTime}
                          </span>{' '}
                          <span className="font-medium">{courseName.get(slot.courseId) ?? '—'}</span>{' '}
                          <span className="text-text-muted">
                            · {groupName.get(slot.groupId) ?? '—'}
                            {slot.classroomId && ` · ${classroomName.get(slot.classroomId) ?? ''}`}
                          </span>
                        </div>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setDeleting(slot)}
                            className="text-sm font-medium text-coral-500 hover:underline"
                          >
                            {t('common.delete')}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {creating && (
        <ScheduleFormModal courses={courses} groups={groups} classrooms={classrooms} onClose={() => setCreating(false)} />
      )}

      {deleting && (
        <ConfirmDialog
          open
          title={t('schedule.deleteTitle')}
          message={t('schedule.deleteMessage')}
          confirmLabel={t('common.delete')}
          destructive
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

function ScheduleFormModal({
  courses,
  groups,
  classrooms,
  onClose,
}: {
  courses: { id: string; title: string; groupIds: string[] }[];
  groups: { id: string; name: string }[];
  classrooms: { id: string; name: string }[];
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  const sQuery = useMemo(() => semestersQuery(), []);
  const { data: semesters } = useCollection(sQuery);

  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const [groupId, setGroupId] = useState('');
  const [classroomId, setClassroomId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [weekday, setWeekday] = useState(0);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const course = courses.find((c) => c.id === courseId);
  const availableGroups = groups.filter((g) => course?.groupIds.includes(g.id));

  // courses/semesters/groups all load asynchronously — a useState
  // initializer only runs once, before that data can possibly have
  // arrived, so relying on it here would leave these silently empty
  // forever (the <select> would still visually show the first option,
  // masking the mismatch). Sync explicitly once data is in, and whenever
  // the course changes.
  useEffect(() => {
    if (!courseId && courses[0]) setCourseId(courses[0].id);
  }, [courses, courseId]);

  useEffect(() => {
    if (!semesterId && semesters[0]) setSemesterId(semesters[0].id);
  }, [semesters, semesterId]);

  useEffect(() => {
    if (!availableGroups.some((g) => g.id === groupId)) {
      setGroupId(availableGroups[0]?.id ?? '');
    }
    // Deliberately not depending on groupId's own value beyond the .some()
    // check above — this only needs to re-run when the candidate list
    // (course/availableGroups) changes, not on every groupId change.
  }, [courseId, availableGroups]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    if (!groupId || !semesterId) {
      toast.show(t('schedule.selectGroupAndSemester'), 'error');
      return;
    }
    setSaving(true);
    const input: ScheduleSlotInput = {
      courseId,
      groupId,
      classroomId: classroomId || null,
      semesterId,
      weekday,
      startTime,
      endTime,
    };
    try {
      await createScheduleSlot(profile, input, reason);
      onClose();
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t('schedule.new')}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <SelectField label={t('admin.courses.title')} required value={courseId} onChange={(e) => { setCourseId(e.target.value); setGroupId(''); }}>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </SelectField>
        <SelectField label={t('admin.groups.title')} required value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="" disabled>
            {t('announcements.selectGroup')}
          </option>
          {availableGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </SelectField>
        <SelectField label={t('admin.semesters.title')} required value={semesterId} onChange={(e) => setSemesterId(e.target.value)}>
          {semesters.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <SelectField label={t('admin.lessons.classroom')} value={classroomId} onChange={(e) => setClassroomId(e.target.value)}>
          <option value="">{t('admin.lessons.noClassroom')}</option>
          {classrooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </SelectField>
        <SelectField label={t('schedule.weekday.label')} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
          {WEEKDAYS.map((day) => (
            <option key={day} value={day}>
              {t(`schedule.weekday.${day}`)}
            </option>
          ))}
        </SelectField>
        <div className="grid grid-cols-2 gap-3">
          <TextField label={t('schedule.startTime')} type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <TextField label={t('schedule.endTime')} type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} />
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
