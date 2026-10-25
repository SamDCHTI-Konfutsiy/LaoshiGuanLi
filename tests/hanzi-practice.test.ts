import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { makeTestEnv, TIMESTAMP_FUTURE, TIMESTAMP_PAST } from './setup';

/**
 * Hanzi practice module (汉字练習) — the invariants that matter:
 * - a student only ever sees assignments they're targeted by (never drafts),
 * - answer keys never reach a student,
 * - a student can only write their own answers/status, within the
 *   deadline and attempt limits, and never the teacher's review fields,
 * - a teacher can only write review fields, never the student's answers.
 */

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await makeTestEnv();
});
afterEach(async () => {
  await testEnv.clearFirestore();
});
afterAll(async () => {
  await testEnv.cleanup();
});

const user = (uid: string, role: string, groupIds: string[] = []) => ({
  uid, role, status: 'active', name: uid, email: `${uid}@x.com`, locale: 'en', groupIds, fcmTokens: [],
});

function assignment(status: 'draft' | 'published' | 'closed', overrides: Record<string, unknown> = {}) {
  return {
    courseId: 'c1', teacherId: 'teacher1', groupIds: ['g1'], studentIds: [],
    targetStudentIds: status === 'draft' ? [] : ['student1'],
    title: 'HSK 1', instructions: '', exerciseTypes: ['pinyin'], wordIds: ['w1'], itemCount: 1,
    dueAt: TIMESTAMP_FUTURE, allowLate: false, maxScore: 10, maxAttempts: 2, gridType: 'mi',
    allowStrokeHints: true, pinyinRequireTones: true, writingMistakeTolerance: 3,
    status, createdBy: 'teacher1', createdAt: TIMESTAMP_PAST, publishedAt: null,
    ...overrides,
  };
}

function freshSubmission(status: string, attemptsUsed: number) {
  return {
    assignmentId: 'a1', courseId: 'c1', teacherId: 'teacher1', studentId: 'student1',
    answers: { it000: { text: 'ni3', writing: [], freehand: '' } },
    status, attemptsUsed, savedAt: null, submittedAt: null, autoResult: null,
    teacherScore: null, teacherFeedback: '', itemComments: {}, itemOverrides: {}, finalWrongWords: [],
    reviewedBy: null, reviewedAt: null,
  };
}

async function seed(a: ReturnType<typeof assignment>, submission?: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/teacher1'), user('teacher1', 'teacher'));
    await setDoc(doc(db, 'users/teacher2'), user('teacher2', 'teacher'));
    await setDoc(doc(db, 'users/student1'), user('student1', 'student', ['g1']));
    await setDoc(doc(db, 'users/student2'), user('student2', 'student', ['g1']));
    await setDoc(doc(db, 'courses/c1'), { title: 'C', description: '', teacherId: 'teacher1', groupIds: ['g1'], semesterId: 's', archived: false });
    await setDoc(doc(db, 'hanziAssignments/a1'), a);
    await setDoc(doc(db, 'hanziAssignments/a1/items/it000'), { order: 0, type: 'pinyin', wordId: 'w1', showHanzi: '你', showPinyin: null, showTranslation: 'sen', target: null, charCount: 1 });
    await setDoc(doc(db, 'hanziAssignments/a1/keys/it000'), { hanzi: '你', pinyin: 'nǐ', translation: 'sen', accepted: ['nǐ'] });
    if (submission) await setDoc(doc(db, 'hanziSubmissions/a1_student1'), submission);
  });
}

const as = (uid: string) => testEnv.authenticatedContext(uid).firestore();

describe('hanzi: visibility', () => {
  it('targeted student reads a published assignment and its items, never its keys', async () => {
    await seed(assignment('published'));
    const db = as('student1');
    await assertSucceeds(getDoc(doc(db, 'hanziAssignments/a1')));
    await assertSucceeds(getDocs(collection(db, 'hanziAssignments/a1/items')));
    await assertFails(getDoc(doc(db, 'hanziAssignments/a1/keys/it000')));
    await assertFails(getDocs(collection(db, 'hanziAssignments/a1/keys')));
  });

  it('student list query only works scoped to themselves', async () => {
    await seed(assignment('published'));
    const db = as('student1');
    await assertSucceeds(getDocs(query(collection(db, 'hanziAssignments'), where('targetStudentIds', 'array-contains', 'student1'))));
    await assertFails(getDocs(collection(db, 'hanziAssignments')));
  });

  it('a draft is invisible to students; a non-targeted student sees nothing', async () => {
    await seed(assignment('draft'));
    await assertFails(getDoc(doc(as('student1'), 'hanziAssignments/a1')));
    await testEnv.clearFirestore();
    await seed(assignment('published'));
    await assertFails(getDoc(doc(as('student2'), 'hanziAssignments/a1')));
    await assertFails(getDocs(collection(as('student2'), 'hanziAssignments/a1/items')));
  });

  it('another teacher cannot read the assignment or its keys', async () => {
    await seed(assignment('published'));
    await assertFails(getDoc(doc(as('teacher2'), 'hanziAssignments/a1')));
    await assertFails(getDocs(collection(as('teacher2'), 'hanziAssignments/a1/keys')));
  });

  it('students can read the vocabulary base? no — teachers only', async () => {
    await seed(assignment('published'));
    await assertFails(getDocs(collection(as('student1'), 'hanziWords')));
    await assertSucceeds(getDocs(collection(as('teacher2'), 'hanziWords')));
  });
});

describe('hanzi: teacher authoring', () => {
  it('course teacher creates a draft with items + keys in one batch', async () => {
    await seed(assignment('published')); // seeds users/course; a2 is the new one
    const db = as('teacher1');
    const batch = writeBatch(db);
    batch.set(doc(db, 'hanziAssignments/a2'), assignment('draft'));
    batch.set(doc(db, 'hanziAssignments/a2/items/it000'), { order: 0, type: 'pinyin', wordId: 'w1', showHanzi: '你', showPinyin: null, showTranslation: 'sen', target: null, charCount: 1 });
    batch.set(doc(db, 'hanziAssignments/a2/keys/it000'), { hanzi: '你', pinyin: 'nǐ', translation: 'sen', accepted: ['nǐ'] });
    await assertSucceeds(batch.commit());
  });

  it('a draft cannot be created with targets, or for someone else\'s course', async () => {
    await seed(assignment('published'));
    await assertFails(setDoc(doc(as('teacher1'), 'hanziAssignments/a3'), { ...assignment('draft'), targetStudentIds: ['student1'] }));
    await assertFails(setDoc(doc(as('teacher2'), 'hanziAssignments/a3'), { ...assignment('draft'), createdBy: 'teacher2' }));
  });

  it('items are frozen once published', async () => {
    await seed(assignment('published'));
    await assertFails(updateDoc(doc(as('teacher1'), 'hanziAssignments/a1/items/it000'), { showHanzi: '好' }));
    await assertFails(updateDoc(doc(as('teacher1'), 'hanziAssignments/a1'), { wordIds: ['w1', 'w2'] }));
    await assertSucceeds(updateDoc(doc(as('teacher1'), 'hanziAssignments/a1'), { status: 'closed' }));
  });
});

describe('hanzi: student submissions', () => {
  it('targeted student creates a draft and submits it', async () => {
    await seed(assignment('published'));
    const db = as('student1');
    await assertSucceeds(setDoc(doc(db, 'hanziSubmissions/a1_student1'), freshSubmission('draft', 0)));
    await assertSucceeds(
      updateDoc(doc(db, 'hanziSubmissions/a1_student1'), { status: 'submitted', attemptsUsed: 1, submittedAt: serverTimestamp(), savedAt: serverTimestamp() }),
    );
  });

  it('student can read their own not-yet-existing submission (no permission error on first open)', async () => {
    await seed(assignment('published'));
    await assertSucceeds(getDoc(doc(as('student1'), 'hanziSubmissions/a1_student1')));
    await assertFails(getDoc(doc(as('student2'), 'hanziSubmissions/a1_student1')));
  });

  it('non-targeted student cannot submit; nobody can submit for someone else', async () => {
    await seed(assignment('published'));
    await assertFails(setDoc(doc(as('student2'), 'hanziSubmissions/a1_student2'), { ...freshSubmission('draft', 0), studentId: 'student2' }));
    await assertFails(setDoc(doc(as('student2'), 'hanziSubmissions/a1_student1'), freshSubmission('draft', 0)));
  });

  it('student cannot write a score or review fields', async () => {
    await seed(assignment('published'), freshSubmission('draft', 0));
    const db = as('student1');
    await assertFails(updateDoc(doc(db, 'hanziSubmissions/a1_student1'), { teacherScore: 10 }));
    await assertFails(updateDoc(doc(db, 'hanziSubmissions/a1_student1'), { autoResult: { score: 10 } }));
    await assertFails(updateDoc(doc(db, 'hanziSubmissions/a1_student1'), { status: 'reviewed' }));
  });

  it('attempt limit is enforced; withdrawing to retry needs attempts left', async () => {
    await seed(assignment('published', { maxAttempts: 1 }), { ...freshSubmission('submitted', 1), submittedAt: TIMESTAMP_PAST });
    const db = as('student1');
    await assertFails(updateDoc(doc(db, 'hanziSubmissions/a1_student1'), { status: 'draft', autoResult: null, savedAt: serverTimestamp() }));
  });

  it('after the deadline (no late submissions) the student can no longer save or submit', async () => {
    await seed(assignment('published', { dueAt: Timestamp.fromDate(TIMESTAMP_PAST) }), freshSubmission('draft', 0));
    const db = as('student1');
    await assertFails(updateDoc(doc(db, 'hanziSubmissions/a1_student1'), { answers: {}, savedAt: serverTimestamp() }));
  });

  it('a submitted answer cannot be edited without withdrawing it first', async () => {
    await seed(assignment('published'), { ...freshSubmission('submitted', 1), submittedAt: TIMESTAMP_PAST });
    await assertFails(updateDoc(doc(as('student1'), 'hanziSubmissions/a1_student1'), { answers: {} }));
  });
});

describe('hanzi: teacher review', () => {
  it('course teacher reviews: score + feedback, separate from the auto result', async () => {
    await seed(assignment('published'), { ...freshSubmission('submitted', 1), submittedAt: TIMESTAMP_PAST });
    const db = as('teacher1');
    await assertSucceeds(updateDoc(doc(db, 'hanziSubmissions/a1_student1'), { autoResult: { score: 10, maxScore: 10, correct: 1, total: 1, verdicts: {}, wrongWords: [], checkedAt: serverTimestamp(), checkedBy: 'teacher' } }));
    await assertSucceeds(updateDoc(doc(db, 'hanziSubmissions/a1_student1'), { status: 'reviewed', teacherScore: 8, teacherFeedback: 'ok', reviewedBy: 'teacher1', reviewedAt: serverTimestamp() }));
  });

  it('teacher can never change the student\'s answers, or give more than maxScore', async () => {
    await seed(assignment('published'), { ...freshSubmission('submitted', 1), submittedAt: TIMESTAMP_PAST });
    const db = as('teacher1');
    await assertFails(updateDoc(doc(db, 'hanziSubmissions/a1_student1'), { answers: {} }));
    await assertFails(updateDoc(doc(db, 'hanziSubmissions/a1_student1'), { teacherScore: 11, status: 'reviewed' }));
  });

  it('another teacher cannot read or review', async () => {
    await seed(assignment('published'), { ...freshSubmission('submitted', 1), submittedAt: TIMESTAMP_PAST });
    await assertFails(getDoc(doc(as('teacher2'), 'hanziSubmissions/a1_student1')));
    await assertFails(updateDoc(doc(as('teacher2'), 'hanziSubmissions/a1_student1'), { teacherScore: 5 }));
  });

  it('a student\'s unsent draft cannot be reviewed', async () => {
    await seed(assignment('published'), freshSubmission('draft', 0));
    await assertFails(updateDoc(doc(as('teacher1'), 'hanziSubmissions/a1_student1'), { status: 'reviewed', teacherScore: 5 }));
  });
});
