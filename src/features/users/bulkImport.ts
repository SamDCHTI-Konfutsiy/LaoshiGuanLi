import { httpsCallable } from 'firebase/functions';
import { functions } from '@/firebase/functions';
import { parseCsv } from '@/utils/csv';

export interface BulkCreateUserRow {
  email: string;
  password: string;
  name: string;
  role: 'teacher' | 'student';
}

export interface BulkCreateResultRow {
  email: string;
  success: boolean;
  uid?: string;
  error?: string;
}

export async function bulkCreateUsers(users: BulkCreateUserRow[]): Promise<BulkCreateResultRow[]> {
  const callable = httpsCallable<{ users: BulkCreateUserRow[] }, { results: BulkCreateResultRow[] }>(
    functions,
    'createUserAccounts',
  );
  const response = await callable({ users });
  return response.data.results;
}

export interface CsvImportResult {
  valid: BulkCreateUserRow[];
  errors: string[];
}

/** Expected columns: name, email, password, role (teacher|student). Group assignment happens afterward via the Groups page. */
export function parseUsersCsv(text: string): CsvImportResult {
  const rows = parseCsv(text);
  if (rows.length === 0) return { valid: [], errors: ['Empty file.'] };

  const [header, ...dataRows] = rows;
  const col = (name: string) => header!.indexOf(name);
  const idx = { name: col('name'), email: col('email'), password: col('password'), role: col('role') };

  if (idx.name === -1 || idx.email === -1 || idx.password === -1 || idx.role === -1) {
    return { valid: [], errors: ['Header row must include "name", "email", "password", and "role" columns.'] };
  }

  const valid: BulkCreateUserRow[] = [];
  const errors: string[] = [];

  dataRows.forEach((row, i) => {
    const rowNum = i + 2;
    const name = row[idx.name]?.trim() ?? '';
    const email = row[idx.email]?.trim().toLowerCase() ?? '';
    const password = row[idx.password]?.trim() ?? '';
    const role = row[idx.role]?.trim().toLowerCase();

    if (!name || !email || !password) {
      errors.push(`Row ${rowNum}: missing name, email, or password.`);
      return;
    }
    if (password.length < 6) {
      errors.push(`Row ${rowNum}: password must be at least 6 characters.`);
      return;
    }
    if (role !== 'teacher' && role !== 'student') {
      errors.push(`Row ${rowNum}: role must be "teacher" or "student", got "${role}".`);
      return;
    }
    valid.push({ name, email, password, role });
  });

  return { valid, errors };
}
