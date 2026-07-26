import { query, where } from 'firebase/firestore';
import { collectionRef, updateWithAudit } from '@/services/repository';
import type { Role } from '@/types/enums';
import type { UserProfile, WithId } from '@/types/models';

const usersCol = collectionRef<UserProfile>('users');

/** No orderBy — user lists are small at this scale; sort client-side. */
export function usersQuery(role?: Role) {
  return role ? query(usersCol, where('role', '==', role)) : query(usersCol);
}

export function pendingUsersQuery() {
  return query(usersCol, where('status', '==', 'pending'));
}

/** Approves a pending signup. The admin confirms (or corrects) the role and can assign groups. */
export function approveUser(
  actor: UserProfile,
  target: WithId<UserProfile>,
  finalRole: Role,
  groupIds: string[],
  reason: string,
) {
  return updateWithAudit(
    usersCol,
    'user',
    target.uid,
    target,
    { ...target, status: 'active', role: finalRole, groupIds },
    { actor, reason },
  );
}

/** Rejects a pending signup — the account is left permanently disabled (no Cloud Functions yet to delete the Auth record). */
export function rejectUser(actor: UserProfile, target: WithId<UserProfile>, reason: string) {
  return updateWithAudit(usersCol, 'user', target.uid, target, { ...target, status: 'disabled' }, { actor, reason });
}

/** Disables or re-enables an already-approved account. Role is never touched here. */
export function setActiveStatus(
  actor: UserProfile,
  target: WithId<UserProfile>,
  status: 'active' | 'disabled',
  reason: string,
) {
  return updateWithAudit(usersCol, 'user', target.uid, target, { ...target, status }, { actor, reason });
}

/** Admin corrects a user's name — the one field students can't self-edit (see firestore.rules). */
export function renameUser(actor: UserProfile, target: WithId<UserProfile>, name: string, reason: string) {
  return updateWithAudit(usersCol, 'user', target.uid, target, { ...target, name }, { actor, reason });
}
