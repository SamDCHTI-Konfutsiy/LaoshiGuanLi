import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { makeTestEnv } from './setup';

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
    await setDoc(doc(db, 'users/student1'), {
      uid: 'student1', role: 'student', status: 'active', name: 'Original Name', email: 's@x.com',
      locale: 'en', groupIds: [], fcmTokens: [],
    });
    await setDoc(doc(db, 'users/teacher1'), {
      uid: 'teacher1', role: 'teacher', status: 'active', name: 'Original Teacher', email: 't@x.com',
      locale: 'en', groupIds: [], fcmTokens: [],
    });
  });
}

describe('self-service name editing', () => {
  it("a student cannot change their own name", async () => {
    await seed();
    const studentDb = testEnv.authenticatedContext('student1').firestore();
    await assertFails(updateDoc(doc(studentDb, 'users/student1'), { name: 'Hacked Name' }));
  });

  it('a student CAN change their own locale', async () => {
    await seed();
    const studentDb = testEnv.authenticatedContext('student1').firestore();
    await assertSucceeds(updateDoc(doc(studentDb, 'users/student1'), { locale: 'uz' }));
  });

  it('a teacher CAN change their own name', async () => {
    await seed();
    const teacherDb = testEnv.authenticatedContext('teacher1').firestore();
    await assertSucceeds(updateDoc(doc(teacherDb, 'users/teacher1'), { name: 'New Teacher Name' }));
  });

  it('a student cannot change someone else\'s profile at all', async () => {
    await seed();
    const studentDb = testEnv.authenticatedContext('student1').firestore();
    await assertFails(updateDoc(doc(studentDb, 'users/teacher1'), { locale: 'uz' }));
  });
});
