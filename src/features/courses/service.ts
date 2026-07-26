import { query, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import { collectionRef, createWithAudit, deleteWithAudit, updateWithAudit } from '@/services/repository';
import type { Course, UserProfile } from '@/types/models';

const coursesCol = collectionRef<Course>('courses');

/** No orderBy — course lists are small; sort client-side. */
export function coursesQuery() {
  return query(coursesCol);
}

export function teachingCoursesQuery(teacherId: string) {
  return query(coursesCol, where('teacherId', '==', teacherId));
}

/** Courses whose groupIds overlap the student's own groupIds. Firestore caps array-contains-any at 30 values, comfortably above any real group-membership count. */
export function enrolledCoursesQuery(groupIds: string[]) {
  const capped = groupIds.slice(0, 30);
  // where('groupIds', 'array-contains-any', []) is invalid — empty membership means no courses, handled by the caller passing null instead of calling this.
  return query(coursesCol, where('groupIds', 'array-contains-any', capped));
}

export interface CourseInput {
  title: string;
  description: string;
  teacherId: string;
  groupIds: string[];
  semesterId: string;
  archived: boolean;
}

export function createCourse(actor: UserProfile, input: CourseInput, reason: string) {
  const data: Course = { ...input, createdAt: serverTimestamp() as unknown as Timestamp };
  return createWithAudit(coursesCol, 'course', data, { actor, reason });
}

export function updateCourse(actor: UserProfile, id: string, before: Course, input: CourseInput, reason: string) {
  return updateWithAudit(coursesCol, 'course', id, before, { ...before, ...input }, { actor, reason });
}

export function deleteCourse(actor: UserProfile, id: string, before: Course, reason: string) {
  return deleteWithAudit(coursesCol, 'course', id, before, { actor, reason });
}
