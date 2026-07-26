import { buildCsv, parseCsv } from '@/utils/csv';
import type { Payment } from '@/types/models';
import type { PaymentInput } from '@/features/payments/service';

const HEADERS = ['email', 'name', 'paid', 'amount', 'note'];

export function paymentsToCsv(
  students: { uid: string; name: string; email: string }[],
  paymentByStudent: Map<string, Payment>,
): string {
  const rows = students.map((s) => {
    const p = paymentByStudent.get(s.uid);
    return [s.email, s.name, p?.paid ? 'yes' : 'no', p?.amount != null ? String(p.amount) : '', p?.note ?? ''];
  });
  return buildCsv(HEADERS, rows);
}

export interface CsvImportResult {
  valid: (PaymentInput & { email: string })[];
  errors: string[];
}

/** Matches rows to students by email (studentId isn't known from a spreadsheet). */
export function parsePaymentsCsv(text: string, yearMonth: string, studentUidByEmail: Map<string, string>): CsvImportResult {
  const rows = parseCsv(text);
  if (rows.length === 0) return { valid: [], errors: ['Empty file.'] };

  const [header, ...dataRows] = rows;
  const col = (name: string) => header!.indexOf(name);
  const idx = { email: col('email'), paid: col('paid'), amount: col('amount'), note: col('note') };

  if (idx.email === -1 || idx.paid === -1) {
    return { valid: [], errors: ['Header row must include at least "email" and "paid" columns.'] };
  }

  const valid: (PaymentInput & { email: string })[] = [];
  const errors: string[] = [];

  dataRows.forEach((row, i) => {
    const rowNum = i + 2;
    const email = row[idx.email]?.trim().toLowerCase() ?? '';
    const paidRaw = row[idx.paid]?.trim().toLowerCase() ?? '';
    const amountRaw = idx.amount >= 0 ? row[idx.amount]?.trim() : '';
    const note = idx.note >= 0 ? (row[idx.note]?.trim() ?? '') : '';

    const studentId = studentUidByEmail.get(email);
    if (!studentId) {
      errors.push(`Row ${rowNum}: no student found with email "${email}".`);
      return;
    }
    if (!['yes', 'no', 'true', 'false', '1', '0'].includes(paidRaw)) {
      errors.push(`Row ${rowNum}: "paid" must be yes/no, got "${paidRaw}".`);
      return;
    }
    const paid = paidRaw === 'yes' || paidRaw === 'true' || paidRaw === '1';
    const amount = amountRaw ? Number(amountRaw) : null;
    if (amount !== null && !Number.isFinite(amount)) {
      errors.push(`Row ${rowNum}: "amount" must be a number.`);
      return;
    }

    valid.push({ studentId, email, yearMonth, paid, amount, note });
  });

  return { valid, errors };
}
