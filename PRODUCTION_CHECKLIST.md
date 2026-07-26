# Production readiness checklist

Work through this once before treating the site as "live" for real
students/teachers, and again after any future change that touches
rules, Cloud Functions, or auth.

## Firebase configuration

- [ ] `firestore.rules` in the Firebase Console matches the file in
      this repo exactly (paste and Publish — see the "Re-publishing
      rules" note in `README.md` for what changed most recently).
- [ ] `storage.rules` likewise matches.
- [ ] `firestore.indexes.json` deployed (`firebase deploy --only
      firestore:indexes`) — the gradebook, search, and deadline
      reminders all depend on composite indexes existing.
- [ ] Authentication → Sign-in method → Email/Password is enabled.
- [ ] `meta/adminBootstrap` exists with `claimed: false` *before* the
      first admin ever signs up (see `README.md` → "How signup works").
- [ ] Firestore → Rules tab shows no unexpected warnings when you
      open it (a quick visual sanity check after pasting).

## Cloud Functions (Module 10)

- [ ] All five functions show as deployed and healthy in Firebase
      Console → Functions (no "failed" status) — including
      `paymentReminders`, added after Module 10's initial deploy.
- [ ] The Telegram bot's `/admin` panel has been walked through end to
      end at least once (see `functions/README.md` → "Admin panel via
      Telegram" for the checklist) — this is the one piece that can't
      be verified by building/typechecking alone.
- [ ] `TELEGRAM_BOT_TOKEN` secret is set and the functions that need
      it (`telegramWebhook`, `onNotificationCreated`) can read it —
      check `firebase functions:log` for secret-related errors.
- [ ] Telegram webhook is pointed at the deployed `telegramWebhook`
      URL (`getWebhookInfo` shows the right URL, no `last_error_message`).
- [ ] `VITE_TELEGRAM_BOT_USERNAME` is set in
      `.github/workflows/deploy.yml` and the site has redeployed since.
- [ ] Ran through `functions/README.md`'s testing section end-to-end
      at least once (Telegram link, bulk CSV import, a manual reminder
      trigger via `firebase functions:shell`).

## Data hygiene

- [ ] Any test/throwaway accounts created while building this
      (`test@mail.ru` and similar) are either disabled or deleted —
      both in Firestore (`status: disabled`) and in Authentication
      (the account itself), so they can't be used to sign in.
- [ ] Every real user document has `status` set (`active`, not
      missing) — an old test account without this field will silently
      fail every role-gated check. See the schema-migration note in
      `README.md`.
- [ ] Every group has a semester assigned, every course has a teacher
      and at least one group, so the app's own dropdowns aren't empty.

## Monitoring & backups

- [ ] Firebase Console → Usage and billing — glance at it once so you
      know the baseline cost before real usage starts.
- [ ] Consider turning on scheduled Firestore backups (paid feature,
      but cheap at this scale) once there's real student data worth
      protecting.
- [ ] Bookmark `firebase functions:log` — it's the fastest way to see
      what's actually happening when Telegram/reminders misbehave.

## Known, accepted trade-offs (not bugs — deliberate scope decisions)

- No FCM (browser push) — Telegram covers "notified when the site
  isn't open"; adding FCM risks conflicting with the PWA's offline
  service worker without a way for me to test the fix live. Revisit
  if this becomes a real ask.
- Deadline reminders are a single "due within the hour" tier, not the
  full 7d/3d/1d/12h/1h cascade — extending this means adding more
  `remindedXXh`-style flags following the same pattern in
  `functions/src/deadlineReminders.ts`.
- No full aggregated Calendar view (lessons + homework + quiz +
  announcements in one visual calendar) — everything is visible in
  its own tab/page already; this would be a convenience layer on top.
- `npm audit` reports some high-severity issues in **build-tool**
  dependencies (a PWA-build transitive package, and a React Router
  advisory about an SSR/RSC mode this app doesn't use). Forcing the
  suggested fixes would downgrade `vite-plugin-pwa` and
  `react-router-dom` — breaking changes that weren't tested against
  this app. Worth re-checking (`npm audit`) periodically as patched
  versions land, rather than force-downgrading blindly now.

## Before every future deploy

- [ ] `npm run typecheck && npm run build` locally (or trust CI, which
      runs the same build).
- [ ] If `firestore.rules` or `storage.rules` changed: re-paste into
      the Console and Publish — pushing to GitHub only redeploys the
      website, never the rules.
- [ ] If anything under `functions/` changed:
      `cd functions && npm run build && cd .. && firebase deploy --only functions`.
