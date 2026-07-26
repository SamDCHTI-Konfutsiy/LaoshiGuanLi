import { query, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import { collectionRef, createWithAudit, updateWithAudit } from '@/services/repository';
import type { AttendanceStatus } from '@/types/enums';
import type { AttendanceRecord, UserProfile } from '@/types/models';

const attendanceCol = collectionRef<AttendanceRecord>('attendance');

/** No orderBy — a course's session list is small; sort client-side by date. */
export function attendanceQuery(courseId: string) {
  return query(attendanceCol, where('courseId', '==', courseId));
}

export interface TakeAttendanceInput {
  groupId: string;
  lessonId: string | null;
  date: string; // yyyy-mm-dd
  records: Record<string, AttendanceStatus>;
}

export function takeAttendance(actor: UserProfile, courseId: string, input: TakeAttendanceInput, reason: string) {
  const data: AttendanceRecord = {
    courseId,
    groupId: input.groupId,
    lessonId: input.lessonId,
    date: Timestamp.fromDate(new Date(input.date)),
    records: input.records,
    takenBy: actor.uid,
    createdAt: serverTimestamp() as unknown as Timestamp,
  };
  return createWithAudit(attendanceCol, 'attendance', data, { actor, reason });
}

export function updateAttendance(
  actor: UserProfile,
  id: string,
  before: AttendanceRecord,
  records: Record<string, AttendanceStatus>,
  reason: string,
) {
  return updateWithAudit(attendanceCol, 'attendance', id, before, { ...before, records }, { actor, reason });
}
