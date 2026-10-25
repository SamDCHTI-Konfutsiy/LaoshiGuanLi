import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './admin';
import { gradeSubmission, type ExerciseType } from './hanziChecking';

/**
 * Optional. Grades a Hanzi submission server-side the moment a student
 * submits it, so the student sees the automatic result straight away.
 *
 * The website does NOT depend on this: if the function isn't deployed,
 * the same check (identical code, see hanziChecking.ts) runs in the
 * teacher's browser when they open the assignment. Answer keys are only
 * ever read here (Admin SDK) or in a teacher/admin session — never by a
 * student's browser.
 */
export const hanziAutoCheck = onDocumentWritten('hanziSubmissions/{subId}', async (event) => {
  const after = event.data?.after.data();
  if (!after) return; // deleted
  if (after.status !== 'submitted' || after.autoResult) return; // nothing to do / already checked

  const assignmentId = after.assignmentId as string;
  const aSnap = await db.doc(`hanziAssignments/${assignmentId}`).get();
  const assignment = aSnap.data();
  if (!assignment) return;

  const [itemsSnap, keysSnap] = await Promise.all([
    db.collection(`hanziAssignments/${assignmentId}/items`).get(),
    db.collection(`hanziAssignments/${assignmentId}/keys`).get(),
  ]);
  const items = itemsSnap.docs.map((d) => ({
    id: d.id,
    type: d.get('type') as ExerciseType,
    charCount: d.get('charCount') as number,
  }));
  const keys = new Map(
    keysSnap.docs.map((d) => [d.id, { accepted: (d.get('accepted') as string[]) ?? [], hanzi: d.get('hanzi') as string }]),
  );

  const result = gradeSubmission(
    items,
    keys,
    (after.answers ?? {}) as Record<string, { text?: string }>,
    {
      pinyinRequireTones: assignment.pinyinRequireTones !== false,
      writingMistakeTolerance: typeof assignment.writingMistakeTolerance === 'number' ? assignment.writingMistakeTolerance : 3,
    },
    typeof assignment.maxScore === 'number' ? assignment.maxScore : 10,
  );

  // Only write if the student hasn't changed the submission in the meantime.
  await db.runTransaction(async (tx) => {
    const ref = event.data!.after.ref;
    const fresh = await tx.get(ref);
    const data = fresh.data();
    if (!data || data.status !== 'submitted' || data.autoResult) return;
    if (data.submittedAt?.toMillis?.() !== after.submittedAt?.toMillis?.()) return;
    tx.update(ref, { autoResult: { ...result, checkedAt: FieldValue.serverTimestamp(), checkedBy: 'function' } });
  });
});
