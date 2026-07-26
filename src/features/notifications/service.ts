import { collection, doc, orderBy, query, updateDoc } from 'firebase/firestore';
import { converter } from '@/firebase/converters';
import { db } from '@/firebase/db';
import type { AppNotification } from '@/types/models';

function itemsCol(uid: string) {
  return collection(db, `notifications/${uid}/items`).withConverter(converter<AppNotification>());
}

export function notificationsQuery(uid: string) {
  return query(itemsCol(uid), orderBy('createdAt', 'desc'));
}

export function markAsRead(uid: string, id: string): Promise<void> {
  return updateDoc(doc(itemsCol(uid), id), { read: true });
}
