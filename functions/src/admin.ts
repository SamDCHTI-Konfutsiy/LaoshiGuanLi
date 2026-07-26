import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';

initializeApp();

export const db = getFirestore();
export const auth = getAuth();
export const messaging = getMessaging();
