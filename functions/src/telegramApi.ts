import { telegramBotToken } from './secrets';

const API = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;

export interface InlineButton {
  text: string;
  callback_data: string;
}

export type InlineKeyboard = InlineButton[][];

async function callTelegram(method: string, body: Record<string, unknown>): Promise<unknown> {
  const token = telegramBotToken.value();
  const res = await fetch(API(token, method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; description?: string; result?: unknown };
  if (!json.ok) {
    console.error(`Telegram ${method} failed:`, json.description);
  }
  return json.result;
}

export function sendMessage(chatId: string | number, text: string, keyboard?: InlineKeyboard): Promise<unknown> {
  return callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
  });
}

export function editMessage(
  chatId: string | number,
  messageId: number,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<unknown> {
  return callTelegram('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
  });
}

export function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<unknown> {
  return callTelegram('answerCallbackQuery', { callback_query_id: callbackQueryId, text });
}

/** Sends a small text file as a Telegram document (CSV exports). */
export async function sendDocument(chatId: string | number, filename: string, content: string): Promise<void> {
  const token = telegramBotToken.value();
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('document', new Blob([content], { type: 'text/csv' }), filename);
  const res = await fetch(API(token, 'sendDocument'), { method: 'POST', body: form });
  const json = (await res.json()) as { ok: boolean; description?: string };
  if (!json.ok) console.error('Telegram sendDocument failed:', json.description);
}

/** Downloads a file the admin uploaded to the bot (for CSV import), given the file_id from the incoming message. */
export async function downloadTelegramFile(fileId: string): Promise<string> {
  const token = telegramBotToken.value();
  const infoRes = await fetch(API(token, 'getFile') + `?file_id=${fileId}`);
  const info = (await infoRes.json()) as { ok: boolean; result?: { file_path: string } };
  if (!info.ok || !info.result) throw new Error('getFile failed');
  const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${info.result.file_path}`);
  return fileRes.text();
}
