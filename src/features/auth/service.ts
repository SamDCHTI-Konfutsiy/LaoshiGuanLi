import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile as updateAuthProfile,
  type AuthError,
} from 'firebase/auth';
import { collection, doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { auth } from '@/firebase/auth';
import { db } from '@/firebase/db';
import { converter } from '@/firebase/converters';
import type { Role } from '@/types/enums';
import type { UserProfile } from '@/types/models';

const usersCol = collection(db, 'users').withConverter(converter<UserProfile>());
const bootstrapRef = doc(db, 'meta', 'adminBootstrap');

export async function isAdminBootstrapAvailable(): Promise<boolean> {
  const snap = await getDoc(bootstrapRef);
  if (!snap.exists()) return false; // must be seeded manually — see README
  return snap.data().claimed !== true;
}

interface SignUpCommon {
  name: string;
  email: string;
  password: string;
}

/** Creates the very first account, active immediately. Blocked server-side the moment one exists — see firestore.rules. */
export async function signUpAsFirstAdmin({ name, email, password }: SignUpCommon): Promise<void> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateAuthProfile(credential.user, { displayName: name });

  const batch = writeBatch(db);
  batch.set(doc(usersCol, credential.user.uid), {
    uid: credential.user.uid,
    role: 'admin',
    status: 'active',
    name,
    email,
    locale: 'en',
    createdAt: serverTimestamp() as unknown as Timestamp,
    groupIds: [],
    fcmTokens: [],
  });
  batch.update(bootstrapRef, { claimed: true });
  await batch.commit();
}

/**
 * Open self-signup. The account is created with status 'pending' and stays
 * that way — unable to sign in to any role area — until an admin approves
 * it (see firestore.rules: users/{uid} update, pending -> active|disabled).
 * `requestedRole` is never trusted as-is; the admin confirms or changes it
 * at approval time.
 */
export async function signUp({
  name,
  email,
  password,
  requestedRole,
}: SignUpCommon & { requestedRole: Extract<Role, 'teacher' | 'student'> }): Promise<void> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateAuthProfile(credential.user, { displayName: name });

  await setDoc(doc(usersCol, credential.user.uid), {
    uid: credential.user.uid,
    role: requestedRole,
    status: 'pending',
    name,
    email,
    locale: 'en',
    createdAt: serverTimestamp() as unknown as Timestamp,
    groupIds: [],
    fcmTokens: [],
  });
}

export async function updateOwnProfile(
  uid: string,
  updates: Partial<Pick<UserProfile, 'name' | 'locale' | 'photoURL'>>,
): Promise<void> {
  await updateDoc(doc(usersCol, uid), updates);
}

export async function signIn(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

type AuthErrorSuffix =
  | 'errors.generic'
  | 'errors.emailInUse'
  | 'errors.invalidEmail'
  | 'errors.weakPassword'
  | 'errors.invalidCredential'
  | 'errors.userDisabled'
  | 'errors.tooManyRequests'
  | 'errors.network';

const AUTH_ERROR_KEYS: Record<string, AuthErrorSuffix> = {
  'auth/email-already-in-use': 'errors.emailInUse',
  'auth/invalid-email': 'errors.invalidEmail',
  'auth/weak-password': 'errors.weakPassword',
  'auth/invalid-credential': 'errors.invalidCredential',
  'auth/user-disabled': 'errors.userDisabled',
  'auth/too-many-requests': 'errors.tooManyRequests',
  'auth/network-request-failed': 'errors.network',
};

/** Maps a thrown error from this module to an auth.* i18n key. */
export function authErrorKey(error: unknown): AuthErrorSuffix {
  const code = (error as AuthError)?.code;
  if (code && AUTH_ERROR_KEYS[code]) return AUTH_ERROR_KEYS[code];
  return 'errors.generic';
}
