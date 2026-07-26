import { onSchedule } from 'firebase-functions/v2/scheduler';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from './admin';

async function groupMemberUids(groupIds: string[]): Promise<string[]> {
  const uids = new Set<string>();
  for (const groupId of groupIds) {
    const snap = await db.collection(`groups/${groupId}/members`).get();
    snap.forEach((d) => uids.add(d.id));
  }
  return [...uids];
}

async function notify(uid: string, type: string, title: string, body: string, link: string): Promise<void> {
  await db.collection(`notifications/${uid}/items`).add({
    type,
    title,
    body,
    link,
    read: false,
    createdAt: Timestamp.now(),
  });
}

/**
 * Runs hourly. A 1-hour-before reminder is a reasonable single tier given
 * an hourly schedule; finer-grained tiers (e.g. 24h) would need a second,
 * less-frequent schedule and their own "remindedXXh" flag, following the
 * same pattern below.
 */
export const deadlineReminders = onSchedule('every 60 minutes', async () => {
  const now = Timestamp.now();
  const in65Min = Timestamp.fromMillis(now.toMillis() + 65 * 60 * 1000);

  const hwSnap = await db
    .collection('homework')
    .where('status', '==', 'published')
    .where('dueAt', '>=', now)
    .where('dueAt', '<=', in65Min)
    .get();

  for (const hwDoc of hwSnap.docs) {
    const hw = hwDoc.data();
    if (hw.reminded1h) continue;

    const uids = await groupMemberUids(hw.groupIds ?? []);
    const submitted = await db.collection(`homework/${hwDoc.id}/submissions`).get();
    const submittedIds = new Set(submitted.docs.map((d) => d.id));
    const pending = uids.filter((uid) => !submittedIds.has(uid));

    await Promise.all(
      pending.map((uid) =>
        notify(uid, 'homework_published', hw.title, `Due in about an hour: ${hw.title}`, `courses/${hw.courseId}`),
      ),
    );
    await hwDoc.ref.update({ reminded1h: true });
  }

  const quizSnap = await db
    .collection('quizzes')
    .where('status', '==', 'published')
    .where('dueAt', '>=', now)
    .where('dueAt', '<=', in65Min)
    .get();

  for (const quizDoc of quizSnap.docs) {
    const quiz = quizDoc.data();
    if (quiz.reminded1h) continue;

    const uids = await groupMemberUids(quiz.groupIds ?? []);
    const attempts = await db.collection(`quizzes/${quizDoc.id}/attempts`).get();
    const attemptedIds = new Set(attempts.docs.map((d) => d.data().studentId as string));
    const pending = uids.filter((uid) => !attemptedIds.has(uid));

    await Promise.all(
      pending.map((uid) =>
        notify(uid, 'quiz_published', quiz.title, `Due in about an hour: ${quiz.title}`, `courses/${quiz.courseId}`),
      ),
    );
    await quizDoc.ref.update({ reminded1h: true });
  }
});
