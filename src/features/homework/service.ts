import { doc, query, serverTimestamp, Timestamp, where, writeBatch, type UpdateData } from 'firebase/firestore';
import { db } from '@/firebase/db';
import { appendAuditLog } from '@/services/audit';
import { collectionRef } from '@/services/repository';
import { deleteAttachment, uploadAttachments } from '@/services/attachments';
import { notifyUsers, resolveGroupMemberUids } from '@/services/notifications';
import { withoutId, type Homework, type UserProfile } from '@/types/models';

const homeworkCol = collectionRef<Homework>('homework');

/** No orderBy — per-course homework lists are small; sort client-side by dueAt. */
export function homeworkQuery(courseId: string) {
  return query(homeworkCol, where('courseId', '==', courseId));
}

export interface HomeworkInput {
  title: string;
  instructions: string;
  publishAt: string; // datetime-local
  dueAt: string; // datetime-local
  allowLate: boolean;
  maxScore: number;
  lessonId: string | null;
  groupIds: string[];
}

function auditFields(actor: UserProfile, action: string, targetId: string, before: unknown, after: unknown, reason: string) {
  return {
    actorId: actor.uid,
    actorName: actor.name,
    action,
    targetType: 'homework',
    targetId,
    before,
    after,
    reason,
  };
}

/** Always created as a draft — publishing is a separate explicit action (publishHomework), matching the deadline-lock rule: dates are only ever free-form editable while draft. */
export async function createHomework(
  actor: UserProfile,
  courseId: string,
  input: HomeworkInput,
  files: File[],
  reason: string,
): Promise<void> {
  const ref = doc(homeworkCol);
  const attachments = await uploadAttachments(`homework/${courseId}/${ref.id}`, files);
  const data: Homework = {
    courseId,
    groupIds: input.groupIds,
    lessonId: input.lessonId,
    title: input.title,
    instructions: input.instructions,
    attachments,
    publishAt: Timestamp.fromDate(new Date(input.publishAt)),
    dueAt: Timestamp.fromDate(new Date(input.dueAt)),
    allowLate: input.allowLate,
    maxScore: input.maxScore,
    status: 'draft',
    createdBy: actor.uid,
    createdAt: serverTimestamp() as unknown as Timestamp,
  };
  const batch = writeBatch(db);
  batch.set(ref, data);
  appendAuditLog(batch, auditFields(actor, 'homework.create', ref.id, null, data, reason));
  await batch.commit();
}

/** Full edit — only valid while status is still 'draft' (rules enforce this; the form only offers it in that state). */
export async function updateDraftHomework(
  actor: UserProfile,
  hwId: string,
  before: Homework,
  input: HomeworkInput,
  newFiles: File[],
  reason: string,
): Promise<void> {
  before = withoutId(before);
  const uploaded = await uploadAttachments(`homework/${before.courseId}/${hwId}`, newFiles);
  const after: Homework = {
    ...before,
    title: input.title,
    instructions: input.instructions,
    publishAt: Timestamp.fromDate(new Date(input.publishAt)),
    dueAt: Timestamp.fromDate(new Date(input.dueAt)),
    allowLate: input.allowLate,
    maxScore: input.maxScore,
    lessonId: input.lessonId,
    groupIds: input.groupIds,
    attachments: [...before.attachments, ...uploaded],
  };
  const batch = writeBatch(db);
  batch.update(doc(homeworkCol, hwId), after as UpdateData<Homework>);
  appendAuditLog(batch, auditFields(actor, 'homework.update', hwId, before, after, reason));
  await batch.commit();
}

/** Content-only edit for an already-published assignment — dueAt/publishAt are never sent, so this satisfies the deadline-lock rule regardless of who calls it. */
export async function updateHomeworkContent(
  actor: UserProfile,
  hwId: string,
  before: Homework,
  input: Pick<HomeworkInput, 'title' | 'instructions' | 'allowLate' | 'maxScore' | 'lessonId' | 'groupIds'>,
  newFiles: File[],
  reason: string,
): Promise<void> {
  before = withoutId(before);
  const uploaded = await uploadAttachments(`homework/${before.courseId}/${hwId}`, newFiles);
  const after: Homework = {
    ...before,
    title: input.title,
    instructions: input.instructions,
    allowLate: input.allowLate,
    maxScore: input.maxScore,
    lessonId: input.lessonId,
    groupIds: input.groupIds,
    attachments: [...before.attachments, ...uploaded],
  };
  const batch = writeBatch(db);
  batch.update(doc(homeworkCol, hwId), after as UpdateData<Homework>);
  appendAuditLog(batch, auditFields(actor, 'homework.update', hwId, before, after, reason));
  await batch.commit();
}

async function setStatus(
  actor: UserProfile,
  hwId: string,
  before: Homework,
  status: Homework['status'],
  action: string,
  reason: string,
): Promise<void> {
  before = withoutId(before);
  const after: Homework = { ...before, status };
  const batch = writeBatch(db);
  batch.update(doc(homeworkCol, hwId), after as UpdateData<Homework>);
  appendAuditLog(batch, auditFields(actor, action, hwId, before, after, reason));
  await batch.commit();
}

export async function publishHomework(actor: UserProfile, hwId: string, before: Homework, reason: string): Promise<void> {
  await setStatus(actor, hwId, before, 'published', 'homework.publish', reason);
  try {
    const uids = await resolveGroupMemberUids(before.groupIds);
    await notifyUsers(uids, {
      type: 'homework_published',
      title: before.title,
      body: `New homework — due ${before.dueAt.toDate().toLocaleDateString()}`,
      link: `courses/${before.courseId}`,
    });
  } catch {
    // Notification fan-out is best-effort — never fail the publish action over it.
  }
}

export const closeHomework = (actor: UserProfile, hwId: string, before: Homework, reason: string) =>
  setStatus(actor, hwId, before, 'closed', 'homework.close', reason);

export const markHomeworkGraded = (actor: UserProfile, hwId: string, before: Homework, reason: string) =>
  setStatus(actor, hwId, before, 'graded', 'homework.markGraded', reason);

/** Admin-only in firestore.rules — extends/shortens a deadline after publishing, or reopens a closed assignment (status back to 'published'). Always requires a reason. */
export async function adminOverrideHomework(
  actor: UserProfile,
  hwId: string,
  before: Homework,
  changes: { publishAt: string; dueAt: string; status: Homework['status'] },
  reason: string,
): Promise<void> {
  before = withoutId(before);
  const after: Homework = {
    ...before,
    publishAt: Timestamp.fromDate(new Date(changes.publishAt)),
    dueAt: Timestamp.fromDate(new Date(changes.dueAt)),
    status: changes.status,
  };
  const batch = writeBatch(db);
  batch.update(doc(homeworkCol, hwId), after as UpdateData<Homework>);
  appendAuditLog(batch, auditFields(actor, 'homework.adminOverride', hwId, before, after, reason));
  await batch.commit();
}

export async function deleteHomework(actor: UserProfile, hwId: string, before: Homework, reason: string): Promise<void> {
  await Promise.all(before.attachments.map((a) => deleteAttachment(a.path)));
  const batch = writeBatch(db);
  batch.delete(doc(homeworkCol, hwId));
  appendAuditLog(batch, auditFields(actor, 'homework.delete', hwId, before, null, reason));
  await batch.commit();
}
