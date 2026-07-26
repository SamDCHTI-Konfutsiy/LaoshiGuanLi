import { deleteField, doc, updateDoc } from 'firebase/firestore';
import { collectionRef } from '@/services/repository';
import type { UserProfile } from '@/types/models';

const usersCol = collectionRef<UserProfile>('users');

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function generateTelegramLinkCode(uid: string): Promise<string> {
  const code = randomCode();
  await updateDoc(doc(usersCol, uid), { telegramLinkCode: code });
  return code;
}

export async function unlinkTelegram(uid: string): Promise<void> {
  await updateDoc(doc(usersCol, uid), { telegramChatId: deleteField(), telegramLinkCode: null });
}
