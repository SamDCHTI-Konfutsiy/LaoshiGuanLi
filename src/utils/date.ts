import type { Timestamp } from 'firebase/firestore';

/**
 * `Timestamp | null` because any field written with serverTimestamp()
 * reads back as null in the client's own optimistic snapshot, for the
 * brief window before the server round-trip resolves it (Firestore's
 * documented "pending server timestamp" behavior). Every caller of these
 * two functions renders data that can include such a field.
 */
export function formatDate(ts: Timestamp | null, locale: string): string {
  if (!ts) return '—';
  return ts.toDate().toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(ts: Timestamp | null, locale: string): string {
  if (!ts) return '—';
  return ts.toDate().toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** For <input type="date"> value props. */
export function toDateInputValue(ts: Timestamp): string {
  return ts.toDate().toISOString().slice(0, 10);
}

/** For <input type="datetime-local"> value props — local time, not UTC, so the picker shows what the user actually meant. */
export function toDateTimeInputValue(ts: Timestamp): string {
  const d = ts.toDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Safe sort key for a possibly-still-pending serverTimestamp() field — treats a pending (null) value as "now", which is correct: it was just written. */
export function timestampSortKey(ts: Timestamp | null): number {
  return ts ? ts.toMillis() : Date.now();
}
