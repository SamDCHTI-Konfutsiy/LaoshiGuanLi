import { doc, getDoc, getDocs } from 'firebase/firestore';
import { usersQuery, pendingUsersQuery } from '@/features/users/service';
import { coursesQuery, teachingCoursesQuery, enrolledCoursesQuery } from '@/features/courses/service';
import { groupsQuery } from '@/features/groups/service';
import { resolveGroupMemberUids } from '@/services/notifications';
import { currentYearMonth, paymentDocId, paymentsForMonthQuery } from '@/features/payments/service';
import { collectionRef } from '@/services/repository';
import type { Payment, UserProfile } from '@/types/models';

const paymentsCol = collectionRef<Payment>('payments');

export interface AdminStats {
  activeStudents: number;
  activeTeachers: number;
  pendingApprovals: number;
  courses: number;
  groups: number;
  unpaidThisMonth: number;
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
  const activeStudentUids = students.docs.filter((d) => d.data().status === 'active').map((d) => d.id);
  const paidUids = new Set(payments.docs.filter((d) => d.data().paid).map((d) => d.data().studentId));
  return {
    activeStudents: activeStudentUids.length,
    activeTeachers: teachers.docs.filter((d) => d.data().status === 'active').length,
    pendingApprovals: pending.size,
    courses: courses.size,
    groups: groups.size,
    unpaidThisMonth: activeStudentUids.filter((uid) => !paidUids.has(uid)).length,
  };
}

export interface TeacherStats {
  courses: number;
  students: number;
}

export async function loadTeacherStats(profile: UserProfile): Promise<TeacherStats> {
  const coursesSnap = await getDocs(teachingCoursesQuery(profile.uid));
  const groupIds = new Set<string>();
  coursesSnap.docs.forEach((d) => d.data().groupIds.forEach((g) => groupIds.add(g)));
  const studentUids = await resolveGroupMemberUids([...groupIds]);
  return { courses: coursesSnap.size, students: studentUids.length };
}

export interface StudentStats {
  courses: number;
  paidThisMonth: boolean;
}

export async function loadStudentStats(profile: UserProfile): Promise<StudentStats> {
  const coursesSnap = profile.groupIds.length > 0 ? await getDocs(enrolledCoursesQuery(profile.groupIds)) : null;
  const yearMonth = currentYearMonth();
  const payDoc = await getDoc(doc(paymentsCol, paymentDocId(profile.uid, yearMonth))).catch(() => null);
  return { courses: coursesSnap?.size ?? 0, paidThisMonth: Boolean(payDoc?.exists() && payDoc.data()?.paid) };
}
