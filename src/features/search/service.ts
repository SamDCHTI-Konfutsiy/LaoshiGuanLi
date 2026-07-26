import { getDocs, query as fsQuery } from 'firebase/firestore';
import { coursesQuery } from '@/features/courses/service';
import { collectionRef } from '@/services/repository';
import { announcementsQuery } from '@/features/announcements/service';
import { usersQuery } from '@/features/users/service';
import type { Homework, Quiz } from '@/types/models';

export type SearchResultType = 'course' | 'homework' | 'quiz' | 'announcement' | 'user';

export interface SearchResult {
  type: SearchResultType;
  title: string;
  subtitle: string;
  link: string;
}

const homeworkCol = collectionRef<Homework>('homework');
const quizzesCol = collectionRef<Quiz>('quizzes');

function matches(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle);
}

export async function globalSearch(rawQuery: string, canSeeUsers: boolean): Promise<SearchResult[]> {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];

  const results: SearchResult[] = [];

  const [courses, homework, quizzes, announcements] = await Promise.all([
    getDocs(coursesQuery()),
    getDocs(fsQuery(homeworkCol)),
    getDocs(fsQuery(quizzesCol)),
    getDocs(announcementsQuery()),
  ]);

  const courseTitleById = new Map(courses.docs.map((d) => [d.id, d.data().title]));

  courses.docs.forEach((d) => {
    const c = d.data();
    if (matches(c.title, q) || matches(c.description, q)) {
      results.push({ type: 'course', title: c.title, subtitle: c.description, link: `courses/${d.id}` });
    }
  });

  homework.docs.forEach((d) => {
    const h = d.data();
    if (matches(h.title, q)) {
      results.push({
        type: 'homework',
        title: h.title,
        subtitle: courseTitleById.get(h.courseId) ?? '',
        link: `courses/${h.courseId}`,
      });
    }
  });

  quizzes.docs.forEach((d) => {
    const qz = d.data();
    if (matches(qz.title, q)) {
      results.push({
        type: 'quiz',
        title: qz.title,
        subtitle: courseTitleById.get(qz.courseId) ?? '',
        link: `courses/${qz.courseId}`,
      });
    }
  });

  announcements.docs.forEach((d) => {
    const a = d.data();
    if (matches(a.title, q) || matches(a.body, q)) {
      results.push({ type: 'announcement', title: a.title, subtitle: a.createdByName, link: 'announcements' });
    }
  });

  if (canSeeUsers) {
    try {
      const users = await getDocs(usersQuery());
      users.docs.forEach((d) => {
        const u = d.data();
        if (matches(u.name, q) || matches(u.email, q)) {
          results.push({ type: 'user', title: u.name, subtitle: u.email, link: 'users' });
        }
      });
    } catch {
      // No directory access (shouldn't happen for admin/teacher, but never let this break the rest of the search).
    }
  }

  return results;
}
