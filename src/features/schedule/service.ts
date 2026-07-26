import { query, serverTimestamp, Timestamp } from 'firebase/firestore';
import { collectionRef, createWithAudit, deleteWithAudit } from '@/services/repository';
import type { ScheduleSlot, UserProfile } from '@/types/models';

const schedulesCol = collectionRef<ScheduleSlot>('schedules');

/** No orderBy — a semester's schedule is small; sort client-side by weekday/time. */
export function schedulesQuery() {
  return query(schedulesCol);
}

export interface ScheduleSlotInput {
  courseId: string;
  groupId: string;
  classroomId: string | null;
  semesterId: string;
  weekday: number;
  startTime: string;
  endTime: string;
}

export function createScheduleSlot(actor: UserProfile, input: ScheduleSlotInput, reason: string) {
  const data: ScheduleSlot = { ...input, createdAt: serverTimestamp() as unknown as Timestamp };
  return createWithAudit(schedulesCol, 'schedule', data, { actor, reason });
}

export function deleteScheduleSlot(actor: UserProfile, id: string, before: ScheduleSlot, reason: string) {
  return deleteWithAudit(schedulesCol, 'schedule', id, before, { actor, reason });
}
