import type { FirestoreDataConverter, QueryDocumentSnapshot } from 'firebase/firestore';

/**
 * Identity converter: EMS documents are already plain JSON-compatible
 * objects, so this only exists to give `collection()`/`doc()` calls a
 * typed return value instead of `DocumentData`.
 */
export function converter<T extends object>(): FirestoreDataConverter<T> {
  return {
    toFirestore: (data: T) => data,
    fromFirestore: (snapshot: QueryDocumentSnapshot) => snapshot.data() as T,
  };
}
