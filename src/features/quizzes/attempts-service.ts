import { doc, getDoc, query, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { collectionRef } from '@/services/repository';
import { notifyUser } from '@/services/notifications';
import type { QuizAnswer, QuizAttempt, QuizItem, QuizKey } from '@/types/models';

function attemptsCol(quizId: string) {
  return collectionRef<QuizAttempt>(`quizzes/${quizId}/attempts`);
}

function attemptId(studentId: string, attemptNumber: number): string {
  return `${studentId}_${attemptNumber}`;
}

export function attemptRef(quizId: string, studentId: string, attemptNumber: number) {
  return doc(attemptsCol(quizId), attemptId(studentId, attemptNumber));
}

/** Teacher/admin grading view — list permission is scoped to them in firestore.rules. */
export function attemptsQuery(quizId: string) {
  return query(attemptsCol(quizId));
}

/**
 * Students can't run list queries on attempts (see firestore.rules), so
 * this finds their own attempts via bounded get() calls instead — cheap
 * since attemptsAllowed is always a small number in practice.
 */
export async function findMyAttempts(
  quizId: string,
  studentId: string,
  attemptsAllowed: number,
): Promise<{ id: string; data: QuizAttempt }[]> {
  const found: { id: string; data: QuizAttempt }[] = [];
  for (let n = 1; n <= attemptsAllowed; n++) {
    try {
      const snap = await getDoc(attemptRef(quizId, studentId, n));
      if (snap.exists()) found.push({ id: snap.id, data: snap.data() });
    } catch {
      // Permission-denied or any other read failure for this probe is
      // treated as "doesn't exist yet" — the caller only cares about
      // which attempts actually exist.
    }
  }
  return found;
}

export async function startAttempt(quizId: string, studentId: string, attemptNumber: number, maxScore: number): Promise<void> {
  const data: QuizAttempt = {
    studentId,
    attemptNumber,
    answers: [],
    startedAt: serverTimestamp() as unknown as Timestamp,
    submittedAt: null,
    status: 'in_progress',
    score: null,
    maxScore,
    gradedBy: null,
    gradedAt: null,
  };
  await setDoc(attemptRef(quizId, studentId, attemptNumber), data);
}

export async function saveAnswers(
  quizId: string,
  studentId: string,
  attemptNumber: number,
  answers: QuizAnswer[],
): Promise<void> {
  await updateDoc(attemptRef(quizId, studentId, attemptNumber), { answers });
}

export async function submitAttempt(
  quizId: string,
  studentId: string,
  attemptNumber: number,
  answers: QuizAnswer[],
): Promise<void> {
  await updateDoc(attemptRef(quizId, studentId, attemptNumber), {
    answers,
    submittedAt: serverTimestamp(),
    status: 'submitted',
  });
}

/** Runs entirely in the grader's session — items/keys/answers never leave it. */
export function autoGradeObjective(
  items: (QuizItem & { id: string })[],
  keys: Map<string, QuizKey>,
  answers: QuizAnswer[],
): number {
  let score = 0;
  const answerByQuestion = new Map(answers.map((a) => [a.questionId, a]));

  for (const item of items) {
    if (item.type === 'short_answer') continue; // always manual
    const key = keys.get(item.id);
    const answer = answerByQuestion.get(item.id);
    if (!key || !answer) continue;

    if (item.type === 'fill_blank') {
      if (answer.text.trim().toLowerCase() === key.correctText.trim().toLowerCase()) score += item.points;
      continue;
    }

    // single_choice / multiple_choice / true_false: exact set match.
    const selected = [...answer.selectedOptionIds].sort();
    const correct = [...key.correctOptionIds].sort();
    if (selected.length === correct.length && selected.every((id, i) => id === correct[i])) {
      score += item.points;
    }
  }
  return score;
}

export async function finalizeGrade(
  grader: { uid: string },
  quizId: string,
  studentId: string,
  attemptNumber: number,
  score: number,
  quizTitle: string,
  courseId: string,
): Promise<void> {
  await updateDoc(attemptRef(quizId, studentId, attemptNumber), {
    score,
    gradedBy: grader.uid,
    gradedAt: serverTimestamp(),
    status: 'graded',
  });
  try {
    await notifyUser(studentId, {
      type: 'grade_published',
      title: quizTitle,
      body: `Graded: ${score}`,
      link: `courses/${courseId}`,
    });
  } catch {
    // Best-effort — grading already succeeded either way.
  }
}
