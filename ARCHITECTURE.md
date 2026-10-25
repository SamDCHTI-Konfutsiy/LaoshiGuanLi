# EMS Architecture

## Platform constraints

GitHub Pages serves static files only. Four capabilities cannot be done
securely client-side and are isolated behind a `services/serverless/*`
interface so the app runs on Firebase's free (Spark) plan today and upgrades
to Blaze without touching feature code:

| Capability | Why it needs a server | Static fallback (Spark) | Upgrade path (Blaze) |
|---|---|---|---|
| Create teacher/student accounts | Needs Admin SDK to assign a role trustworthily | Open self-signup (`status: 'pending'`) + admin approval in the UI | Cloud Function `createUser` (mainly useful for bulk import) |
| Telegram reminders (7d/3d/1d/12h/1h) | Needs cron + bot token | Reminders queued to a `reminders` collection | Scheduled Cloud Function drains the queue |
| FCM push send | Needs a server key | Deferred (in-app notifications only) | Cloud Function trigger on write |
| Quiz auto-grading | Answer key must never reach the browser | `SECURE_GRADING` flag off: grade client-side from `keys` subcollection, gated by rules to teacher/admin review before publish | Flag on: `submitAttempt` Cloud Function grades server-side |

Everything else (Firestore CRUD, Security Rules, offline, PWA) works fully
static. **Exception: Cloud Storage now requires the Blaze plan** — Google
changed this after this project started (Spark no longer supports Storage
at all, not even the free tier). File uploads (Module 4) are the one
feature that's genuinely Blaze-only; everything else in the table above
still works on Spark.

## Stack decisions

- **Router:** `createHashRouter` (react-router v7 data-router API) — GitHub
  Pages has no server rewrites, so path-based history won't survive a reload.
- **RBAC:** `users/{uid}.role` is the source of truth, mirrored into Auth
  **custom claims** (`role`, `groupIds`) so Firestore rules read `request.auth.token`
  directly with no extra `get()` calls per rule evaluation.
- **Dependencies:** kept to what each module actually needs — see each
  module's own notes. No UI kit, no global state library; React Context +
  small query hooks are sufficient at this scale.
- **Offline:** Firestore IndexedDB persistence + Workbox precache (via
  `vite-plugin-pwa`); writes queue natively while offline.

## Data model (Firestore)

```
users/{uid}                role, status(pending|active|disabled), name, email, photoURL,
                           locale, telegramChatId, groupIds[], fcmTokens[], createdAt
semesters/{id}             name, startAt, endAt, isActive
classrooms/{id}            name, capacity, location
groups/{id}                name, semesterId, teacherIds[], memberCount
  └ members/{uid}          joinedAt
courses/{id}               title, description, teacherId, groupIds[], semesterId, archived
  └ lessons/{id}           title, description, order, date, attachments[], classroomId
enrollments/{id}           studentId, courseId, groupId, status
schedules/{id}             courseId, groupId, classroomId, weekday, start, end, semesterId

homework/{id}              courseId, groupIds[], lessonId, title, instructions,
                           attachments[], publishAt, dueAt, allowLate, maxScore,
                           status(draft|published|closed|graded), createdBy, lockedAt
  └ submissions/{studentId}  files[], text, submittedAt, isLate, score, feedback, gradedBy

quizzes/{id}               courseId, groupIds[], durationMin, publishAt, dueAt, attempts,
                           shuffle, passingScore, autoGrade, status
  └ items/{qid}            type, prompt, options[]        (student-readable, no answers)
  └ keys/{qid}              correct, points                (teacher/admin only)
  └ attempts/{uid_n}        answers, startedAt, submittedAt, score, graded

questionBank/{id}          ownerId, category, difficulty, type, prompt, options[], answer, tags[]
attendance/{id}            courseId, groupId, lessonId, date, records{uid:status}, takenBy
manualGrades/{id}          studentId, courseId, title, score, maxScore, comment
studentNotes/{id}          studentId, teacherId, courseId, body
announcements/{id}         title, body, audience{scope,role,courseId,groupId}, publishAt
notifications/{uid}/items/{id}  type, title, body, link, read, createdAt
auditLogs/{id}             actorId, actorRole, action, targetType, targetId,
                           before, after, reason, createdAt   (create-only, admin-read)
```

## RBAC without custom claims

Custom claims require the Admin SDK, i.e. Cloud Functions, i.e. Blaze. Since
Storage now forces Blaze anyway (see above), custom claims could be added
without a plan-tier objection — but `users/{uid}.role` staying the *only*
source of truth is still the simpler, more robust design even now: no
sync-drift between a claim and the document, no re-mint-token dance after
a role change. Firestore rules read it directly via
`get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role`
(see `isAdmin()`/`hasRole()` in `firestore.rules`), each check also
requiring `status == 'active'` so a disabled admin's rules-privileges die
the instant they're disabled, not just their client session.

Account creation: a `meta/adminBootstrap` document (seeded once by hand)
gates a single self-service "become the first admin" signup, created
`active` immediately. Every other signup is open — anyone can create an
account picking "teacher" or "student" — but it's created with
`status: 'pending'` and is powerless: every rule that matters requires
`status == 'active'`, and the app itself (`ProtectedRoute`) shows a
pending account nothing but a waiting screen. An admin reviews and
approves (confirming or correcting the role, optionally assigning groups)
from **Users → Pending**, or rejects (status stays `disabled`). Both the
create and the approve/reject transitions are enforced in
`firestore.rules` itself, not just the client UI — see that file for the
exact logic. There's deliberately no account-deletion path (no Cloud
Functions yet to remove the Auth record); rejecting just leaves it
permanently disabled.

## Security invariants (enforced in rules, not just UI)

- Teacher `update` on `homework` / `quizzes` where `status != 'draft'`:
  `dueAt`, `publishAt`, `status` must be unchanged.
- Only `role == 'admin'` may change a locked `dueAt` or move
  `closed → published`, and the write must include a matching `auditLogs`
  document in the same batch (checked via `getAfter()`) — the audit trail is
  structurally unavoidable, not opt-in.
- `auditLogs`: `create` only. `update` / `delete` denied to everyone.
- `quizzes/*/keys/**`: student read denied unconditionally.

## Folder structure

```
src/
  app/          router.tsx[done] RootShell.tsx[done] RoleHome.tsx[done] RoleRedirect.tsx[done]
                layouts/ RoleShell.tsx[done] Admin|Teacher|StudentLayout.tsx[done]
  firebase/     app.ts[done] auth.ts[done] db.ts[done] storage.ts[done] converters.ts[done] messaging.ts
  contexts/     ThemeContext[done] ToastContext[done] AuthContext[done]
  i18n/         index.ts[done] — single 'common' namespace, en/uz key-parity checked (177 keys)
  hooks/        useDoc.ts[done] useCollection.ts[done] — usePagedQuery useDebounce useMediaQuery
  components/   ui/ Button Modal Table Tabs Badge Spinner EmptyState TextField SelectField
                    TextAreaField ConfirmDialog — all [done]
                form/ (FileUpload logic lives inline in courses/lessons-service.ts for now;
                      extract to a shared component if a second feature needs file upload)
                layout/ ThemeToggle[done] LangToggle[done] — Sidebar Topbar Breadcrumbs
                guards/ ProtectedRoute.tsx[done] RoleGate.tsx[done]
  features/     auth[done] users[done: service+pending-approval+UsersPage] semesters[done] classrooms[done]
                groups[done] courses[done: CRUD+lessons+file upload] audit[done: read-only viewer]
                homework quizzes questionBank attendance grades announcements calendar
                schedule notifications reports search
                  └ each: pages/ components/ hooks/ service.ts types.ts
  services/     repository.ts[done] audit.ts[done] — storage.ts export/{csv,pdf}.ts search.ts
                serverless/ (createUser, reminders, push — interface + Spark fallbacks)
  utils/        storage.ts[done] roleHome.ts[done] date.ts[done] — permissions.ts validation.ts format.ts
  types/        models.ts[done, +Semester/Classroom/Group/Course/Lesson/AuditLogEntry] enums.ts[done]
  locales/      en/ uz/ common.json[done]
functions/      (separate deploy, Blaze only) createUser, telegram, reminders, sendPush, submitAttempt
firestore.rules[done, covers users(pending-approval)/semesters/classrooms/groups/courses/lessons/auditLogs]
storage.rules[done, lesson attachments]  firebase.json[done]  .firebaserc[done]
```

## Build order

One module is completed and validated before the next begins.

| # | Module | Done when |
|---|---|---|
| 0 | Scaffold: Vite/TS/Tailwind, theme, i18n, router shell, PWA, GH Pages workflow | ✅ builds + deploys, dark mode + language switch persist |
| 1 | Firebase core, Auth, RBAC (Firestore-backed, not custom claims — see note below), ProtectedRoute/RoleGate, profile | ✅ 3 roles land on their own layouts |
| 2 | Data layer: converters, generic repository, query hooks, audit service, rules v1 | ✅ generic create/update/delete + audit pairing (no rules-emulator access in this environment — verify by hand per README's test walkthrough) |
| 3 | Admin core: users (open signup + approval), semesters, classrooms, groups, courses, teacher assignment | ✅ admin can provision a full semester end-to-end from the UI |
| 4 | Lessons + Storage uploads (PDF/DOCX/PPTX/XLSX/IMG/ZIP, type+size validation) | ✅ validated client-side and in storage.rules; student can download |
| 5 | Homework lifecycle, submissions, grading, deadline lock, admin override + audit | ✅ rules-enforced: teacher blocked from editing published deadline, only admin can reopen/override |
| 6 | Question bank + quiz builder + attempt runner + auto-grade | ✅ 5 question types round-trip; keys never readable by students (rules-enforced) |
| 7 | Attendance + manual grades (full); student-facing consolidated grades view | ✅ full teacher-facing spreadsheet gradebook deferred to Module 9 (natural fit alongside dashboards/statistics) |
| 8 | Announcements, in-app notifications, schedule (full); calendar aggregation view | ✅ deferred: full calendar view (lessons/homework/quiz/announcements in one aggregated view) — reasonable given each is already visible in its own place |
| 9 | Global search, dashboards/statistics, full teacher gradebook, CSV + PDF export | ✅ PDF export via browser print-to-PDF (no added dependency) |
| 10 | Cloud Functions: bulk account creation, Telegram link + reminders | ✅ needs manual deploy (see functions/README.md); single 1h-before reminder tier, not the full 7d/3d/1d/12h/1h cascade; FCM push deferred (client-side only — see Status) |
| 11 | Hardening: rules tests, a11y pass, offline, perf budget, prod deploy | ✅ all 11 modules complete — see PRODUCTION_CHECKLIST.md before going live |
