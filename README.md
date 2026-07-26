# EMS — Education Management System

React + Vite + TypeScript + Tailwind v4, deployed as a static PWA to GitHub Pages.
Backend (Auth, Firestore, Storage, FCM) is Module 1+; this module is the
application shell only.

## Status

**Telegram bot admin panel + payment reminder buttons + Telegram unlink.**

Built the full Telegram bot admin panel requested — send `/admin` to
the bot (linked, active admin accounts only) for an inline-button menu
covering pending approvals, unpaid-student reminders (one or bulk),
block/unblock by email, creating a new user (multi-step: role → name
→ email → auto-generated password), and CSV export/import of users.
Every write action is logged to the same audit log the website uses.
See `functions/README.md` → "Admin panel via Telegram" for the full
menu and a testing checklist — **bot conversations can't be verified
by building/typechecking alone, so please work through that checklist
after deploying**, since I can't run this myself.

Also added, on the website: a configurable monthly fee amount, a
"show unpaid only" filter, and per-student / bulk "send reminder"
buttons on the Payments page (using the exact wording requested,
auto-filled with the student's name, month, and amount). Profile page
now has a "Disconnect Telegram" button so a stuck/expired link can be
redone.

## Firebase project setup (one-time, manual)

The app's Firebase Web config is already committed in `src/firebase/app.ts`
(this is safe — see the comment there). Four things still need to be done
once in the [Firebase Console](https://console.firebase.google.com), since
they aren't exposed by the client SDK:

1. **Authentication → Sign-in method → Email/Password → Enable.**
2. **Firestore Database → Rules** — paste in the contents of
   `firestore.rules` from this repo and **Publish**.
3. **Storage → Rules** — paste in the contents of `storage.rules` and
   **Publish**. (If Storage hasn't been initialized yet, click **Get
   started** first — Storage now requires the Blaze plan, see Firebase's
   own prompt if you're still on Spark.)
4. **Firestore Database → Data** — create a document at
   `meta/adminBootstrap` with a single boolean field `claimed` set to
   `false`. This is what lets the very first person to visit `/signup`
   create the first admin account.

## How signup works

Anyone can sign up at `/signup` — no invite code. They pick "I am a"
Teacher or Student, and the account is created with `status: 'pending'`.
A pending account can sign in but sees only a waiting screen — it can't
reach any role area until an admin approves it (**Users → Pending** in
the admin app), at which point the admin confirms or corrects the
requested role and optionally assigns groups. This is enforced in
`firestore.rules`, not just the UI — a pending account genuinely cannot
read or write anything role-gated. The very first account ever is the
one exception: `/signup` shows an extra link, *"No admin account yet?
Create the first one"*, which creates an active admin directly (see
`meta/adminBootstrap` above).

**Forgot password:** the "Forgot password?" link on `/login` sends a
Firebase-hosted reset email — no extra setup needed, this works out of
the box once Email/Password sign-in is enabled.

## Re-publishing rules after this update

Neither `firestore.rules` nor `storage.rules` changed this round — the
bot admin panel writes through the Admin SDK, which bypasses rules
entirely, and Telegram unlink reuses fields already allowed from
before. **Nothing to re-publish.**

The Cloud Functions **do** need redeploying though — see below.

This update also adds a new Cloud Function (`paymentReminders`) — see
"Setting up & trying payments" below for the redeploy steps.

## Trying the new admin features

1. Sign up at `/signup` as a **Teacher** (a fresh browser profile / private
   window, since you'll likely already be signed in as admin otherwise).
2. As admin: **Users → Pending** → Approve that teacher.
3. **Semesters** → create one. **Classrooms** → create one (optional).
4. **Groups** → New group (pick the semester and the teacher from step 1).
5. Sign up a second account as a **Student**, approve it, assign it to
   the group from **Groups → Manage members**.
6. **Courses** → New course (pick the teacher, semester, group).
7. Open the course → **New lesson** → attach a file → save, then click it
   to confirm it downloads.
8. **Audit log** → confirm every step above shows up with a reason where
   you entered one.
9. On `/login`, click **Forgot password?** and confirm the reset email
   arrives.

## Trying homework (Module 5)

1. As the teacher (or admin), open the course from step 6 above → the
   **Homework** tab → **New homework**. Fill it in, set a due date a few
   minutes in the future, save — it lands as a **Draft**.
2. Click **Publish**. Try editing the due date now — the date fields are
   disabled; only content can change.
3. As the student, open the same course (**My Courses** in the sidebar)
   → the same homework should show a **Submit** button. Submit some text
   and/or a file.
4. As the teacher, click **View submissions** on that homework → you
   should see the student's submission → enter a score and feedback →
   **Save**.
5. Back as the student, the homework should now show **Graded: X/Y**.
6. As **admin**, open the same homework and use **Override** to extend
   the deadline or reopen a closed assignment — this is the one action
   a teacher can never do themselves; confirm it requires a reason and
   shows up in the audit log.

## Trying quizzes (Module 6)

1. As the teacher, go to **Question Bank** in the sidebar → add a few
   questions covering different types (at least one single choice, one
   fill-in-the-blank, and one short answer, to see all the grading paths).
2. Open a course → **Quizzes** tab → **New quiz**. Save — it's a draft.
3. **Manage questions** → add the questions from your bank → **Publish**
   the quiz from the Quizzes tab.
4. As the student, open the course → **Quizzes** → **Start**. Answer
   everything, watch the timer, **Submit quiz** (or let the timer hit
   zero — it auto-submits).
5. As the teacher, **View attempts** on that quiz. Objective questions
   are already scored; enter points for the short-answer one → **Save
   grade**.
6. Back as the student, the quiz should show **Graded: X/Y**.
7. As **admin**, confirm you can override a published quiz's dates the
   same way as homework.

## Trying attendance & grades (Module 7)

1. As the teacher, open a course with a group assigned → **Attendance**
   tab → **Take attendance**. Pick a date, mark each student
   Present/Late/Absent/Excused → **Save**.
2. As the student in that group, open the same course → **Attendance** —
   you should see your own status for that session.
3. As the teacher, same course → **Grades** tab → **New grade**. Pick the
   student, give it a title (e.g. "Class participation") and a score.
4. As the student, go to **My Grades** in the sidebar — the grade should
   appear there with the course name and your feedback.

## Trying the quiz-start fix + CSV

1. As the student, open a published quiz you haven't attempted yet — you
   should now see a **Start** button (this was broken before this fix).
2. As the teacher, **Question Bank** → **Download CSV template** — open
   it, it shows one example row per question type.
3. Fill in a few more rows (or just re-upload the template as-is) →
   **Import CSV** → pick the file → review the preview → **Import**.
4. **Export CSV** → confirm the downloaded file has all your questions,
   re-importable as-is.
5. As admin, **Users** tab → **Export CSV** → confirm it downloads the
   currently-filtered list (try filtering by role first).

## Trying announcements, notifications & schedule (Module 8)

1. As **admin**, **Announcements** → **New announcement** → audience
   **Everyone** → publish. As **any** other role, open **Announcements**
   — it should show up, and a red badge should appear on
   **Notifications** in the sidebar.
2. As the **teacher**, **Announcements** → **New announcement** →
   audience **One group** → pick a course, then a group → publish. Only
   students in that group (and any teacher/admin) should see it.
3. As the teacher, publish a homework or quiz in a course with a group
   assigned — the enrolled students should get a notification (check
   **Notifications**, unread badge).
4. Grade a homework submission or quiz attempt — that specific student
   should get a "grade published" notification.
5. As **admin**, **Schedule** → **New slot** → pick a course, group,
   semester, weekday, and times → save. Confirm it shows up (read-only)
   for teacher and student too.

## Trying the notification-link, form, and name-editing fixes

1. Trigger any notification (publish a homework/quiz, or send an
   announcement) and click it — it should now open the right page
   instead of a blank/404 screen.
2. **Schedule → New slot**, save right away without touching any
   dropdown — it should now save correctly (previously this could
   silently do nothing if the semester list hadn't finished loading).
3. As a **student**, open **Profile** — the name field should be
   disabled with a note that admin manages it.
4. As **admin**, **Users** → pick any user → **Rename** → change the
   name → save. Confirm it updates everywhere that name is shown.
5. As **admin**, **Users** → pick any user → **Send password reset** →
   confirm the toast, and that the user receives the email.

## Trying search, dashboards & the gradebook (Module 9)

1. Open the app as any role — the home screen should now show real
   numbers (not a placeholder message).
2. **Search** in the sidebar → search for part of a course title or a
   homework/quiz title → confirm results appear and clicking one takes
   you to the right page.
3. As **teacher/admin**, open a course → **Grades** tab → **View full
   gradebook**. Confirm every published homework/quiz shows as a
   column, with scores for graded work and an average per student.
4. **Export CSV** on the gradebook, then **Print / Save as PDF** —
   confirm the print view looks clean (no sidebar/buttons).
5. As **teacher**, open **Homework → View submissions** or **Quiz →
   View attempts** on any course — student names should now display
   correctly (this was silently broken before this round's rules fix).

## Setting up & trying Module 10 (Cloud Functions, Telegram, reminders)

This one needs real infrastructure set up first — see
[`functions/README.md`](functions/README.md) for the complete
step-by-step guide, including how to test each piece (Telegram
linking, bulk CSV account creation, and the hourly deadline-reminder
check).

## Module 11 — hardening

- Run `npm run test:rules` to run the security-rules test suite
  against a local emulator (needs the Firebase CLI + Java — see
  [`tests/README.md`](tests/README.md)).
- Turn your WiFi off mid-session and confirm you see the "you're
  offline" banner, and that things still work reading previously-
  loaded data.
- Before treating this as genuinely live for real students/teachers,
  work through [`PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md) —
  it also lists every deliberate scope cut made across all 11 modules
  in one place.

## Setting up & trying payments

The new `paymentReminders` Cloud Function needs deploying:

```bash
cd functions
npm run build
cd ..
firebase deploy --only functions:paymentReminders
```

Then:

1. As **admin**, **Payments** in the sidebar → pick the current month
   (it defaults there) → **Edit** on a student → mark paid, save.
2. **Export CSV** → confirm it downloads correctly. **Download CSV
   template** → **Import CSV** with the same file → confirm the
   preview shows it as already-valid (email matched an existing
   student).
3. Confirm the admin dashboard shows an accurate "Unpaid this month"
   count, and the student's own dashboard shows their correct status.
4. Set the **Monthly fee amount** (top of the Payments page) and save.
5. Turn on **Show unpaid only**, then click **Send reminder** next to
   one student — confirm they get an in-app notification (and
   Telegram, if linked) with the exact Uzbek wording, current month
   as `MM.YYYY`, and the amount with period thousands separators
   (e.g. `300.000`).
6. Try **Send reminder to all unpaid (N)** and confirm every unpaid
   student gets one.
7. The monthly reminder can't be triggered on a schedule for testing —
   use `firebase functions:shell` then run `paymentReminders()`
   manually against a student you haven't marked paid, and confirm
   they get a notification (and a Telegram message, if linked).

## Setting up & trying the Telegram bot admin panel

The bot's message-handling logic changed substantially this round, so
redeploy the whole Cloud Functions codebase (not just one function):

```bash
cd functions
npm run build
cd ..
firebase deploy --only functions
```

Then send `/admin` to the bot from your own linked admin account, and
work through **all six menu items at least once** — see
[`functions/README.md`](functions/README.md) → "Admin panel via
Telegram" for the full menu and a step-by-step testing checklist. This
is the one piece in the whole project I genuinely can't verify myself
before you test it, so please go through it carefully and tell me
what happens at each step if anything looks off.

## Requirements

- Node.js 22+

## Setup

```bash
npm install
npm run dev
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Type-check (`tsc -b`) then production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Type-check only, no emit |

## Deployment (GitHub Pages)

1. Push this repo to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main` (or run the workflow manually) — `.github/workflows/deploy.yml`
   builds and deploys automatically.

The build's base path is derived from the repository name automatically
(`VITE_BASE_PATH: /${{ github.event.repository.name }}/` in the workflow), so
no manual config is needed even if you rename or fork the repo. Local `dev`/
`preview` default to `/`.

## Icons

`public/icons/*.png` are generated from `scripts/gen-icons.py`. Re-run it
only if the brand mark or colors change (requires Pillow: `pip install
Pillow`).

## Architecture

See project root `ARCHITECTURE.md` (added alongside Module 1) for the full
data model, security-rules design, and module build order.
