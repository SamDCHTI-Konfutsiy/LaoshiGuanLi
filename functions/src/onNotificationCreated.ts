import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, messaging } from './admin';
import { sendTelegramMessage, telegramBotToken } from './telegram';

export const onNotificationCreated = onDocumentCreated(
  { document: 'notifications/{uid}/items/{id}', secrets: [telegramBotToken] },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const uid = event.params.uid;

    const userSnap = await db.doc(`users/${uid}`).get();
    const user = userSnap.data();
    if (!user) return;

    const tokens: string[] = Array.isArray(user.fcmTokens) ? user.fcmTokens : [];
    if (tokens.length > 0) {
      try {
        const result = await messaging.sendEachForMulticast({
          tokens,
          notification: { title: data.title as string, body: (data.body as string) || (data.title as string) },
        });
        // Prune any tokens the device/browser has since revoked, so the
        // array doesn't grow stale forever.
        const invalid: string[] = [];
        result.responses.forEach((r, i) => {
          if (!r.success) invalid.push(tokens[i]);
        });
        if (invalid.length > 0) {
          await userSnap.ref.update({ fcmTokens: tokens.filter((t) => !invalid.includes(t)) });
        }
      } catch (err) {
        console.error('FCM send failed', err);
      }
    }

    if (user.telegramChatId) {
      try {
        await sendTelegramMessage(telegramBotToken.value(), user.telegramChatId, `${data.title}\n${data.body ?? ''}`.trim());
      } catch (err) {
        console.error('Telegram send failed', err);
      }
    }
  },
);
