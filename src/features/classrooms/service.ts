import { orderBy, query } from 'firebase/firestore';
import { collectionRef, createWithAudit, deleteWithAudit, updateWithAudit } from '@/services/repository';
import type { Classroom, UserProfile } from '@/types/models';

const classroomsCol = collectionRef<Classroom>('classrooms');

export function classroomsQuery() {
  return query(classroomsCol, orderBy('name', 'asc'));
}

export interface ClassroomInput {
  name: string;
  capacity: number;
  location: string;
}

export function createClassroom(actor: UserProfile, input: ClassroomInput, reason: string) {
  return createWithAudit(classroomsCol, 'classroom', input, { actor, reason });
}

export function updateClassroom(actor: UserProfile, id: string, before: Classroom, input: ClassroomInput, reason: string) {
  return updateWithAudit(classroomsCol, 'classroom', id, before, input, { actor, reason });
}

export function deleteClassroom(actor: UserProfile, id: string, before: Classroom, reason: string) {
  return deleteWithAudit(classroomsCol, 'classroom', id, before, { actor, reason });
}
