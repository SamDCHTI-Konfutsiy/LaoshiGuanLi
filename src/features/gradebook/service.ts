import { doc, getDoc, getDocs } from 'firebase/firestore';
import { collectionRef } from '@/services/repository';
import { resolveGroupMemberUids } from '@/services/notifications';
import { homeworkQuery } from '@/features/homework/service';
import { submissionsQuery } from '@/features/homework/submissions-service';
import { quizzesQuery } from '@/features/quizzes/service';
import { attemptsQuery } from '@/features/quizzes/attempts-service';
import { courseManualGradesQuery } from '@/features/grades/service';
import { usersQuery } from '@/features/users/service';
import type { Course } from '@/types/models';

const coursesCol = collectionRef<Course>('courses');

export interface GradebookColumn {
  id: string;
  title: string;
  maxScore: number;
}

export interface GradebookManualEntry {
  id: string;
  studentId: string;
  title: string;
  score: number;
  maxScore: number;
}

export interface GradebookData {
  students: { uid: string; name: string }[];
  homework: GradebookColumn[];
  quizzes: GradebookColumn[];
  manualGrades: GradebookManualEntry[];
  /** [columnId][studentId] -> score */
  homeworkScores: Record<string, Record<string, number>>;
  quizScores: Record<string, Record<string, number>>;
}

export async function loadGradebook(courseId: string): Promise<GradebookData> {
  const courseSnap = await getDoc(doc(coursesCol, courseId));
  const groupIds = courseSnap.exists() ? courseSnap.data().groupIds : [];

  const [studentUids, studentDocs, hwDocs, quizDocs, manualGradeDocs] = await Promise.all([
    resolveGroupMemberUids(groupIds),
    getDocs(usersQuery('student')),
    getDocs(homeworkQuery(courseId)),
    getDocs(quizzesQuery(courseId)),
    getDocs(courseManualGradesQuery(courseId)),
  ]);

  const studentNameByUid = new Map(studentDocs.docs.map((d) => [d.id, d.data().name]));
  const students = studentUids
    .map((uid) => ({ uid, name: studentNameByUid.get(uid) ?? uid }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const publishedHomework = hwDocs.docs.filter((d) => d.data().status !== 'draft');
  const homework: GradebookColumn[] = publishedHomework.map((d) => ({
    id: d.id,
    title: d.data().title,
    maxScore: d.data().maxScore,
  }));
  const homeworkScores: Record<string, Record<string, number>> = {};
  await Promise.all(
    publishedHomework.map(async (hwDoc) => {
      const subs = await getDocs(submissionsQuery(hwDoc.id));
      const scores: Record<string, number> = {};
      subs.docs.forEach((s) => {
        const data = s.data();
        if (data.score !== null) scores[s.id] = data.score;
      });
      homeworkScores[hwDoc.id] = scores;
    }),
  );

  const publishedQuizzes = quizDocs.docs.filter((d) => d.data().status !== 'draft');
  const quizzes: GradebookColumn[] = [];
  const quizScores: Record<string, Record<string, number>> = {};
  await Promise.all(
    publishedQuizzes.map(async (quizDoc) => {
      const attempts = await getDocs(attemptsQuery(quizDoc.id));
      const scores: Record<string, number> = {};
      let maxScore = 0;
      attempts.docs.forEach((a) => {
        const data = a.data();
        maxScore = data.maxScore;
        if (data.status === 'graded' && data.score !== null) {
          const existing = scores[data.studentId];
          if (existing === undefined || data.score > existing) scores[data.studentId] = data.score;
        }
      });
      quizScores[quizDoc.id] = scores;
      quizzes.push({ id: quizDoc.id, title: quizDoc.data().title, maxScore });
    }),
  );

  const manualGrades: GradebookManualEntry[] = manualGradeDocs.docs.map((d) => ({
    id: d.id,
    studentId: d.data().studentId,
    title: d.data().title,
    score: d.data().score,
    maxScore: d.data().maxScore,
  }));

  return { students, homework, quizzes, manualGrades, homeworkScores, quizScores };
}
