# Deploying Module 10: Cloud Functions, Telegram, reminders

This is different from every previous module — it needs real
infrastructure, not just a rebuild + redeploy of the website. Follow
these steps once, in order, on your own computer (not in a browser).

## What you're setting up

- `createUserAccounts` — lets admin create real logins (with a password)
  for teachers/students in bulk via CSV, instead of open self-signup.
- `telegramWebhook` — links a user's Telegram account to their profile.
- `onNotificationCreated` — whenever the app creates an in-app
  notification, also sends it to Telegram (if linked).
- `deadlineReminders` — runs every hour, reminds students whose
  homework/quiz is due within the next hour and who haven't submitted.

## 0. Prerequisites

- Your Firebase project must already be on the **Blaze (pay-as-you-go)**
  plan — Cloud Functions don't run on the free Spark plan. (You already
  have this, since Storage required it earlier.)
- [Node.js 20+](https://nodejs.org) installed on your computer.
- A terminal (Terminal.app on Mac, or similar).

## 1. Install the Firebase CLI and sign in

```bash
npm install -g firebase-tools
firebase login
```

This opens a browser to sign in with the same Google account that owns
the Firebase project.

## 2. Connect this project folder to your Firebase project

From the root of the unzipped project folder (the one containing
`firestore.rules`, `functions/`, etc.):

```bash
firebase use --add
```

Pick your project (`laoshiguanli` or whatever it's called) from the
list, and give it the alias `default` when asked.

## 3. Create your Telegram bot

1. In Telegram, message **[@BotFather](https://t.me/BotFather)**.
2. Send `/newbot`, give it a name (e.g. "LaoshiGuanLi Notifications")
   and a username ending in `bot` (e.g. `laoshiguanli_notify_bot`).
3. BotFather replies with an **API token** — a long string like
   `123456789:AAF...`. Copy it, you'll need it in the next step.
4. Note the **bot username** too (without the `@`) — you'll need this
   for the app's "Open the bot in Telegram" link.

## 4. Store the bot token as a secret

Cloud Functions needs the token, but it must never be committed to
GitHub. Firebase's **secret manager** handles this:

```bash
cd functions
firebase functions:secrets:set TELEGRAM_BOT_TOKEN
```

Paste the token when prompted, press Enter.

## 5. Deploy the Firestore indexes

The reminder function needs two composite indexes (already defined in
`firestore.indexes.json` at the project root):

```bash
cd ..   # back to the project root
firebase deploy --only firestore:indexes
```

## 6. Deploy the functions

```bash
cd functions
npm install
npm run build
cd ..   # firebase.json lives at the project root — deploy must run from here
firebase deploy --only functions
```

This takes a few minutes the first time. When it finishes, it prints a
URL for `telegramWebhook` — copy it, it looks like:

```
https://us-central1-YOUR-PROJECT.cloudfunctions.net/telegramWebhook
```

## 7. Point the bot at your webhook

Replace `<TOKEN>` and `<WEBHOOK_URL>` and run this once (any terminal,
no Firebase CLI needed — it's a plain HTTPS request to Telegram):

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WEBHOOK_URL>"
```

You should get back `{"ok":true,"result":true,...}`.

## 8. Tell the website your bot's username

Edit `.github/workflows/deploy.yml` in the main project (not
`functions/`) and add your bot's username (from step 3) next to the
existing `VITE_BASE_PATH` line:

```yaml
        env:
          VITE_BASE_PATH: /${{ github.event.repository.name }}/
          VITE_TELEGRAM_BOT_USERNAME: your_bot_username_here
```

Commit and push — the next deploy will pick this up, and the "Open the
bot in Telegram" link on the Profile page will work.

## 9. Test everything

1. **Telegram linking** — sign in, go to **Profile → Telegram
   notifications → Generate link code**, then either tap "Open the bot
   in Telegram" or manually message your bot `/start <code>`. You
   should get a confirmation message back, and the Profile page should
   show "Linked" after a refresh.
2. **Notification → Telegram** — trigger any in-app notification
   (publish a homework, grade something) — it should also arrive on
   Telegram within a few seconds.
3. **Bulk user import** — as admin, **Users → Import CSV**, use the
   downloadable template, confirm accounts are created and can log in
   with the password you set.
4. **Deadline reminders** — this is the hardest to test on demand since
   it runs hourly. To force a manual test: publish a homework with a
   due date ~30–60 minutes from now, wait for the top of the next hour
   (or trigger it manually — see below), and check that an unsubmitted
   student gets a reminder.

### Manually triggering the scheduled function for testing

Scheduled functions don't have a "run now" button in the console by
default. Easiest way to test without waiting:

```bash
firebase functions:shell
```

Then inside the shell:

```
deadlineReminders()
```

## Admin panel via Telegram

Once your own account is linked (see step 9 above), send `/admin` to the
bot. You'll get a menu with inline buttons:

- **📋 Pending approvals** — approve (as Student or Teacher) or reject
  each pending signup.
- **💰 Unpaid students** — send a reminder to one student or to everyone
  unpaid this month, with a button each.
- **🚫 Block / Unblock user** — send an email address when prompted,
  then tap Block or Unblock.
- **➕ New user** — pick a role, then send the name and email as
  separate messages; a random password is generated and shown once —
  share it with the new user yourself (there's no email step from the
  bot).
- **📤 Export users CSV** — sends `users.csv` back as a file.
- **📥 Import users CSV** — prompts you to send a CSV file with
  columns `name,email,password,role`; creates one account per row.

Every write action here (approve/reject, block/unblock, new user,
import) is also written to the same audit log the website uses, tagged
"Via Telegram bot".

**Only a Telegram account linked to an active admin profile can use
`/admin`** — anyone else gets a plain "not available" message. There's
no separate setup step for this beyond redeploying — it reuses the
same webhook and secret as the linking flow.

### Testing this

Bot conversations can't be verified by building/typechecking alone —
unlike the website, I can't run this myself, so please go through each
menu item at least once after deploying:

1. `/admin` → confirm the menu appears.
2. Approve a test pending signup, confirm it becomes active with the
   role you picked.
3. Trigger a payment reminder to one student, confirm they receive it
   (in-app and Telegram).
4. Block, then unblock, a test account by email.
5. Create a new user through the bot, confirm you can log in with the
   shown password.
6. Export CSV, then re-import a small test file, confirm new accounts
   appear.

If any step behaves unexpectedly, `firebase functions:log --only
telegramWebhook` is the fastest way to see what happened server-side.

## Ongoing costs

Cloud Functions, Firestore reads/writes, and Telegram API calls are all
metered on Blaze, but at school scale (dozens to low hundreds of users)
this is normally a few dollars a month at most — the hourly reminder
scan is the main recurring cost, and it's a handful of small reads per
run. Check **Firebase Console → Usage and billing** if you want to keep
an eye on it.

## Troubleshooting

- **"Permission denied" calling createUserAccounts** — the function
  checks that the caller's own Firestore profile has `role: "admin"`
  and `status: "active"`. Confirm both.
- **Telegram messages not arriving** — check
  `firebase functions:log --only telegramWebhook,onNotificationCreated`
  for errors. A common cause is the webhook URL not being set correctly
  (step 7) or the secret not being available yet (redeploy after
  setting a secret with `firebase deploy --only functions`).
- **Reminders not firing** — confirm `firestore.indexes.json` was
  deployed (step 5); without the index, the function's query fails
  silently in the logs rather than reminding anyone.
