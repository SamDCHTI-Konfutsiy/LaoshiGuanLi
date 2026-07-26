import { orderBy, query, Timestamp } from 'firebase/firestore';
import { collectionRef, createWithAudit, deleteWithAudit, updateWithAudit } from '@/services/repository';
import type { Semester, UserProfile } from '@/types/models';

const semestersCol = collectionRef<Semester>('semesters');

export function semestersQuery() {
  return query(semestersCol, orderBy('startAt', 'desc'));
}

export interface SemesterInput {
  name: string;
  startAt: string; // yyyy-mm-dd from <input type="date">
  endAt: string;
  isActive: boolean;
}

function toSemester(input: SemesterInput): Semester {
  return {
    name: input.name,
    startAt: Timestamp.fromDate(new Date(input.startAt)),
    endAt: Timestamp.fromDate(new Date(input.endAt)),
    isActive: input.isActive,
  };
}

export function createSemester(actor: UserProfile, input: SemesterInput, reason: string) {
  return createWithAudit(semestersCol, 'semester', toSemester(input), { actor, reason });
}

export function updateSemester(actor: UserProfile, id: string, before: Semester, input: SemesterInput, reason: string) {
  return updateWithAudit(semestersCol, 'semester', id, before, toSemester(input), { actor, reason });
}

export function deleteSemester(actor: UserProfile, id: string, before: Semester, reason: string) {
  return deleteWithAudit(semestersCol, 'semester', id, before, { actor, reason });
}
