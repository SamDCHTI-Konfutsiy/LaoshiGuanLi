import { doc, getDoc, getDocs, query, serverTimestamp, Timestamp } from 'firebase/firestore';
import { collectionRef, createWithAudit, deleteWithAudit } from '@/services/repository';
import { notifyUsers, resolveGroupMemberUids } from '@/services/notifications';
import { usersQuery } from '@/features/users/service';
import type { AnnouncementScope, Role } from '@/types/enums';
import type { Announcement, Course, UserProfile } from '@/types/models';

const announcementsCol = collectionRef<Announcement>('announcements');
const coursesCol = collectionRef<Course>('courses');

/** No orderBy — client sorts by publishAt; audience filtering also happens client-side. */
export function announcementsQuery() {
  return query(announcementsCol);
}

export interface AnnouncementInput {
  title: string;
  body: string;
  audienceScope: AnnouncementScope;
  audienceRole: Role | null;
  courseId: string | null;
  groupId: string | null;
}

/**
 * True if `viewer` is in this announcement's intended audience.
 * `courseGroupIds` maps courseId -> that course's groupIds, needed to
 * resolve 'course'-scoped announcements for students (who are matched by
 * group, not course, since course membership isn't stored on the profile).
 */
export function isInAudience(
  announcement: Announcement,
  viewer: UserProfile,
  courseGroupIds: Map<string, string[]>,
): boolean {
  if (announcement.audienceScope === 'all') return true;
  if (announcement.audienceScope === 'role') return announcement.audienceRole === viewer.role;
  if (viewer.role !== 'student') return true; // teachers/admin see all course/group-scoped announcements
  if (announcement.audienceScope === 'group') return viewer.groupIds.includes(announcement.groupId ?? '');
  if (announcement.audienceScope === 'course') {
    const groupIds = courseGroupIds.get(announcement.courseId ?? '') ?? [];
    return viewer.groupIds.some((g) => groupIds.includes(g));
  }
  return false;
}

export async function createAnnouncement(actor: UserProfile, input: AnnouncementInput, reason: string): Promise<void> {
  const data: Announcement = {
    ...input,
    publishAt: Timestamp.now(),
    createdBy: actor.uid,
    createdByName: actor.name,
    createdAt: serverTimestamp() as unknown as Timestamp,
  };
  await createWithAudit(announcementsCol, 'announcement', data, { actor, reason });

  try {
    let targetUids: string[] = [];
    if (input.audienceScope === 'all') {
      const everyone = await getDocs(usersQuery());
      targetUids = everyone.docs.map((d) => d.id);
    } else if (input.audienceScope === 'role' && input.audienceRole) {
      const roleUsers = await getDocs(usersQuery(input.audienceRole));
      targetUids = roleUsers.docs.map((d) => d.id);
    } else if (input.audienceScope === 'group' && input.groupId) {
      targetUids = await resolveGroupMemberUids([input.groupId]);
    } else if (input.audienceScope === 'course' && input.courseId) {
      const courseSnap = await getDoc(doc(coursesCol, input.courseId));
      if (courseSnap.exists()) targetUids = await resolveGroupMemberUids(courseSnap.data().groupIds);
    }
    await notifyUsers(targetUids, {
      type: 'announcement',
      title: input.title,
      body: input.body.length > 200 ? `${input.body.slice(0, 200)}…` : input.body,
      link: 'announcements',
    });
  } catch {
    // Notification fan-out is best-effort — the announcement itself already saved.
  }
}

export function deleteAnnouncement(actor: UserProfile, id: string, before: Announcement, reason: string) {
  return deleteWithAudit(announcementsCol, 'announcement', id, before, { actor, reason });
}
