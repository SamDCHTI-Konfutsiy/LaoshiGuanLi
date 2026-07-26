import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
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

async function seed(status: 'published' | 'closed' = 'published') {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users/teacher1'), {
      uid: 'teacher1', role: 'teacher', status: 'active', name: 'T', email: 't@x.com',
      locale: 'en', groupIds: [], fcmTokens: [],
    });
    await setDoc(doc(db, 'users/admin1'), {
      uid: 'admin1', role: 'admin', status: 'active', name: 'A', email: 'a@x.com',
      locale: 'en', groupIds: [], fcmTokens: [],
    });
    await setDoc(doc(db, 'courses/c1'), {
      title: 'Course 1', description: '', teacherId: 'teacher1', groupIds: ['g1'], semesterId: 's1', archived: false,
    });
    await setDoc(doc(db, 'homework/hw1'), {
      courseId: 'c1', groupIds: ['g1'], lessonId: null, title: 'HW 1', instructions: '',
      attachments: [], publishAt: TIMESTAMP_FUTURE, dueAt: TIMESTAMP_FUTURE,
      allowLate: false, maxScore: 100, status, createdBy: 'teacher1',
    });
  });
}

describe('homework deadline lock', () => {
  it('teacher cannot move dueAt once the assignment is published', async () => {
    await seed('published');
    const teacherDb = testEnv.authenticatedContext('teacher1').firestore();
    const before = (await getDoc(doc(teacherDb, 'homework/hw1'))).data()!;
    await assertFails(
      updateDoc(doc(teacherDb, 'homework/hw1'), {
        ...before,
        dueAt: Timestamp.fromDate(new Date(Date.now() + 999 * 24 * 60 * 60 * 1000)),
      }),
    );
  });

  it('teacher can move status forward (published -> closed) without touching dates', async () => {
    await seed('published');
    const teacherDb = testEnv.authenticatedContext('teacher1').firestore();
    const before = (await getDoc(doc(teacherDb, 'homework/hw1'))).data()!;
    await assertSucceeds(updateDoc(doc(teacherDb, 'homework/hw1'), { ...before, status: 'closed' }));
  });

  it('teacher cannot reopen a closed assignment back to published', async () => {
    await seed('closed');
    const teacherDb = testEnv.authenticatedContext('teacher1').firestore();
    const before = (await getDoc(doc(teacherDb, 'homework/hw1'))).data()!;
    await assertFails(updateDoc(doc(teacherDb, 'homework/hw1'), { ...before, status: 'published' }));
  });

  it('admin CAN change dueAt on a published assignment', async () => {
    await seed('published');
    const adminDb = testEnv.authenticatedContext('admin1').firestore();
    const before = (await getDoc(doc(adminDb, 'homework/hw1'))).data()!;
    await assertSucceeds(
      updateDoc(doc(adminDb, 'homework/hw1'), {
        ...before,
        dueAt: Timestamp.fromDate(new Date(Date.now() + 999 * 24 * 60 * 60 * 1000)),
      }),
    );
  });
});
