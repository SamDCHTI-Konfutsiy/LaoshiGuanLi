import { useMemo } from 'react';
import { useCollection } from '@/hooks/useCollection';
import { coursesQuery, teachingCoursesQuery } from '@/features/courses/service';
import { groupsQuery } from '@/features/groups/service';
import { usersQuery } from '@/features/users/service';
import { allAssignmentsQuery, teacherAssignmentsQuery } from '@/features/hanzi/assignments-service';
import { allSubmissionsQuery, teacherSubmissionsQuery } from '@/features/hanzi/submissions-service';
import type { UserProfile } from '@/types/models';

/** Teacher: courses they teach. Admin: every course. */
export function useManagedCourses(profile: UserProfile | null) {
  const q = useMemo(() => {
    if (!profile) return null;
    return profile.role === 'admin' ? coursesQuery() : teachingCoursesQuery(profile.uid);
  }, [profile?.uid, profile?.role]);
  return useCollection(q);
}

export function useGroups() {
  const q = useMemo(() => groupsQuery(), []);
  return useCollection(q);
}

/** The student directory (teacher/admin can list users per firestore.rules). */
export function useStudents() {
  const q = useMemo(() => usersQuery('student'), []);
  const result = useCollection(q);
  const byId = useMemo(() => new Map(result.data.map((s) => [s.uid, s])), [result.data]);
  return { ...result, byId };
}

export function useManagedAssignments(profile: UserProfile | null) {
  const q = useMemo(() => {
    if (!profile) return null;
    return profile.role === 'admin' ? allAssignmentsQuery() : teacherAssignmentsQuery(profile.uid);
  }, [profile?.uid, profile?.role]);
  return useCollection(q);
}

export function useManagedSubmissions(profile: UserProfile | null) {
  const q = useMemo(() => {
    if (!profile) return null;
    return profile.role === 'admin' ? allSubmissionsQuery() : teacherSubmissionsQuery(profile.uid);
  }, [profile?.uid, profile?.role]);
  return useCollection(q);
}
