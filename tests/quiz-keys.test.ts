import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { makeTestEnv, TIMESTAMP_FUTURE } from './setup';

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

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/teacher1'), {
      uid: 'teacher1', role: 'teacher', status: 'active', name: 'T', email: 't@x.com',
      locale: 'en', groupIds: [], fcmTokens: [],
    });
    await setDoc(doc(db, 'users/student1'), {
      uid: 'student1', role: 'student', status: 'active', name: 'S', email: 's@x.com',
      locale: 'en', groupIds: ['g1'], fcmTokens: [],
    });
    await setDoc(doc(db, 'users/otherTeacher'), {
      uid: 'otherTeacher', role: 'teacher', status: 'active', name: 'OT', email: 'ot@x.com',
      locale: 'en', groupIds: [], fcmTokens: [],
    });
    await setDoc(doc(db, 'courses/c1'), {
      title: 'Course 1', description: '', teacherId: 'teacher1', groupIds: ['g1'], semesterId: 's1', archived: false,
    });
    await setDoc(doc(db, 'quizzes/q1'), {
      courseId: 'c1', groupIds: ['g1'], title: 'Quiz 1', durationMin: 30,
      publishAt: TIMESTAMP_FUTURE, dueAt: TIMESTAMP_FUTURE, attemptsAllowed: 1,
      shuffle: false, passingScore: 60, autoGrade: true, status: 'published', createdBy: 'teacher1',
    });
    await setDoc(doc(db, 'quizzes/q1/keys/item1'), { correctOptionIds: ['a'], correctText: '' });
  });
}

describe('quiz answer keys', () => {
  it('a student can never read the answer key', async () => {
    await seed();
    const studentDb = testEnv.authenticatedContext('student1').firestore();
    await assertFails(getDoc(doc(studentDb, 'quizzes/q1/keys/item1')));
  });

  it('an unauthenticated request can never read the answer key', async () => {
    await seed();
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, 'quizzes/q1/keys/item1')));
  });

  it("a different teacher (not this course's) cannot read the answer key", async () => {
    await seed();
    const otherDb = testEnv.authenticatedContext('otherTeacher').firestore();
    await assertFails(getDoc(doc(otherDb, 'quizzes/q1/keys/item1')));
  });

  it("the course's own teacher can read the answer key", async () => {
    await seed();
    const teacherDb = testEnv.authenticatedContext('teacher1').firestore();
    await assertSucceeds(getDoc(doc(teacherDb, 'quizzes/q1/keys/item1')));
  });
});
