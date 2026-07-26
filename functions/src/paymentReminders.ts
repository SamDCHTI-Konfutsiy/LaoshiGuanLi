import { onSchedule } from 'firebase-functions/v2/scheduler';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from './admin';

const DEFAULT_MONTHLY_FEE = 300000;

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatAmount(n: number): string {
  return n.toLocaleString('de-DE'); // period thousands separator: 300.000
}

/** Mirrors src/features/payments/service.ts's buildPaymentReminderText — kept in sync manually since this is a separate Node codebase. */
function buildReminderText(studentName: string, yearMonth: string, amount: number): string {
  const [y, m] = yearMonth.split('-');
  return `Hurmatli Konfutsiy talabasi ${studentName}, sizni ushbu oy (${m}.${y}) uchun to'lov (${formatAmount(amount)}) qilmaganingiz uchun kelasi darslarga qatnashishga ta'sir qilmasligi uchun to'lovni vaqtida qiling.`;
}

/**
 * Runs at 09:00 on the 1st of every month. A student with no payment
 * record for the current month, or one explicitly marked unpaid, gets
 * a reminder — as long as their account is still active (disabled/
 * pending accounts are skipped).
 */
export const paymentReminders = onSchedule(
  { schedule: '0 9 1 * *', timeZone: 'Asia/Tashkent' },
  async () => {
    const yearMonth = currentYearMonth();

    const [studentsSnap, paymentsSnap, settingsSnap] = await Promise.all([
      db.collection('users').where('role', '==', 'student').where('status', '==', 'active').get(),
      db.collection('payments').where('yearMonth', '==', yearMonth).get(),
      db.doc('settings/payments').get(),
    ]);

    const amount = settingsSnap.exists ? (settingsSnap.data()!.monthlyFeeAmount as number) : DEFAULT_MONTHLY_FEE;

    const paidUids = new Set(
      paymentsSnap.docs.filter((d) => d.data().paid === true).map((d) => d.data().studentId as string),
    );

    const unpaidStudents = studentsSnap.docs.filter((d) => !paidUids.has(d.id));

    await Promise.all(
      unpaidStudents.map((studentDoc) =>
        db.collection(`notifications/${studentDoc.id}/items`).add({
          type: 'payment_reminder',
          title: 'Payment reminder',
          body: buildReminderText(studentDoc.data().name as string, yearMonth, amount),
          link: '',
          read: false,
          createdAt: Timestamp.now(),
        }),
      ),
    );
  },
);
