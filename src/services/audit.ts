import { collection, doc, serverTimestamp, type Timestamp, type WriteBatch } from 'firebase/firestore';
import { db } from '@/firebase/db';
import { converter } from '@/firebase/converters';
import type { AuditLogEntry } from '@/types/models';

const auditCol = collection(db, 'auditLogs').withConverter(converter<AuditLogEntry>());

export interface AuditInput {
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  reason: string;
}

/** Queues an audit log entry in `batch`. Call alongside the actual mutation, in the same batch. */
export function appendAuditLog(batch: WriteBatch, entry: AuditInput): void {
  const ref = doc(auditCol);
  batch.set(ref, {
    ...entry,
    createdAt: serverTimestamp() as unknown as Timestamp,
  });
}
