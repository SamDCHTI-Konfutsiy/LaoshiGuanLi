import { doc, orderBy, query, serverTimestamp, Timestamp, writeBatch, type UpdateData } from 'firebase/firestore';
import { db } from '@/firebase/db';
import { appendAuditLog } from '@/services/audit';
import { collectionRef } from '@/services/repository';
import {
  deleteAttachment,
  getAttachmentUrl,
  isAllowedAttachmentType,
  MAX_ATTACHMENT_BYTES,
  uploadAttachments,
} from '@/services/attachments';
import { withoutId, type Lesson, type LessonAttachment, type UserProfile } from '@/types/models';

export { getAttachmentUrl, isAllowedAttachmentType, MAX_ATTACHMENT_BYTES };

function lessonsCol(courseId: string) {
  return collectionRef<Lesson>(`courses/${courseId}/lessons`);
}

export function lessonsQuery(courseId: string) {
  return query(lessonsCol(courseId), orderBy('order', 'asc'));
}

export interface LessonInput {
  title: string;
  description: string;
  order: number;
  date: string; // yyyy-mm-dd
  classroomId: string | null;
}

/** Uploads files to Storage first (needs the lesson id for the path), then writes the lesson doc + audit entry in one batch. */
export async function createLesson(
  actor: UserProfile,
  courseId: string,
  input: LessonInput,
  files: File[],
  reason: string,
): Promise<void> {
  const ref = doc(lessonsCol(courseId));
  const attachments = await uploadAttachments(`courses/${courseId}/lessons/${ref.id}`, files);

  const data: Lesson = {
    title: input.title,
    description: input.description,
    order: input.order,
    date: Timestamp.fromDate(new Date(input.date)),
    classroomId: input.classroomId,
    attachments,
    createdAt: serverTimestamp() as unknown as Timestamp,
  };

  const batch = writeBatch(db);
  batch.set(ref, data);
  appendAuditLog(batch, {
    actorId: actor.uid,
    actorName: actor.name,
    action: 'lesson.create',
    targetType: 'lesson',
    targetId: ref.id,
    before: null,
    after: data,
    reason,
  });
  await batch.commit();
}

export async function updateLesson(
  actor: UserProfile,
  courseId: string,
  lessonId: string,
  before: Lesson,
  input: LessonInput,
  newFiles: File[],
  reason: string,
): Promise<void> {
  before = withoutId(before);
  const uploaded = await uploadAttachments(`courses/${courseId}/lessons/${lessonId}`, newFiles);
  const after: Lesson = {
    ...before,
    title: input.title,
    description: input.description,
    order: input.order,
    date: Timestamp.fromDate(new Date(input.date)),
    classroomId: input.classroomId,
    attachments: [...before.attachments, ...uploaded],
  };

  const batch = writeBatch(db);
  batch.update(doc(lessonsCol(courseId), lessonId), after as UpdateData<Lesson>);
  appendAuditLog(batch, {
    actorId: actor.uid,
    actorName: actor.name,
    action: 'lesson.update',
    targetType: 'lesson',
    targetId: lessonId,
    before,
    after,
    reason,
  });
  await batch.commit();
}

export async function removeAttachment(
  actor: UserProfile,
  courseId: string,
  lessonId: string,
  before: Lesson,
  attachment: LessonAttachment,
  reason: string,
): Promise<void> {
  before = withoutId(before);
  await deleteAttachment(attachment.path);
  const after: Lesson = { ...before, attachments: before.attachments.filter((a) => a.path !== attachment.path) };

  const batch = writeBatch(db);
  batch.update(doc(lessonsCol(courseId), lessonId), after as UpdateData<Lesson>);
  appendAuditLog(batch, {
    actorId: actor.uid,
    actorName: actor.name,
    action: 'lesson.removeAttachment',
    targetType: 'lesson',
    targetId: lessonId,
    before,
    after,
    reason,
  });
  await batch.commit();
}

export async function deleteLesson(
  actor: UserProfile,
  courseId: string,
  lessonId: string,
  before: Lesson,
  reason: string,
): Promise<void> {
  await Promise.all(before.attachments.map((a) => deleteAttachment(a.path)));

  const batch = writeBatch(db);
  batch.delete(doc(lessonsCol(courseId), lessonId));
  appendAuditLog(batch, {
    actorId: actor.uid,
    actorName: actor.name,
    action: 'lesson.delete',
    targetType: 'lesson',
    targetId: lessonId,
    before,
    after: null,
    reason,
  });
  await batch.commit();
}
