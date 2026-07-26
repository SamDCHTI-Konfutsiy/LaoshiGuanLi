import { collection, doc, getDocs, serverTimestamp, writeBatch, type Timestamp } from 'firebase/firestore';
import { db } from '@/firebase/db';
import type { NotificationType } from '@/types/enums';
import type { AppNotification } from '@/types/models';

/** Unique student UIDs across every group in groupIds. */
export async function resolveGroupMemberUids(groupIds: string[]): Promise<string[]> {
  const uids = new Set<string>();
  for (const groupId of groupIds) {
    const snap = await getDocs(collection(db, `groups/${groupId}/members`));
    snap.forEach((d) => uids.add(d.id));
  }
  return [...uids];
}

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  link: string;
}

/** Best-effort fan-out — chunked to stay under Firestore's 500-write batch cap. */
export async function notifyUsers(userIds: string[], input: NotifyInput): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 400) chunks.push(unique.slice(i, i + 400));

  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const uid of chunk) {
      const ref = doc(collection(db, `notifications/${uid}/items`));
      const data: AppNotification = {
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
        read: false,
        createdAt: serverTimestamp() as unknown as Timestamp,
      };
      batch.set(ref, data);
    }
    await batch.commit();
  }
}

export function notifyUser(userId: string, input: NotifyInput): Promise<void> {
  return notifyUsers([userId], input);
}
