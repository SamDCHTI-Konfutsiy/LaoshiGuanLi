import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
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
    await setDoc(doc(db, 'users/teacher1'), {
      uid: 'teacher1', role: 'teacher', status: 'active', name: 'T', email: 't@x.com',
      locale: 'en', groupIds: [], fcmTokens: [],
    });
    await setDoc(doc(db, 'users/admin1'), {
      uid: 'admin1', role: 'admin', status: 'active', name: 'A', email: 'a@x.com',
      locale: 'en', groupIds: [], fcmTokens: [],
    });
  });
}

describe('audit log', () => {
  it('a teacher can create an audit log entry for their own action', async () => {
    await seed();
    const teacherDb = testEnv.authenticatedContext('teacher1').firestore();
    await assertSucceeds(
      setDoc(doc(collection(teacherDb, 'auditLogs')), {
        actorId: 'teacher1', actorName: 'T', action: 'lesson.create', targetType: 'lesson',
        targetId: 'x', before: null, after: {}, reason: '',
      }),
    );
  });

  it("a teacher cannot create an audit log entry impersonating someone else", async () => {
    await seed();
    const teacherDb = testEnv.authenticatedContext('teacher1').firestore();
    await assertFails(
      setDoc(doc(collection(teacherDb, 'auditLogs')), {
        actorId: 'someone-else', actorName: 'T', action: 'lesson.create', targetType: 'lesson',
        targetId: 'x', before: null, after: {}, reason: '',
      }),
    );
  });

  it('a teacher cannot read the audit log', async () => {
    await seed();
    const teacherDb = testEnv.authenticatedContext('teacher1').firestore();
    await assertFails(getDocs(collection(teacherDb, 'auditLogs')));
  });

  it('an admin can read the audit log', async () => {
    await seed();
    const adminDb = testEnv.authenticatedContext('admin1').firestore();
    await assertSucceeds(getDocs(collection(adminDb, 'auditLogs')));
  });
});
