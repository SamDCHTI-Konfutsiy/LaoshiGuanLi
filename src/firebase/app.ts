import { initializeApp } from 'firebase/app';

/**
 * This config is safe to commit. It identifies the Firebase project to the
 * client SDK — it does not grant access to anything. All real access
 * control is enforced server-side by Firestore/Storage Security Rules
 * (see firestore.rules, storage.rules).
 */
const firebaseConfig = {
  apiKey: 'AIzaSyA9cHgELho8oF64lB2Z8JJDONcP-W41qPI',
  authDomain: 'laoshiguanli.firebaseapp.com',
  projectId: 'laoshiguanli',
  storageBucket: 'laoshiguanli.firebasestorage.app',
  messagingSenderId: '224426715662',
  appId: '1:224426715662:web:1d3a79f060c16483782a5f',
};

export const firebaseApp = initializeApp(firebaseConfig);
