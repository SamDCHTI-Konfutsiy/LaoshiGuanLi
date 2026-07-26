import { limit, orderBy, query } from 'firebase/firestore';
import { collectionRef } from '@/services/repository';
import type { AuditLogEntry } from '@/types/models';

const auditCol = collectionRef<AuditLogEntry>('auditLogs');

export function auditLogQuery() {
  return query(auditCol, orderBy('createdAt', 'desc'), limit(100));
}
