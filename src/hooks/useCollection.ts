import { onSnapshot, type FirestoreError, type Query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { WithId } from '@/types/models';

interface UseCollectionResult<T> {
  data: WithId<T>[];
  loading: boolean;
  error: FirestoreError | null;
}

/**
 * Subscribes to a Firestore query and keeps `data` in sync in real time.
 *
 * IMPORTANT: `query` must be referentially stable across renders (wrap the
 * `query(...)` call in `useMemo`, keyed on its actual filter values) —
 * Firestore Query objects are new instances every call, and this hook
 * re-subscribes whenever the reference changes.
 *
 * Pass `null` to skip subscribing (e.g. while a required id is still
 * loading).
 */
export function useCollection<T>(query: Query<T> | null): UseCollectionResult<T> {
  const [data, setData] = useState<WithId<T>[]>([]);
  const [loading, setLoading] = useState(query !== null);
  const [error, setError] = useState<FirestoreError | null>(null);

  useEffect(() => {
    if (!query) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onSnapshot(
      query,
      (snapshot) => {
        setData(snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [query]);

  return { data, loading, error };
}
