import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { firebaseApp } from '@/firebase/app';

export const auth = getAuth(firebaseApp);

// Explicit rather than relying on the SDK default, so a session survives
// closing the tab/browser (required for the PWA "install and stay signed
// in" experience).
void setPersistence(auth, browserLocalPersistence);
