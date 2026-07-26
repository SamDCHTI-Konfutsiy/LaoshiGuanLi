import { collection, doc, writeBatch, type CollectionReference } from 'firebase/firestore';
import { db } from '@/firebase/db';
import { converter } from '@/firebase/converters';
import { appendAuditLog } from '@/services/audit';
import { withoutId, type UserProfile } from '@/types/models';

export function collectionRef<T extends object>(path: string): CollectionReference<T> {
  return collection(db, path).withConverter(converter<T>());
}

interface MutationContext {
  actor: UserProfile;
  reason: string;
}

/** Creates a document, batched with a paired audit log entry. Returns the new doc id. */
export async function createWithAudit<T extends object>(
  col: CollectionReference<T>,
  targetType: string,
  data: T,
  ctx: MutationContext,
): Promise<string> {
  const clean = withoutId(data);
  const batch = writeBatch(db);
  const ref = doc(col);
  batch.set(ref, clean);
  appendAuditLog(batch, {
    actorId: ctx.actor.uid,
    actorName: ctx.actor.name,
    action: `${targetType}.create`,
    targetType,
    targetId: ref.id,
    before: null,
    after: clean,
    reason: ctx.reason,
  });
  await batch.commit();
  return ref.id;
}

/** Updates a document, batched with a paired audit log entry recording before/after. */
export async function updateWithAudit<T extends object>(
  col: CollectionReference<T>,
  targetType: string,
  id: string,
  before: T,
  after: T,
  ctx: MutationContext,
): Promise<void> {
  const clean = withoutId(after);
  const batch = writeBatch(db);
  batch.update(doc(col, id), clean);
  appendAuditLog(batch, {
    actorId: ctx.actor.uid,
    actorName: ctx.actor.name,
    action: `${targetType}.update`,
    targetType,
    targetId: id,
    before,
    after,
    reason: ctx.reason,
  });
  await batch.commit();
}

/** Deletes a document, batched with a paired audit log entry recording the prior state. */
export async function deleteWithAudit<T extends object>(
  col: CollectionReference<T>,
  targetType: string,
  id: string,
  before: T,
  ctx: MutationContext,
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(col, id));
  appendAuditLog(batch, {
    actorId: ctx.actor.uid,
    actorName: ctx.actor.name,
    action: `${targetType}.delete`,
    targetType,
    targetId: id,
    before,
    after: null,
    reason: ctx.reason,
  });
  await batch.commit();
}
