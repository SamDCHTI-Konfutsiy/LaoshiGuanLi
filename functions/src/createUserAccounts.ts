import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { auth, db } from './admin';

interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  role: 'teacher' | 'student';
  groupIds?: string[];
}

interface CreateUsersResult {
  email: string;
  success: boolean;
  uid?: string;
  error?: string;
}

const ALLOWED_ROLES = new Set(['teacher', 'student']);

async function requireActiveAdmin(uid: string | undefined): Promise<void> {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const snap = await db.doc(`users/${uid}`).get();
  const caller = snap.data();
  if (!caller || caller.role !== 'admin' || caller.status !== 'active') {
    throw new HttpsError('permission-denied', 'Only an active admin can create accounts.');
  }
}

async function createOne(input: CreateUserInput): Promise<CreateUsersResult> {
  const email = input.email?.trim().toLowerCase();
  const name = input.name?.trim();

  if (!email || !input.password || !name) {
    return { email: email ?? '(missing)', success: false, error: 'Missing email, password, or name.' };
  }
  if (input.password.length < 6) {
    return { email, success: false, error: 'Password must be at least 6 characters.' };
  }
  if (!ALLOWED_ROLES.has(input.role)) {
    return { email, success: false, error: `Invalid role "${input.role}".` };
  }

  try {
    const userRecord = await auth.createUser({ email, password: input.password, displayName: name });
    await db.doc(`users/${userRecord.uid}`).set({
      uid: userRecord.uid,
      email,
      name,
      role: input.role,
      status: 'active',
      groupIds: input.groupIds ?? [],
      locale: 'uz',
      photoURL: null,
      fcmTokens: [],
      telegramChatId: null,
      telegramLinkCode: null,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { email, success: true, uid: userRecord.uid };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { email, success: false, error: message };
  }
}

/**
 * Admin-only. Accepts one or many users in a single call so the client
 * can drive bulk CSV import without needing N separate round-trips.
 * Each row succeeds or fails independently — one bad row never blocks
 * the rest of the batch.
 */
export const createUserAccounts = onCall<{ users: CreateUserInput[] }>(async (request) => {
  await requireActiveAdmin(request.auth?.uid);

  const users = request.data?.users;
  if (!Array.isArray(users) || users.length === 0) {
    throw new HttpsError('invalid-argument', 'Provide a non-empty "users" array.');
  }
  if (users.length > 200) {
    throw new HttpsError('invalid-argument', 'Batches are capped at 200 users at a time.');
  }

  const results: CreateUsersResult[] = [];
  for (const input of users) {
    results.push(await createOne(input));
  }
  return { results };
});
