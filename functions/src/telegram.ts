import { onRequest } from 'firebase-functions/v2/https';
import { db } from './admin';
import { telegramBotToken } from './secrets';
import { answerCallbackQuery, sendMessage } from './telegramApi';
import { findAdminByChatId, handleAdminCallback, handleAdminText, handleCsvImport, showMainMenu } from './botAdmin';

export { telegramBotToken };

export async function sendTelegramMessage(token: string, chatId: string | number, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    console.error('Telegram send failed', res.status, await res.text());
  }
}

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
    document?: { file_id: string; file_name?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number }; message_id: number };
  };
}

/**
 * Point the bot's webhook at this function's URL (see functions/README.md
 * for the exact setup command). Handles:
 *  - "/start <code>" — links a Telegram account to a user profile.
 *  - "/admin" — opens the admin panel (linked, active admins only).
 *  - Inline-keyboard button taps (callback_query) — routed to botAdmin.ts.
 *  - Plain text / CSV document uploads while a multi-step admin flow is
 *    in progress (new user, block/unblock search, CSV import).
 */
export const telegramWebhook = onRequest({ secrets: [telegramBotToken] }, async (req, res) => {
  const update = req.body as TelegramUpdate;
  const token = telegramBotToken.value();

  // Inline keyboard button tap.
  if (update.callback_query) {
    const cq = update.callback_query;
    await answerCallbackQuery(cq.id);
    const chatId = cq.message?.chat.id;
    const messageId = cq.message?.message_id;
    if (chatId && messageId && cq.data) {
      const admin = await findAdminByChatId(chatId);
      if (admin) await handleAdminCallback(chatId, messageId, admin, cq.data);
    }
    res.sendStatus(200);
    return;
  }

  const message = update.message;
  if (!message) {
    res.sendStatus(200);
    return;
  }
  const chatId = message.chat.id;

  // CSV file upload — only meaningful mid-import-flow, but harmless to
  // attempt for any linked admin; handleCsvImport itself validates columns.
  if (message.document) {
    const admin = await findAdminByChatId(chatId);
    if (admin) await handleCsvImport(chatId, admin, message.document.file_id);
    res.sendStatus(200);
    return;
  }

  if (!message.text) {
    res.sendStatus(200);
    return;
  }
  const text = message.text.trim();

  if (text.startsWith('/start')) {
    const code = text.split(/\s+/)[1];
    if (!code) {
      await sendTelegramMessage(
        token,
        chatId,
        'Welcome! Open your profile in the app and tap "Link Telegram" to get a code, then send /start <code> here.',
      );
      res.sendStatus(200);
      return;
    }

    const snap = await db.collection('users').where('telegramLinkCode', '==', code).limit(1).get();
    if (snap.empty) {
      await sendTelegramMessage(token, chatId, 'That code is invalid or has expired. Generate a new one from your profile.');
      res.sendStatus(200);
      return;
    }

    const userDoc = snap.docs[0]!;
    await userDoc.ref.update({ telegramChatId: String(chatId), telegramLinkCode: null });
    await sendTelegramMessage(token, chatId, "You're linked! You'll get homework, quiz, and grade notifications here.");
    res.sendStatus(200);
    return;
  }

  if (text === '/admin') {
    const admin = await findAdminByChatId(chatId);
    if (admin) {
      await showMainMenu(chatId);
    } else {
      await sendMessage(chatId, 'This command is only available to linked admin accounts.');
    }
    res.sendStatus(200);
    return;
  }

  // Not a recognized command — if this admin is mid-flow (new user, block
  // search), treat the text as that flow's next input.
  const admin = await findAdminByChatId(chatId);
  if (admin) {
    await handleAdminText(chatId, text);
  }

  res.sendStatus(200);
});
