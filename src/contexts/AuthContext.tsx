import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { auth } from '@/firebase/auth';
import { db } from '@/firebase/db';
import { converter } from '@/firebase/converters';
import { useToast } from '@/contexts/ToastContext';
import {
  resetPassword as resetPasswordService,
  signIn as signInService,
  signOutUser as signOutService,
  signUp as signUpService,
  signUpAsFirstAdmin as signUpAsFirstAdminService,
} from '@/features/auth/service';
import type { UserProfile } from '@/types/models';

type AuthStatus = 'initializing' | 'signed-out' | 'incomplete' | 'pending' | 'disabled' | 'signed-in';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  status: AuthStatus;
  signIn: typeof signInService;
  signUp: typeof signUpService;
  signUpAsFirstAdmin: typeof signUpAsFirstAdminService;
  signOutUser: typeof signOutService;
  resetPassword: typeof resetPasswordService;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState<AuthStatus>('initializing');
  const unsubProfileRef = useRef<(() => void) | null>(null);
  const toast = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      unsubProfileRef.current?.();
      unsubProfileRef.current = null;
      setUser(fbUser);

      if (!fbUser) {
        setProfile(null);
        setStatus('signed-out');
        return;
      }

      const ref = doc(db, 'users', fbUser.uid).withConverter(converter<UserProfile>());
      unsubProfileRef.current = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) {
            setProfile(null);
            setStatus('incomplete');
            return;
          }
          const data = snap.data();
          if (data.status === 'disabled') {
            setProfile(null);
            setStatus('disabled');
            toast.show(t('auth.errors.userDisabled'), 'error');
            void signOutService();
            return;
          }
          if (data.status === 'pending') {
            // Stay signed in and keep the profile — the pending screen
            // shows it, and this listener will flip us to 'signed-in'
            // live, the moment an admin approves, with no reload needed.
            setProfile(data);
            setStatus('pending');
            return;
          }
          setProfile(data);
          setStatus('signed-in');
        },
        () => {
          setProfile(null);
          setStatus('incomplete');
        },
      );
    });

    return () => {
      unsubAuth();
      unsubProfileRef.current?.();
    };
    // Intentionally mount-only: this wires the long-lived Auth listener once.
    // `toast`/`t` are stable enough in practice that resubscribing on their
    // change would only add churn, not correctness.
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      status,
      signIn: signInService,
      signUp: signUpService,
      signUpAsFirstAdmin: signUpAsFirstAdminService,
      signOutUser: signOutService,
      resetPassword: resetPasswordService,
    }),
    [user, profile, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
