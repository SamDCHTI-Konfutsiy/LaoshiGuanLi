import { query, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import { collectionRef, createWithAudit, deleteWithAudit, updateWithAudit } from '@/services/repository';
import type { ManualGrade, UserProfile } from '@/types/models';

const gradesCol = collectionRef<ManualGrade>('manualGrades');

/** No orderBy — a course's or student's grade list is small; sort client-side. */
export function courseManualGradesQuery(courseId: string) {
  return query(gradesCol, where('courseId', '==', courseId));
}

export function studentManualGradesQuery(studentId: string) {
  return query(gradesCol, where('studentId', '==', studentId));
}

export interface ManualGradeInput {
  studentId: string;
  title: string;
  score: number;
  maxScore: number;
  comment: string;
}

export function createManualGrade(actor: UserProfile, courseId: string, input: ManualGradeInput, reason: string) {
  const data: ManualGrade = {
    ...input,
    courseId,
    createdBy: actor.uid,
    createdAt: serverTimestamp() as unknown as Timestamp,
  };
  return createWithAudit(gradesCol, 'manualGrade', data, { actor, reason });
}

export function updateManualGrade(
  actor: UserProfile,
  id: string,
  before: ManualGrade,
  input: ManualGradeInput,
  reason: string,
) {
  return updateWithAudit(gradesCol, 'manualGrade', id, before, { ...before, ...input }, { actor, reason });
}

export function deleteManualGrade(actor: UserProfile, id: string, before: ManualGrade, reason: string) {
  return deleteWithAudit(gradesCol, 'manualGrade', id, before, { actor, reason });
}
