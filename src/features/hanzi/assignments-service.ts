import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  type UpdateData,
} from 'firebase/firestore';
import { db } from '@/firebase/db';
import { appendAuditLog } from '@/services/audit';
import { collectionRef } from '@/services/repository';
import { notifyUsers, resolveGroupMemberUids } from '@/services/notifications';
import { splitAlternatives } from '@/features/hanzi/checking';
import { HANZI_EXERCISE_TYPES, type HanziExerciseType, type HanziGridType } from '@/types/enums';
import {
  withoutId,
  type Course,
  type HanziAssignment,
  type HanziItem,
  type HanziKey,
  type HanziWord,
  type UserProfile,
  type WithId,
} from '@/types/models';

export const hanziAssignmentsCol = collectionRef<HanziAssignment>('hanziAssignments');

export function hanziItemsCol(assignmentId: string) {
  return collectionRef<HanziItem>(`hanziAssignments/${assignmentId}/items`);
}

export function hanziKeysCol(assignmentId: string) {
  return collectionRef<HanziKey>(`hanziAssignments/${assignmentId}/keys`);
}

/** 40 words × 5 exercise types = 200 items → 200 items + 200 keys + assignment + audit = 402 writes, safely under Firestore's 500-per-batch cap. */
export const MAX_WORDS_PER_ASSIGNMENT = 40;

// ---------------------------------------------------------------------------
// Queries (each one matches a firestore.rules read path exactly)
// ---------------------------------------------------------------------------

/** Teacher: their own assignments. */
export function teacherAssignmentsQuery(teacherId: string) {
  return query(hanziAssignmentsCol, where('teacherId', '==', teacherId));
}

/** Admin: everything. */
export function allAssignmentsQuery() {
  return query(hanziAssignmentsCol);
}

/** Student: only assignments they are a published target of (drafts always have an empty target list). */
export function studentAssignmentsQuery(studentId: string) {
  return query(hanziAssignmentsCol, where('targetStudentIds', 'array-contains', studentId));
}

export function itemsQuery(assignmentId: string) {
  return query(hanziItemsCol(assignmentId));
}

export function keysQuery(assignmentId: string) {
  return query(hanziKeysCol(assignmentId));
}

// ---------------------------------------------------------------------------
// Building items from words
// ---------------------------------------------------------------------------

function charsOf(hanzi: string): string[] {
  return [...hanzi.replace(/\s/g, '')];
}

/** What the student sees for each exercise type — and, separately, what the answer is checked against. */
export function buildItem(word: WithId<HanziWord>, type: HanziExerciseType, order: number): { item: HanziItem; key: HanziKey } {
  const chars = charsOf(word.hanzi);
  const base = { order, type, wordId: word.id, charCount: chars.length };
  const key: HanziKey = { hanzi: word.hanzi, pinyin: word.pinyin, translation: word.translation, accepted: [word.hanzi] };

  switch (type) {
    case 'writing':
      return {
        item: { ...base, showHanzi: null, showPinyin: word.pinyin, showTranslation: word.translation, target: chars.join('') },
        key,
      };
    case 'hanzi_input':
      return {
        item: { ...base, showHanzi: null, showPinyin: word.pinyin, showTranslation: word.translation, target: null },
        key,
      };
    case 'pinyin':
      return {
        item: { ...base, showHanzi: word.hanzi, showPinyin: null, showTranslation: word.translation, target: null },
        key: { ...key, accepted: [word.pinyin, ...word.altPinyin] },
      };
    case 'translation':
      return {
        item: { ...base, showHanzi: word.hanzi, showPinyin: word.pinyin, showTranslation: null, target: null },
        key: { ...key, accepted: [...splitAlternatives(word.translation), word.translation, ...word.altTranslations] },
      };
    case 'dictation':
      return {
        item: { ...base, showHanzi: null, showPinyin: null, showTranslation: null, target: word.hanzi },
        key,
      };
  }
}

/** Items grouped by exercise type (in the canonical type order), words in the teacher's chosen order inside each group. */
export function buildItems(words: WithId<HanziWord>[], types: HanziExerciseType[]): { item: HanziItem; key: HanziKey }[] {
  const orderedTypes = HANZI_EXERCISE_TYPES.filter((t) => types.includes(t));
  const out: { item: HanziItem; key: HanziKey }[] = [];
  for (const type of orderedTypes) {
    for (const word of words) out.push(buildItem(word, type, out.length));
  }
  return out;
}

function itemId(order: number): string {
  return `it${String(order).padStart(3, '0')}`;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface HanziAssignmentInput {
  title: string;
  instructions: string;
  groupIds: string[];
  studentIds: string[];
  exerciseTypes: HanziExerciseType[];
  dueAt: string; // datetime-local, '' = no deadline
  allowLate: boolean;
  maxScore: number;
  maxAttempts: number;
  gridType: HanziGridType;
  allowStrokeHints: boolean;
  pinyinRequireTones: boolean;
  writingMistakeTolerance: number;
}

function audit(actor: UserProfile, action: string, targetId: string, before: unknown, after: unknown, reason: string) {
  return { actorId: actor.uid, actorName: actor.name, action, targetType: 'hanziAssignment', targetId, before, after, reason };
}

function fromInput(input: HanziAssignmentInput, words: WithId<HanziWord>[], itemCount: number) {
  return {
    title: input.title.trim(),
    instructions: input.instructions.trim(),
    groupIds: input.groupIds,
    studentIds: input.studentIds,
    exerciseTypes: input.exerciseTypes,
    wordIds: words.map((w) => w.id),
    itemCount,
    dueAt: input.dueAt ? Timestamp.fromDate(new Date(input.dueAt)) : null,
    allowLate: input.allowLate,
    maxScore: Math.max(1, input.maxScore),
    maxAttempts: Math.max(1, Math.round(input.maxAttempts)),
    gridType: input.gridType,
    allowStrokeHints: input.allowStrokeHints,
    pinyinRequireTones: input.pinyinRequireTones,
    writingMistakeTolerance: Math.max(0, Math.round(input.writingMistakeTolerance)),
  };
}

/** Always created as a draft — invisible to students until publishHanziAssignment fills its target list. */
export async function createHanziAssignment(
  actor: UserProfile,
  course: WithId<Course>,
  input: HanziAssignmentInput,
  words: WithId<HanziWord>[],
): Promise<string> {
  const built = buildItems(words, input.exerciseTypes);
  const ref = doc(hanziAssignmentsCol);
  const data: HanziAssignment = {
    ...fromInput(input, words, built.length),
    courseId: course.id,
    teacherId: course.teacherId,
    targetStudentIds: [],
    status: 'draft',
    createdBy: actor.uid,
    createdAt: serverTimestamp() as unknown as Timestamp,
    publishedAt: null,
  };
  const batch = writeBatch(db);
  batch.set(ref, data);
  built.forEach(({ item, key }) => {
    const id = itemId(item.order);
    batch.set(doc(hanziItemsCol(ref.id), id), item);
    batch.set(doc(hanziKeysCol(ref.id), id), key);
  });
  appendAuditLog(batch, audit(actor, 'hanziAssignment.create', ref.id, null, { ...data, items: built.length }, ''));
  await batch.commit();
  return ref.id;
}

/** Full edit of a draft: settings + rebuilds every item/key from the (possibly changed) word list. */
export async function updateDraftHanziAssignment(
  actor: UserProfile,
  assignment: WithId<HanziAssignment>,
  input: HanziAssignmentInput,
  words: WithId<HanziWord>[],
): Promise<void> {
  const before = withoutId(assignment);
  const built = buildItems(words, input.exerciseTypes);
  const [oldItems, oldKeys] = await Promise.all([getDocs(itemsQuery(assignment.id)), getDocs(keysQuery(assignment.id))]);

  const batch = writeBatch(db);
  oldItems.forEach((d) => batch.delete(d.ref));
  oldKeys.forEach((d) => batch.delete(d.ref));
  const after: HanziAssignment = { ...before, ...fromInput(input, words, built.length) };
  batch.update(doc(hanziAssignmentsCol, assignment.id), after as UpdateData<HanziAssignment>);
  built.forEach(({ item, key }) => {
    const id = itemId(item.order);
    batch.set(doc(hanziItemsCol(assignment.id), id), item);
    batch.set(doc(hanziKeysCol(assignment.id), id), key);
  });
  appendAuditLog(batch, audit(actor, 'hanziAssignment.update', assignment.id, before, after, ''));
  await batch.commit();
}

/** Settings that stay editable after publishing (items/answers are frozen so existing submissions stay valid). */
export async function updatePublishedHanziAssignment(
  actor: UserProfile,
  assignment: WithId<HanziAssignment>,
  changes: Pick<HanziAssignmentInput, 'title' | 'instructions' | 'dueAt' | 'allowLate' | 'maxScore' | 'maxAttempts' | 'allowStrokeHints'>,
): Promise<void> {
  const before = withoutId(assignment);
  const after: HanziAssignment = {
    ...before,
    title: changes.title.trim(),
    instructions: changes.instructions.trim(),
    dueAt: changes.dueAt ? Timestamp.fromDate(new Date(changes.dueAt)) : null,
    allowLate: changes.allowLate,
    maxScore: Math.max(1, changes.maxScore),
    maxAttempts: Math.max(1, Math.round(changes.maxAttempts)),
    allowStrokeHints: changes.allowStrokeHints,
  };
  const batch = writeBatch(db);
  batch.update(doc(hanziAssignmentsCol, assignment.id), after as UpdateData<HanziAssignment>);
  appendAuditLog(batch, audit(actor, 'hanziAssignment.update', assignment.id, before, after, ''));
  await batch.commit();
}

/** Picked students if any were picked, otherwise every current member of the chosen groups. */
export async function resolveTargets(assignment: Pick<HanziAssignment, 'groupIds' | 'studentIds'>): Promise<string[]> {
  if (assignment.studentIds.length > 0) return [...new Set(assignment.studentIds)];
  return resolveGroupMemberUids(assignment.groupIds);
}

export async function publishHanziAssignment(actor: UserProfile, assignment: WithId<HanziAssignment>): Promise<number> {
  const before = withoutId(assignment);
  const targets = await resolveTargets(before);
  const after: HanziAssignment = {
    ...before,
    status: 'published',
    targetStudentIds: targets,
    publishedAt: serverTimestamp() as unknown as Timestamp,
  };
  const batch = writeBatch(db);
  batch.update(doc(hanziAssignmentsCol, assignment.id), after as UpdateData<HanziAssignment>);
  appendAuditLog(batch, audit(actor, 'hanziAssignment.publish', assignment.id, before, { ...after, publishedAt: null }, ''));
  await batch.commit();

  try {
    await notifyUsers(targets, {
      type: 'hanzi_published',
      title: `汉字 · ${before.title}`,
      body: before.dueAt ? `Muddat / Due: ${before.dueAt.toDate().toLocaleString()}` : '',
      link: `hanzi/${assignment.id}`,
    });
  } catch {
    // Best-effort, like homework/quiz publish.
  }
  return targets.length;
}

/** Adds students who joined the groups after publishing. Never removes anyone (they may already have work saved). */
export async function refreshHanziTargets(actor: UserProfile, assignment: WithId<HanziAssignment>): Promise<number> {
  const before = withoutId(assignment);
  const current = await resolveTargets(before);
  const added = current.filter((uid) => !before.targetStudentIds.includes(uid));
  if (added.length === 0) return 0;
  const after: HanziAssignment = { ...before, targetStudentIds: [...before.targetStudentIds, ...added] };
  const batch = writeBatch(db);
  batch.update(doc(hanziAssignmentsCol, assignment.id), { targetStudentIds: after.targetStudentIds });
  appendAuditLog(batch, audit(actor, 'hanziAssignment.refreshTargets', assignment.id, null, { added }, ''));
  await batch.commit();
  try {
    await notifyUsers(added, { type: 'hanzi_published', title: `汉字 · ${before.title}`, body: '', link: `hanzi/${assignment.id}` });
  } catch {
    // best-effort
  }
  return added.length;
}

export async function setHanziAssignmentStatus(
  actor: UserProfile,
  assignment: WithId<HanziAssignment>,
  status: 'published' | 'closed',
): Promise<void> {
  const before = withoutId(assignment);
  const batch = writeBatch(db);
  batch.update(doc(hanziAssignmentsCol, assignment.id), { status });
  appendAuditLog(batch, audit(actor, status === 'closed' ? 'hanziAssignment.close' : 'hanziAssignment.reopen', assignment.id, before, { ...before, status }, ''));
  await batch.commit();
}

/** Teacher: drafts only (rules-enforced). Admin: any — submissions are kept, only the assignment + its items/keys go. */
export async function deleteHanziAssignment(actor: UserProfile, assignment: WithId<HanziAssignment>, reason: string): Promise<void> {
  const before = withoutId(assignment);
  const [items, keys] = await Promise.all([getDocs(itemsQuery(assignment.id)), getDocs(keysQuery(assignment.id))]);
  const batch = writeBatch(db);
  items.forEach((d) => batch.delete(d.ref));
  keys.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(hanziAssignmentsCol, assignment.id));
  appendAuditLog(batch, audit(actor, 'hanziAssignment.delete', assignment.id, before, null, reason));
  await batch.commit();
}

// ---------------------------------------------------------------------------
// QR / deep link
// ---------------------------------------------------------------------------

/**
 * Absolute link a phone camera can open. Built from the page's own origin +
 * Vite's BASE_URL ("/<repo-name>/" on GitHub Pages, "/" locally), plus the
 * hash route — so it is correct for any repo name or custom domain without
 * configuration.
 */
export function assignmentShareUrl(assignmentId: string): string {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin);
  return `${base.href}#/hanzi/a/${assignmentId}`;
}

/** Group member lookup used by the builder to list students for individual picking. */
export async function groupMemberIds(groupId: string): Promise<string[]> {
  const snap = await getDocs(collection(db, `groups/${groupId}/members`));
  return snap.docs.map((d) => d.id);
}
