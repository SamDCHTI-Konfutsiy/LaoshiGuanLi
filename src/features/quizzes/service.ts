import { doc, getDocs, query, serverTimestamp, Timestamp, where, writeBatch, type UpdateData } from 'firebase/firestore';
import { db } from '@/firebase/db';
import { appendAuditLog } from '@/services/audit';
import { collectionRef } from '@/services/repository';
import { notifyUsers, resolveGroupMemberUids } from '@/services/notifications';
import { withoutId, type BankQuestion, type Quiz, type QuizItem, type QuizKey, type UserProfile, type WithId } from '@/types/models';

const quizzesCol = collectionRef<Quiz>('quizzes');

/** No orderBy — per-course quiz lists are small; sort client-side by dueAt. */
export function quizzesQuery(courseId: string) {
  return query(quizzesCol, where('courseId', '==', courseId));
}

function itemsCol(quizId: string) {
  return collectionRef<QuizItem>(`quizzes/${quizId}/items`);
}
function keysCol(quizId: string) {
  return collectionRef<QuizKey>(`quizzes/${quizId}/keys`);
}

export function quizItemsQuery(quizId: string) {
  return query(itemsCol(quizId));
}

function auditFields(actor: UserProfile, action: string, targetId: string, before: unknown, after: unknown, reason: string) {
  return { actorId: actor.uid, actorName: actor.name, action, targetType: 'quiz', targetId, before, after, reason };
}

export interface QuizInput {
  title: string;
  durationMin: number;
  publishAt: string; // datetime-local
  dueAt: string; // datetime-local
  attemptsAllowed: number;
  shuffle: boolean;
  passingScore: number;
  autoGrade: boolean;
  groupIds: string[];
}

export async function createQuiz(actor: UserProfile, courseId: string, input: QuizInput, reason: string): Promise<string> {
  const ref = doc(quizzesCol);
  const data: Quiz = {
    courseId,
    groupIds: input.groupIds,
    title: input.title,
    durationMin: input.durationMin,
    publishAt: Timestamp.fromDate(new Date(input.publishAt)),
    dueAt: Timestamp.fromDate(new Date(input.dueAt)),
    attemptsAllowed: input.attemptsAllowed,
    shuffle: input.shuffle,
    passingScore: input.passingScore,
    autoGrade: input.autoGrade,
    status: 'draft',
    createdBy: actor.uid,
    createdAt: serverTimestamp() as unknown as Timestamp,
  };
  const batch = writeBatch(db);
  batch.set(ref, data);
  appendAuditLog(batch, auditFields(actor, 'quiz.create', ref.id, null, data, reason));
  await batch.commit();
  return ref.id;
}

export async function updateDraftQuiz(
  actor: UserProfile,
  quizId: string,
  before: Quiz,
  input: QuizInput,
  reason: string,
): Promise<void> {
  before = withoutId(before);
  const after: Quiz = {
    ...before,
    title: input.title,
    durationMin: input.durationMin,
    publishAt: Timestamp.fromDate(new Date(input.publishAt)),
    dueAt: Timestamp.fromDate(new Date(input.dueAt)),
    attemptsAllowed: input.attemptsAllowed,
    shuffle: input.shuffle,
    passingScore: input.passingScore,
    autoGrade: input.autoGrade,
    groupIds: input.groupIds,
  };
  const batch = writeBatch(db);
  batch.update(doc(quizzesCol, quizId), after as UpdateData<Quiz>);
  appendAuditLog(batch, auditFields(actor, 'quiz.update', quizId, before, after, reason));
  await batch.commit();
}

async function setQuizStatus(
  actor: UserProfile,
  quizId: string,
  before: Quiz,
  status: Quiz['status'],
  action: string,
  reason: string,
): Promise<void> {
  before = withoutId(before);
  const after: Quiz = { ...before, status };
  const batch = writeBatch(db);
  batch.update(doc(quizzesCol, quizId), after as UpdateData<Quiz>);
  appendAuditLog(batch, auditFields(actor, action, quizId, before, after, reason));
  await batch.commit();
}

export async function publishQuiz(actor: UserProfile, quizId: string, before: Quiz, reason: string): Promise<void> {
  await setQuizStatus(actor, quizId, before, 'published', 'quiz.publish', reason);
  try {
    const uids = await resolveGroupMemberUids(before.groupIds);
    await notifyUsers(uids, {
      type: 'quiz_published',
      title: before.title,
      body: `New quiz — due ${before.dueAt.toDate().toLocaleDateString()}`,
      link: `courses/${before.courseId}`,
    });
  } catch {
    // Notification fan-out is best-effort — never fail the publish action over it.
  }
}

export const closeQuiz = (actor: UserProfile, quizId: string, before: Quiz, reason: string) =>
  setQuizStatus(actor, quizId, before, 'closed', 'quiz.close', reason);

export async function adminOverrideQuiz(
  actor: UserProfile,
  quizId: string,
  before: Quiz,
  changes: { publishAt: string; dueAt: string; status: Quiz['status'] },
  reason: string,
): Promise<void> {
  before = withoutId(before);
  const after: Quiz = {
    ...before,
    publishAt: Timestamp.fromDate(new Date(changes.publishAt)),
    dueAt: Timestamp.fromDate(new Date(changes.dueAt)),
    status: changes.status,
  };
  const batch = writeBatch(db);
  batch.update(doc(quizzesCol, quizId), after as UpdateData<Quiz>);
  appendAuditLog(batch, auditFields(actor, 'quiz.adminOverride', quizId, before, after, reason));
  await batch.commit();
}

export async function deleteQuiz(actor: UserProfile, quizId: string, before: Quiz, reason: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(quizzesCol, quizId));
  appendAuditLog(batch, auditFields(actor, 'quiz.delete', quizId, before, null, reason));
  await batch.commit();
}

// ---------------------------------------------------------------------
// Builder: copy a bank question into this quiz's items (public) + keys
// (teacher/admin only). Copying — not referencing — so a later bank edit
// never retroactively changes a quiz someone may have already taken.
// ---------------------------------------------------------------------
export async function addBankQuestionToQuiz(
  actor: UserProfile,
  quizId: string,
  question: WithId<BankQuestion>,
  order: number,
  reason: string,
): Promise<void> {
  const itemRef = doc(itemsCol(quizId));
  const item: QuizItem = {
    order,
    type: question.type,
    prompt: question.prompt,
    options: question.options,
    points: question.points,
  };
  const key: QuizKey = {
    correctOptionIds: question.correctOptionIds,
    correctText: question.correctText,
  };
  const batch = writeBatch(db);
  batch.set(itemRef, item);
  batch.set(doc(keysCol(quizId), itemRef.id), key);
  appendAuditLog(batch, auditFields(actor, 'quiz.addQuestion', quizId, null, { itemId: itemRef.id, prompt: item.prompt }, reason));
  await batch.commit();
}

export async function removeQuizQuestion(actor: UserProfile, quizId: string, itemId: string, reason: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(itemsCol(quizId), itemId));
  batch.delete(doc(keysCol(quizId), itemId));
  appendAuditLog(batch, auditFields(actor, 'quiz.removeQuestion', quizId, { itemId }, null, reason));
  await batch.commit();
}

/** Teacher/admin only — students never call this (rules deny them keys read entirely). */
export async function getQuizKeys(quizId: string): Promise<Map<string, QuizKey>> {
  const results = await getDocs(keysCol(quizId));
  const map = new Map<string, QuizKey>();
  results.forEach((d) => map.set(d.id, d.data()));
  return map;
}
