import { doc, getDoc, getDocs } from 'firebase/firestore';
import { usersQuery, pendingUsersQuery } from '@/features/users/service';
import { coursesQuery, teachingCoursesQuery, enrolledCoursesQuery } from '@/features/courses/service';
import { groupsQuery } from '@/features/groups/service';
import { resolveGroupMemberUids } from '@/services/notifications';
import { currentYearMonth, paymentDocId, paymentsForMonthQuery } from '@/features/payments/service';
import { collectionRef } from '@/services/repository';
import { studentAssignmentsQuery } from '@/features/hanzi/assignments-service';
import { allSubmissionsQuery, studentSubmissionsQuery, teacherSubmissionsQuery } from '@/features/hanzi/submissions-service';
import type { Payment, UserProfile } from '@/types/models';

/**
 * Hanzi counters are best-effort: if firestore.rules hasn't been
 * re-published with the Hanzi section yet, these reads are denied — the
 * dashboard then simply omits the card (null) instead of failing.
 */
async function hanziToReview(scope: { admin: true } | { teacherId: string }): Promise<number | null> {
  try {
    const snap = await getDocs('admin' in scope ? allSubmissionsQuery() : teacherSubmissionsQuery(scope.teacherId));
    return snap.docs.filter((d) => ['submitted', 'in_review'].includes(d.data().status)).length;
  } catch {
    return null;
  }
}

async function hanziOpenForStudent(profile: UserProfile): Promise<number | null> {
  try {
    const [assignments, subs] = await Promise.all([getDocs(studentAssignmentsQuery(profile.uid)), getDocs(studentSubmissionsQuery(profile.uid))]);
    const status = new Map(subs.docs.map((d) => [d.data().assignmentId, d.data().status]));
    return assignments.docs.filter((d) => {
      if (d.data().status !== 'published') return false;
      const s = status.get(d.id);
      return s === undefined || s === 'draft' || s === 'needs_revision';
    }).length;
  } catch {
    return null;
  }
}

const paymentsCol = collectionRef<Payment>('payments');

export interface AdminStats {
  activeStudents: number;
  activeTeachers: number;
  pendingApprovals: number;
  courses: number;
  groups: number;
  unpaidThisMonth: number;
  hanziToReview: number | null;
}

export async function loadAdminStats(): Promise<AdminStats> {
  const yearMonth = currentYearMonth();
  const [students, teachers, pending, courses, groups, payments] = await Promise.all([
    getDocs(usersQuery('student')),
    getDocs(usersQuery('teacher')),
    getDocs(pendingUsersQuery()),
    getDocs(coursesQuery()),
    getDocs(groupsQuery()),
    getDocs(paymentsForMonthQuery(yearMonth)),
  ]);
  const hanzi = await hanziToReview({ admin: true });
  const activeStudentUids = students.docs.filter((d) => d.data().status === 'active').map((d) => d.id);
  const paidUids = new Set(payments.docs.filter((d) => d.data().paid).map((d) => d.data().studentId));
  return {
    activeStudents: activeStudentUids.length,
    activeTeachers: teachers.docs.filter((d) => d.data().status === 'active').length,
    pendingApprovals: pending.size,
    courses: courses.size,
    groups: groups.size,
    unpaidThisMonth: activeStudentUids.filter((uid) => !paidUids.has(uid)).length,
    hanziToReview: hanzi,
  };
}

export interface TeacherStats {
  courses: number;
  students: number;
  hanziToReview: number | null;
}

export async function loadTeacherStats(profile: UserProfile): Promise<TeacherStats> {
  const coursesSnap = await getDocs(teachingCoursesQuery(profile.uid));
  const groupIds = new Set<string>();
  coursesSnap.docs.forEach((d) => d.data().groupIds.forEach((g) => groupIds.add(g)));
  const [studentUids, hanzi] = await Promise.all([resolveGroupMemberUids([...groupIds]), hanziToReview({ teacherId: profile.uid })]);
  return { courses: coursesSnap.size, students: studentUids.length, hanziToReview: hanzi };
}

export interface StudentStats {
  courses: number;
  paidThisMonth: boolean;
  hanziOpen: number | null;
}

export async function loadStudentStats(profile: UserProfile): Promise<StudentStats> {
  const coursesSnap = profile.groupIds.length > 0 ? await getDocs(enrolledCoursesQuery(profile.groupIds)) : null;
  const yearMonth = currentYearMonth();
  const [payDoc, hanziOpen] = await Promise.all([
    getDoc(doc(paymentsCol, paymentDocId(profile.uid, yearMonth))).catch(() => null),
    hanziOpenForStudent(profile),
  ]);
  return { courses: coursesSnap?.size ?? 0, paidThisMonth: Boolean(payDoc?.exists() && payDoc.data()?.paid), hanziOpen };
}
