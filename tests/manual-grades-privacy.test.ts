import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
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
    await setDoc(doc(db, 'users/student1'), {
      uid: 'student1', role: 'student', status: 'active', name: 'S1', email: 's1@x.com',
      locale: 'en', groupIds: ['g1'], fcmTokens: [],
    });
    await setDoc(doc(db, 'users/student2'), {
      uid: 'student2', role: 'student', status: 'active', name: 'S2', email: 's2@x.com',
      locale: 'en', groupIds: ['g1'], fcmTokens: [],
    });
    await setDoc(doc(db, 'courses/c1'), {
      title: 'Course 1', description: '', teacherId: 'teacher1', groupIds: ['g1'], semesterId: 's1', archived: false,
    });
    await setDoc(doc(db, 'manualGrades/mg1'), {
      studentId: 'student1', courseId: 'c1', title: 'Participation', score: 9, maxScore: 10, comment: '',
      createdBy: 'teacher1',
    });
  });
}

describe('manual grades privacy', () => {
  it('a student can read their own manual grade', async () => {
    await seed();
    const studentDb = testEnv.authenticatedContext('student1').firestore();
    await assertSucceeds(getDoc(doc(studentDb, 'manualGrades/mg1')));
  });

  it("a student cannot read a classmate's manual grade", async () => {
    await seed();
    const otherStudentDb = testEnv.authenticatedContext('student2').firestore();
    await assertFails(getDoc(doc(otherStudentDb, 'manualGrades/mg1')));
  });

  it("the course's teacher can read any student's manual grade", async () => {
    await seed();
    const teacherDb = testEnv.authenticatedContext('teacher1').firestore();
    await assertSucceeds(getDoc(doc(teacherDb, 'manualGrades/mg1')));
  });

  it('a student cannot create their own manual grade', async () => {
    await seed();
    const studentDb = testEnv.authenticatedContext('student1').firestore();
    await assertFails(
      setDoc(doc(studentDb, 'manualGrades/mg2'), {
        studentId: 'student1', courseId: 'c1', title: 'Self-graded', score: 100, maxScore: 100, comment: '',
        createdBy: 'student1',
      }),
    );
  });
});
