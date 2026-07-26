import { onSnapshot, type DocumentReference, type FirestoreError } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { WithId } from '@/types/models';

interface UseDocResult<T> {
  data: WithId<T> | null;
  loading: boolean;
  error: FirestoreError | null;
}

/**
 * Subscribes to a single Firestore document in real time. `ref` must be
 * referentially stable (memoize with useMemo if built from props/state);
 * pass `null` to skip subscribing.
 */
export function useDoc<T>(ref: DocumentReference<T> | null): UseDocResult<T> {
  const [data, setData] = useState<WithId<T> | null>(null);
  const [loading, setLoading] = useState(ref !== null);
  const [error, setError] = useState<FirestoreError | null>(null);

  useEffect(() => {
    if (!ref) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        setData(snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [ref]);

  return { data, loading, error };
}
