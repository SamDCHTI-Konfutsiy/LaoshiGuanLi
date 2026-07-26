import { Timestamp } from 'firebase-admin/firestore';
import { auth, db } from './admin';
import { downloadTelegramFile, editMessage, sendDocument, sendMessage, type InlineKeyboard } from './telegramApi';

interface BotSession {
  mode: string;
  data: Record<string, string>;
}

const IDLE: BotSession = { mode: 'idle', data: {} };

async function getSession(chatId: number): Promise<BotSession> {
  const snap = await db.doc(`botSessions/${chatId}`).get();
  return snap.exists ? (snap.data() as BotSession) : IDLE;
}

async function setSession(chatId: number, session: BotSession): Promise<void> {
  await db.doc(`botSessions/${chatId}`).set(session);
}

export interface AdminIdentity {
  uid: string;
  name: string;
}

/** Only a linked, active admin account can use any of this — checked before every action below. */
export async function findAdminByChatId(chatId: number): Promise<AdminIdentity | null> {
  const snap = await db
    .collection('users')
    .where('telegramChatId', '==', String(chatId))
    .where('role', '==', 'admin')
    .where('status', '==', 'active')
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0]!;
  return { uid: doc.id, name: doc.data().name as string };
}

function mainMenu(): InlineKeyboard {
  return [
    [{ text: '📋 Pending approvals', callback_data: 'm:pending' }],
    [{ text: '💰 Unpaid students', callback_data: 'm:unpaid' }],
    [{ text: '🚫 Block / Unblock user', callback_data: 'm:block' }],
    [{ text: '➕ New user', callback_data: 'm:newuser' }],
    [{ text: '📤 Export users CSV', callback_data: 'm:export' }],
    [{ text: '📥 Import users CSV', callback_data: 'm:import' }],
  ];
}

const BACK_BUTTON: InlineKeyboard = [[{ text: '⬅️ Main menu', callback_data: 'm:main' }]];

export async function showMainMenu(chatId: number, messageId?: number): Promise<void> {
  await setSession(chatId, IDLE);
  const text = '🛠 Admin panel';
  if (messageId) await editMessage(chatId, messageId, text, mainMenu());
  else await sendMessage(chatId, text, mainMenu());
}

// ---------------------------------------------------------------------
// Pending approvals
// ---------------------------------------------------------------------
async function showPending(chatId: number, messageId: number): Promise<void> {
  const snap = await db.collection('users').where('status', '==', 'pending').get();
  if (snap.empty) {
    await editMessage(chatId, messageId, 'No pending approvals.', BACK_BUTTON);
    return;
  }
  const lines = ['📋 Pending approvals:'];
  const keyboard: InlineKeyboard = [];
  snap.docs.forEach((d) => {
    const u = d.data();
    lines.push(`\n${u.name} (${u.email}) — requested: ${u.role}`);
    keyboard.push([
      { text: `✅ ${u.name} as Student`, callback_data: `appr:${d.id}:student` },
      { text: `✅ as Teacher`, callback_data: `appr:${d.id}:teacher` },
    ]);
    keyboard.push([{ text: `❌ Reject ${u.name}`, callback_data: `rej:${d.id}` }]);
  });
  keyboard.push([{ text: '⬅️ Main menu', callback_data: 'm:main' }]);
  await editMessage(chatId, messageId, lines.join('\n'), keyboard);
}

async function logAudit(admin: AdminIdentity, action: string, targetType: string, targetId: string): Promise<void> {
  await db.collection('auditLogs').add({
    actorId: admin.uid,
    actorName: admin.name,
    action,
    targetType,
    targetId,
    before: null,
    after: null,
    reason: 'Via Telegram bot',
    createdAt: Timestamp.now(),
  });
}

async function approveUser(chatId: number, messageId: number, admin: AdminIdentity, uid: string, role: 'student' | 'teacher'): Promise<void> {
  await db.doc(`users/${uid}`).update({ status: 'active', role });
  await logAudit(admin, 'user.approve', 'user', uid);
  await showPending(chatId, messageId);
}

async function rejectUser(chatId: number, messageId: number, admin: AdminIdentity, uid: string): Promise<void> {
  await db.doc(`users/${uid}`).update({ status: 'disabled' });
  await logAudit(admin, 'user.reject', 'user', uid);
  await showPending(chatId, messageId);
}

// ---------------------------------------------------------------------
// Unpaid students + reminders (mirrors src/features/payments/service.ts —
// duplicated here since this is a separate Node codebase)
// ---------------------------------------------------------------------
function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatAmount(n: number): string {
  return n.toLocaleString('de-DE');
}

function buildReminderText(name: string, yearMonth: string, amount: number): string {
  const [y, m] = yearMonth.split('-');
  return `Hurmatli Konfutsiy talabasi ${name}, sizni ushbu oy (${m}.${y}) uchun to'lov (${formatAmount(amount)}) qilmaganingiz uchun kelasi darslarga qatnashishga ta'sir qilmasligi uchun to'lovni vaqtida qiling.`;
}

async function getUnpaidStudents(): Promise<{ id: string; name: string }[]> {
  const yearMonth = currentYearMonth();
  const [studentsSnap, paymentsSnap] = await Promise.all([
    db.collection('users').where('role', '==', 'student').where('status', '==', 'active').get(),
    db.collection('payments').where('yearMonth', '==', yearMonth).get(),
  ]);
  const paidUids = new Set(paymentsSnap.docs.filter((d) => d.data().paid === true).map((d) => d.data().studentId as string));
  return studentsSnap.docs.filter((d) => !paidUids.has(d.id)).map((d) => ({ id: d.id, name: d.data().name as string }));
}

async function getMonthlyFeeAmount(): Promise<number> {
  const snap = await db.doc('settings/payments').get();
  return snap.exists ? (snap.data()!.monthlyFeeAmount as number) : 300000;
}

async function sendReminder(uid: string, name: string): Promise<void> {
  const yearMonth = currentYearMonth();
  const amount = await getMonthlyFeeAmount();
  await db.collection(`notifications/${uid}/items`).add({
    type: 'payment_reminder',
    title: 'Payment reminder',
    body: buildReminderText(name, yearMonth, amount),
    link: '',
    read: false,
    createdAt: Timestamp.now(),
  });
}

async function showUnpaid(chatId: number, messageId: number): Promise<void> {
  const unpaid = await getUnpaidStudents();
  if (unpaid.length === 0) {
    await editMessage(chatId, messageId, '✅ Everyone has paid this month.', BACK_BUTTON);
    return;
  }
  const lines = [`💰 Unpaid this month (${unpaid.length}):`, ...unpaid.map((s) => `• ${s.name}`)];
  const keyboard: InlineKeyboard = unpaid.map((s) => [{ text: `Send reminder: ${s.name}`, callback_data: `remind:${s.id}` }]);
  keyboard.push([{ text: '📢 Send to all unpaid', callback_data: 'remindall' }]);
  keyboard.push([{ text: '⬅️ Main menu', callback_data: 'm:main' }]);
  await editMessage(chatId, messageId, lines.join('\n'), keyboard);
}

// ---------------------------------------------------------------------
// Block / unblock
// ---------------------------------------------------------------------
async function findUserByEmail(email: string): Promise<{ id: string; name: string; status: string } | null> {
  const snap = await db.collection('users').where('email', '==', email.trim().toLowerCase()).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0]!;
  return { id: doc.id, name: doc.data().name as string, status: doc.data().status as string };
}

async function showBlockResult(chatId: number, email: string): Promise<void> {
  const user = await findUserByEmail(email);
  if (!user) {
    await sendMessage(chatId, `No user found with email "${email}". Try again or go back.`, BACK_BUTTON);
    return;
  }
  const keyboard: InlineKeyboard = [
    user.status === 'disabled'
      ? [{ text: `✅ Unblock ${user.name}`, callback_data: `unblk:${user.id}` }]
      : [{ text: `🚫 Block ${user.name}`, callback_data: `blk:${user.id}` }],
    [{ text: '⬅️ Main menu', callback_data: 'm:main' }],
  ];
  await sendMessage(chatId, `${user.name} (${email}) — currently ${user.status}.`, keyboard);
}

async function setBlockStatus(chatId: number, messageId: number, admin: AdminIdentity, uid: string, status: 'active' | 'disabled'): Promise<void> {
  await db.doc(`users/${uid}`).update({ status });
  await logAudit(admin, status === 'disabled' ? 'user.block' : 'user.unblock', 'user', uid);
  await editMessage(chatId, messageId, `Done. Status updated to "${status}".`, BACK_BUTTON);
}

// ---------------------------------------------------------------------
// New user (multi-step conversation)
// ---------------------------------------------------------------------
function randomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function startNewUserFlow(chatId: number, messageId: number): Promise<void> {
  await setSession(chatId, { mode: 'new_user_role', data: {} });
  await editMessage(chatId, messageId, 'New user — pick a role:', [
    [
      { text: 'Student', callback_data: 'role:student' },
      { text: 'Teacher', callback_data: 'role:teacher' },
    ],
    [{ text: '⬅️ Main menu', callback_data: 'm:main' }],
  ]);
}

async function continueNewUserRole(chatId: number, messageId: number, role: string): Promise<void> {
  await setSession(chatId, { mode: 'new_user_name', data: { role } });
  await editMessage(chatId, messageId, `Role: ${role}.\n\nNow send the student/teacher's full name as a message.`);
}

async function handleNewUserText(chatId: number, session: BotSession, text: string): Promise<void> {
  if (session.mode === 'new_user_name') {
    await setSession(chatId, { mode: 'new_user_email', data: { ...session.data, name: text.trim() } });
    await sendMessage(chatId, 'Now send their email address.');
    return;
  }
  if (session.mode === 'new_user_email') {
    const email = text.trim().toLowerCase();
    if (!email.includes('@')) {
      await sendMessage(chatId, "That doesn't look like a valid email. Try again.");
      return;
    }
    const password = randomPassword();
    await setSession(chatId, { mode: 'new_user_confirm', data: { ...session.data, email, password } });
    const { name, role } = session.data;
    await sendMessage(
      chatId,
      `Confirm:\nName: ${name}\nRole: ${role}\nEmail: ${email}\nPassword (auto-generated): ${password}\n\nShare this password with them — it won't be shown again.`,
      [
        [{ text: '✅ Create account', callback_data: 'newuser:confirm' }],
        [{ text: '⬅️ Cancel', callback_data: 'm:main' }],
      ],
    );
    return;
  }
}

async function createUserFromSession(chatId: number, admin: AdminIdentity, session: BotSession): Promise<void> {
  const { name, role, email, password } = session.data;
  if (!name || !role || !email || !password) {
    await sendMessage(chatId, 'Something went wrong — please start over with "New user".', BACK_BUTTON);
    return;
  }
  try {
    const record = await auth.createUser({ email, password, displayName: name });
    await db.doc(`users/${record.uid}`).set({
      uid: record.uid,
      email,
      name,
      role,
      status: 'active',
      groupIds: [],
      locale: 'uz',
      photoURL: null,
      fcmTokens: [],
      telegramChatId: null,
      telegramLinkCode: null,
      createdAt: Timestamp.now(),
    });
    await logAudit(admin, 'user.create', 'user', record.uid);
    await sendMessage(chatId, `✅ Account created for ${name} (${email}).`, BACK_BUTTON);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await sendMessage(chatId, `❌ Failed to create account: ${message}`, BACK_BUTTON);
  }
  await setSession(chatId, IDLE);
}

// ---------------------------------------------------------------------
// CSV export / import (users)
// ---------------------------------------------------------------------
function csvEscape(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

async function exportUsersCsv(chatId: number): Promise<void> {
  const snap = await db.collection('users').get();
  const rows = ['name,email,role,status'];
  snap.docs.forEach((d) => {
    const u = d.data();
    rows.push([u.name, u.email, u.role, u.status].map((v) => csvEscape(String(v ?? ''))).join(','));
  });
  await sendDocument(chatId, 'users.csv', rows.join('\r\n'));
}

async function promptImport(chatId: number, messageId: number): Promise<void> {
  await setSession(chatId, { mode: 'import_csv', data: {} });
  await editMessage(
    chatId,
    messageId,
    'Send a CSV file now with columns: name,email,password,role (role must be "student" or "teacher").',
    BACK_BUTTON,
  );
}

function parseCsvLine(line: string): string[] {
  // Simple splitter — sufficient for the plain, unquoted export/import format used here.
  return line.split(',').map((s) => s.trim());
}

export async function handleCsvImport(chatId: number, admin: AdminIdentity, fileId: string): Promise<void> {
  const content = await downloadTelegramFile(fileId);
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    await sendMessage(chatId, 'That file looks empty.', BACK_BUTTON);
    return;
  }
  const header = parseCsvLine(lines[0]!);
  const idx = { name: header.indexOf('name'), email: header.indexOf('email'), password: header.indexOf('password'), role: header.indexOf('role') };
  if (idx.name === -1 || idx.email === -1 || idx.password === -1 || idx.role === -1) {
    await sendMessage(chatId, 'Header row must include name,email,password,role.', BACK_BUTTON);
    return;
  }

  let created = 0;
  const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]!);
    const name = row[idx.name]?.trim();
    const email = row[idx.email]?.trim().toLowerCase();
    const password = row[idx.password]?.trim();
    const role = row[idx.role]?.trim().toLowerCase();
    if (!name || !email || !password || (role !== 'student' && role !== 'teacher')) {
      errors.push(`Row ${i + 1}: missing/invalid data.`);
      continue;
    }
    try {
      const record = await auth.createUser({ email, password, displayName: name });
      await db.doc(`users/${record.uid}`).set({
        uid: record.uid,
        email,
        name,
        role,
        status: 'active',
        groupIds: [],
        locale: 'uz',
        photoURL: null,
        fcmTokens: [],
        telegramChatId: null,
        telegramLinkCode: null,
        createdAt: Timestamp.now(),
      });
      await logAudit(admin, 'user.import', 'user', record.uid);
      created += 1;
    } catch (err) {
      errors.push(`Row ${i + 1} (${email}): ${err instanceof Error ? err.message : 'error'}`);
    }
  }

  await setSession(chatId, IDLE);
  const summary = [`✅ Created ${created} account(s).`];
  if (errors.length > 0) summary.push(`\n⚠️ ${errors.length} row(s) skipped:`, ...errors.slice(0, 10));
  await sendMessage(chatId, summary.join('\n'), BACK_BUTTON);
}

// ---------------------------------------------------------------------
// Entry points called from the webhook
// ---------------------------------------------------------------------
export async function handleAdminCallback(chatId: number, messageId: number, admin: AdminIdentity, callbackData: string): Promise<void> {
  const [action, ...rest] = callbackData.split(':');

  if (action === 'm') {
    if (rest[0] === 'main') return showMainMenu(chatId, messageId);
    if (rest[0] === 'pending') return showPending(chatId, messageId);
    if (rest[0] === 'unpaid') return showUnpaid(chatId, messageId);
    if (rest[0] === 'block') {
      await setSession(chatId, { mode: 'block_search', data: {} });
      await editMessage(chatId, messageId, 'Send the email address of the user you want to block/unblock.', BACK_BUTTON);
      return;
    }
    if (rest[0] === 'newuser') return startNewUserFlow(chatId, messageId);
    if (rest[0] === 'export') return exportUsersCsv(chatId);
    if (rest[0] === 'import') return promptImport(chatId, messageId);
    return;
  }
  if (action === 'appr') return approveUser(chatId, messageId, admin, rest[0]!, rest[1] as 'student' | 'teacher');
  if (action === 'rej') return rejectUser(chatId, messageId, admin, rest[0]!);
  if (action === 'remind') {
    const unpaid = await getUnpaidStudents();
    const student = unpaid.find((s) => s.id === rest[0]);
    if (student) await sendReminder(student.id, student.name);
    await showUnpaid(chatId, messageId);
    return;
  }
  if (action === 'remindall') {
    const unpaid = await getUnpaidStudents();
    await Promise.all(unpaid.map((s) => sendReminder(s.id, s.name)));
    await editMessage(chatId, messageId, `📢 Reminder sent to ${unpaid.length} student(s).`, BACK_BUTTON);
    return;
  }
  if (action === 'blk') return setBlockStatus(chatId, messageId, admin, rest[0]!, 'disabled');
  if (action === 'unblk') return setBlockStatus(chatId, messageId, admin, rest[0]!, 'active');
  if (action === 'role') return continueNewUserRole(chatId, messageId, rest[0]!);
  if (action === 'newuser' && rest[0] === 'confirm') {
    const session = await getSession(chatId);
    return createUserFromSession(chatId, admin, session);
  }
}

export async function handleAdminText(chatId: number, text: string): Promise<boolean> {
  const session = await getSession(chatId);
  if (session.mode === 'block_search') {
    await setSession(chatId, IDLE);
    await showBlockResult(chatId, text);
    return true;
  }
  if (session.mode.startsWith('new_user_')) {
    await handleNewUserText(chatId, session, text);
    return true;
  }
  return false;
}
