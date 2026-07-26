import {
  arrayRemove,
  arrayUnion,
  doc,
  increment,
  query,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/firebase/db';
import { appendAuditLog } from '@/services/audit';
import { collectionRef, createWithAudit, deleteWithAudit, updateWithAudit } from '@/services/repository';
import type { Group, GroupMember, UserProfile, WithId } from '@/types/models';

const groupsCol = collectionRef<Group>('groups');
const usersCol = collectionRef<UserProfile>('users');

function membersCol(groupId: string) {
  return collectionRef<GroupMember>(`groups/${groupId}/members`);
}

/** No orderBy — group lists are small; sort client-side. */
export function groupsQuery() {
  return query(groupsCol);
}

export function groupMembersQuery(groupId: string) {
  return query(membersCol(groupId));
}

export interface GroupInput {
  name: string;
  semesterId: string;
  teacherIds: string[];
}

export function createGroup(actor: UserProfile, input: GroupInput, reason: string) {
  const data: Group = { ...input, memberCount: 0, createdAt: serverTimestamp() as unknown as Timestamp };
  return createWithAudit(groupsCol, 'group', data, { actor, reason });
}

export function updateGroup(actor: UserProfile, id: string, before: Group, input: GroupInput, reason: string) {
  return updateWithAudit(groupsCol, 'group', id, before, { ...before, ...input }, { actor, reason });
}

export function deleteGroup(actor: UserProfile, id: string, before: Group, reason: string) {
  return deleteWithAudit(groupsCol, 'group', id, before, { actor, reason });
}

export async function addGroupMember(
  actor: UserProfile,
  group: WithId<Group>,
  student: UserProfile,
  reason: string,
): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(membersCol(group.id), student.uid), { joinedAt: serverTimestamp() as unknown as Timestamp });
  batch.update(doc(groupsCol, group.id), { memberCount: increment(1) });
  batch.update(doc(usersCol, student.uid), { groupIds: arrayUnion(group.id) });
  appendAuditLog(batch, {
    actorId: actor.uid,
    actorName: actor.name,
    action: 'group.addMember',
    targetType: 'group',
    targetId: group.id,
    before: null,
    after: { studentUid: student.uid, studentName: student.name },
    reason,
  });
  await batch.commit();
}

export async function removeGroupMember(
  actor: UserProfile,
  group: WithId<Group>,
  student: UserProfile,
  reason: string,
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(membersCol(group.id), student.uid));
  batch.update(doc(groupsCol, group.id), { memberCount: increment(-1) });
  batch.update(doc(usersCol, student.uid), { groupIds: arrayRemove(group.id) });
  appendAuditLog(batch, {
    actorId: actor.uid,
    actorName: actor.name,
    action: 'group.removeMember',
    targetType: 'group',
    targetId: group.id,
    before: { studentUid: student.uid, studentName: student.name },
    after: null,
    reason,
  });
  await batch.commit();
}
