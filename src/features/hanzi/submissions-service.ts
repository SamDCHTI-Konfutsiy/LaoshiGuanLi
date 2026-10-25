import { doc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';
import { collectionRef } from '@/services/repository';
import { notifyUser } from '@/services/notifications';
import { readStorage, writeStorage } from '@/utils/storage';
import { gradeSubmission } from '@/features/hanzi/checking';
import { itemsQuery, keysQuery } from '@/features/hanzi/assignments-service';
import type { HanziItemVerdict, HanziSubmissionStatus } from '@/types/enums';
import type {
  HanziAnswer,
  HanziAssignment,
  HanziAutoResult,
  HanziItem,
  HanziKey,
  HanziSubmission,
  UserProfile,
  WithId,
} from '@/types/models';

export const hanziSubmissionsCol = collectionRef<HanziSubmission>('hanziSubmissions');

export function submissionId(assignmentId: string, studentId: string): string {
  return `${assignmentId}_${studentId}`;
}

export function submissionRef(assignmentId: string, studentId: string) {
  return doc(hanziSubmissionsCol, submissionId(assignmentId, studentId));
}

// Queries — each matches a list rule in firestore.rules.
export function teacherSubmissionsQuery(teacherId: string) {
  return query(hanziSubmissionsCol, where('teacherId', '==', teacherId));
}
export function teacherAssignmentSubmissionsQuery(teacherId: string, assignmentId: string) {
  return query(hanziSubmissionsCol, where('teacherId', '==', teacherId), where('assignmentId', '==', assignmentId));
}
export function adminAssignmentSubmissionsQuery(assignmentId: string) {
  return query(hanziSubmissionsCol, where('assignmentId', '==', assignmentId));
}
export function allSubmissionsQuery() {
  return query(hanziSubmissionsCol);
}
export function studentSubmissionsQuery(studentId: string) {
  return query(hanziSubmissionsCol, where('studentId', '==', studentId));
}

export function emptyAnswer(): HanziAnswer {
  return { text: '', writing: [], freehand: '' };
}

/** "Yuborilmagan" covers both "no document yet" and a saved-but-unsubmitted draft. */
export function effectiveStatus(sub: HanziSubmission | null | undefined): HanziSubmissionStatus | 'not_started' {
  if (!sub) return 'not_started';
  return sub.status;
}

export function isLate(sub: Pick<HanziSubmission, 'submittedAt'>, assignment: Pick<HanziAssignment, 'dueAt'>): boolean {
  return Boolean(sub.submittedAt && assignment.dueAt && sub.submittedAt.toMillis() > assignment.dueAt.toMillis());
}

/** The student may still edit (and later submit) right now. */
export function canStudentEdit(sub: HanziSubmission | null, assignment: HanziAssignment, now = Date.now()): boolean {
  if (assignment.status !== 'published') return false;
  if (assignment.dueAt && now > assignment.dueAt.toMillis() && !assignment.allowLate) return false;
  if (!sub) return true;
  return sub.status === 'draft' || sub.status === 'needs_revision';
}

export function attemptsLeft(sub: HanziSubmission | null, assignment: HanziAssignment): number {
  return Math.max(0, assignment.maxAttempts - (sub?.attemptsUsed ?? 0));
}

/** May the student withdraw a submitted (not yet reviewed) answer to try again? */
export function canRetry(sub: HanziSubmission | null, assignment: HanziAssignment, now = Date.now()): boolean {
  if (!sub || sub.status !== 'submitted') return false;
  if (assignment.status !== 'published') return false;
  if (assignment.dueAt && now > assignment.dueAt.toMillis() && !assignment.allowLate) return false;
  return attemptsLeft(sub, assignment) > 0;
}

// ---------------------------------------------------------------------------
// Local (on-device) backup of unsent answers — survives a reload, a dead
// battery or a dropped connection. Firestore's own offline queue already
// retries writes, this only protects against losing the tab.
// ---------------------------------------------------------------------------

interface LocalDraft {
  answers: Record<string, HanziAnswer>;
  updatedAt: number;
}

function localKey(assignmentId: string, studentId: string) {
  return `ems-hanzi-draft:${assignmentId}:${studentId}`;
}

export function readLocalDraft(assignmentId: string, studentId: string): LocalDraft | null {
  const raw = readStorage(localKey(assignmentId, studentId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LocalDraft;
    return parsed && typeof parsed.updatedAt === 'number' && parsed.answers ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLocalDraft(assignmentId: string, studentId: string, answers: Record<string, HanziAnswer>): void {
  writeStorage(localKey(assignmentId, studentId), JSON.stringify({ answers, updatedAt: Date.now() } satisfies LocalDraft));
}

export function clearLocalDraft(assignmentId: string, studentId: string): void {
  try {
    window.localStorage.removeItem(localKey(assignmentId, studentId));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Student writes
// ---------------------------------------------------------------------------

/**
 * Firestore resolves a write's promise only once the server confirms it.
 * Offline, that never happens until reconnecting — so the UI waits at most
 * `ms` and then reports "queued" instead of hanging; the write itself
 * stays in Firestore's persistent queue and is sent automatically.
 */
export async function withOfflineTimeout(
  write: Promise<void>,
  onLateError?: (err: unknown) => void,
  ms = 4000,
): Promise<'sent' | 'queued'> {
  let timer: number | undefined;
  let settled = false;
  const timeout = new Promise<'queued'>((resolve) => {
    timer = window.setTimeout(() => resolve('queued'), ms);
  });
  // A queued write can still be rejected later (e.g. the deadline passed
  // while offline) — report it instead of leaving an unhandled rejection.
  write.catch((err: unknown) => {
    if (settled) onLateError?.(err);
  });
  try {
    return await Promise.race([write.then(() => 'sent' as const), timeout]);
  } finally {
    settled = true;
    window.clearTimeout(timer);
  }
}

function freshSubmission(assignment: WithId<HanziAssignment>, student: UserProfile): HanziSubmission {
  return {
    assignmentId: assignment.id,
    courseId: assignment.courseId,
    teacherId: assignment.teacherId,
    studentId: student.uid,
    answers: {},
    status: 'draft',
    attemptsUsed: 0,
    savedAt: null,
    submittedAt: null,
    autoResult: null,
    teacherScore: null,
    teacherFeedback: '',
    itemComments: {},
    itemOverrides: {},
    finalWrongWords: [],
    reviewedBy: null,
    reviewedAt: null,
  };
}

/** Creates the submission document on first save, otherwise updates answers only. Status is left as is (draft / needs_revision). */
export function saveHanziDraft(
  student: UserProfile,
  assignment: WithId<HanziAssignment>,
  existing: HanziSubmission | null,
  answers: Record<string, HanziAnswer>,
): Promise<void> {
  const ref = submissionRef(assignment.id, student.uid);
  if (!existing) {
    return setDoc(ref, { ...freshSubmission(assignment, student), answers, savedAt: serverTimestamp() as unknown as Timestamp });
  }
  return updateDoc(ref, { answers, savedAt: serverTimestamp() });
}

export function submitHanzi(
  student: UserProfile,
  assignment: WithId<HanziAssignment>,
  existing: HanziSubmission | null,
  answers: Record<string, HanziAnswer>,
): Promise<void> {
  const ref = submissionRef(assignment.id, student.uid);
  const now = serverTimestamp() as unknown as Timestamp;
  if (!existing) {
    return setDoc(ref, {
      ...freshSubmission(assignment, student),
      answers,
      status: 'submitted',
      attemptsUsed: 1,
      savedAt: now,
      submittedAt: now,
    });
  }
  return updateDoc(ref, {
    answers,
    status: 'submitted',
    attemptsUsed: existing.attemptsUsed + 1,
    savedAt: serverTimestamp(),
    submittedAt: serverTimestamp(),
    autoResult: null,
  });
}

/** Withdraws a submitted (not yet reviewed) answer so the student can use another attempt. */
export function retryHanzi(student: UserProfile, assignmentId: string): Promise<void> {
  return updateDoc(submissionRef(assignmentId, student.uid), {
    status: 'draft',
    autoResult: null,
    savedAt: serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// Teacher / admin writes
// ---------------------------------------------------------------------------

/** Runs in the teacher's session (keys are teacher-only) — or server-side in the optional hanziAutoCheck function. */
export function computeAutoResult(
  assignment: HanziAssignment,
  items: WithId<HanziItem>[],
  keys: Map<string, HanziKey>,
  answers: Record<string, HanziAnswer>,
): HanziAutoResult {
  const result = gradeSubmission(
    items,
    keys,
    answers,
    { pinyinRequireTones: assignment.pinyinRequireTones, writingMistakeTolerance: assignment.writingMistakeTolerance },
    assignment.maxScore,
  );
  return { ...result, checkedAt: serverTimestamp() as unknown as Timestamp, checkedBy: 'teacher' };
}

export async function loadItemsAndKeys(assignmentId: string): Promise<{ items: WithId<HanziItem>[]; keys: Map<string, HanziKey> }> {
  const [itemsSnap, keysSnap] = await Promise.all([getDocs(itemsQuery(assignmentId)), getDocs(keysQuery(assignmentId))]);
  const items = itemsSnap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => a.order - b.order);
  const keys = new Map(keysSnap.docs.map((d) => [d.id, d.data()]));
  return { items, keys };
}

export function saveAutoResult(assignmentId: string, studentId: string, result: HanziAutoResult): Promise<void> {
  return updateDoc(submissionRef(assignmentId, studentId), { autoResult: result });
}

export function markInReview(assignmentId: string, studentId: string): Promise<void> {
  return updateDoc(submissionRef(assignmentId, studentId), { status: 'in_review' });
}

export interface ReviewInput {
  teacherScore: number | null;
  teacherFeedback: string;
  itemComments: Record<string, string>;
  itemOverrides: Record<string, HanziItemVerdict>;
  finalWrongWords: string[];
  status: 'reviewed' | 'needs_revision';
}

export async function saveReview(
  reviewer: UserProfile,
  assignment: WithId<HanziAssignment>,
  studentId: string,
  input: ReviewInput,
): Promise<void> {
  await updateDoc(submissionRef(assignment.id, studentId), {
    teacherScore: input.teacherScore,
    teacherFeedback: input.teacherFeedback,
    itemComments: input.itemComments,
    itemOverrides: input.itemOverrides,
    finalWrongWords: input.finalWrongWords,
    status: input.status,
    reviewedBy: reviewer.uid,
    reviewedAt: serverTimestamp(),
  });
  try {
    await notifyUser(studentId, {
      type: 'hanzi_reviewed',
      title: `汉字 · ${assignment.title}`,
      body: input.status === 'reviewed' ? `${input.teacherScore ?? 0}/${assignment.maxScore}` : 'Qayta ishlash kerak / Needs revision',
      link: `hanzi/${assignment.id}`,
    });
  } catch {
    // best-effort
  }
}
