import { doc, getDoc, query, serverTimestamp, setDoc, Timestamp, where, writeBatch } from 'firebase/firestore';
import { db } from '@/firebase/db';
import { appendAuditLog } from '@/services/audit';
import { collectionRef } from '@/services/repository';
import { notifyUser } from '@/services/notifications';
import type { Payment, PaymentSettings, UserProfile } from '@/types/models';

const paymentsCol = collectionRef<Payment>('payments');
const settingsCol = collectionRef<PaymentSettings>('settings');

const DEFAULT_MONTHLY_FEE = 300000;

export function paymentDocId(studentId: string, yearMonth: string): string {
  return `${studentId}_${yearMonth}`;
}

/** "2026-07" for the current calendar month — payment status is always evaluated against this. */
export function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function formatYearMonth(yearMonth: string, locale: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, 1).toLocaleDateString(locale, { year: 'numeric', month: 'long' });
}

/** "07.2026" — the format used in the reminder text, not a locale-dependent one. */
function formatYearMonthDots(yearMonth: string): string {
  const [y, m] = yearMonth.split('-');
  return `${m}.${y}`;
}

function formatAmount(n: number): string {
  return n.toLocaleString('de-DE'); // period thousands separator: 300.000
}

/** No orderBy — a month's payment list is small; sort client-side by student name. */
export function paymentsForMonthQuery(yearMonth: string) {
  return query(paymentsCol, where('yearMonth', '==', yearMonth));
}

export function studentPaymentsQuery(studentId: string) {
  return query(paymentsCol, where('studentId', '==', studentId));
}

export interface PaymentInput {
  studentId: string;
  yearMonth: string;
  paid: boolean;
  amount: number | null;
  note: string;
}

/** setDoc (full overwrite) covers both "first record for this month" and "correcting an existing one" identically. */
export async function setPayment(actor: UserProfile, input: PaymentInput, reason: string): Promise<void> {
  const id = paymentDocId(input.studentId, input.yearMonth);
  const data: Payment = {
    studentId: input.studentId,
    yearMonth: input.yearMonth,
    paid: input.paid,
    amount: input.amount,
    paidAt: input.paid ? Timestamp.now() : null,
    markedBy: actor.uid,
    note: input.note,
    createdAt: serverTimestamp() as unknown as Timestamp,
  };
  const batch = writeBatch(db);
  batch.set(doc(paymentsCol, id), data);
  appendAuditLog(batch, {
    actorId: actor.uid,
    actorName: actor.name,
    action: 'payment.set',
    targetType: 'payment',
    targetId: id,
    before: null,
    after: data,
    reason,
  });
  await batch.commit();
}

/** Falls back to a sensible default if admin hasn't set one yet. */
export async function getMonthlyFeeAmount(): Promise<number> {
  const snap = await getDoc(doc(settingsCol, 'payments'));
  return snap.exists() ? snap.data().monthlyFeeAmount : DEFAULT_MONTHLY_FEE;
}

export async function setMonthlyFeeAmount(amount: number): Promise<void> {
  await setDoc(doc(settingsCol, 'payments'), { monthlyFeeAmount: amount });
}

/** The exact wording the admin asked for — kept in one place so the manual "send reminder" button and the monthly Cloud Function never drift apart. Mirrored in functions/src/paymentReminders.ts (a separate Node codebase, so it's duplicated there rather than shared). */
export function buildPaymentReminderText(studentName: string, yearMonth: string, amount: number): string {
  return `Hurmatli Konfutsiy talabasi ${studentName}, sizni ushbu oy (${formatYearMonthDots(yearMonth)}) uchun to'lov (${formatAmount(amount)}) qilmaganingiz uchun kelasi darslarga qatnashishga ta'sir qilmasligi uchun to'lovni vaqtida qiling.`;
}

export async function sendPaymentReminder(
  studentUid: string,
  studentName: string,
  yearMonth: string,
  amount: number,
): Promise<void> {
  await notifyUser(studentUid, {
    type: 'payment_reminder',
    title: 'Payment reminder',
    body: buildPaymentReminderText(studentName, yearMonth, amount),
    link: '',
  });
}
