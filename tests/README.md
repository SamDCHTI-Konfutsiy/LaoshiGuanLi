# Firestore rules tests

These test the security rules directly, against a local emulator — not
your real Firestore data. Five suites cover the invariants that matter
most if they ever broke silently:

- `quiz-keys.test.ts` — a student can never read a quiz's answer key,
  at any status, from any angle (own account, no account, wrong teacher).
- `homework-deadline-lock.test.ts` — a teacher can never move a
  published assignment's due date or reopen a closed one; admin can.
- `user-name-editing.test.ts` — a student can't rename themselves;
  a teacher can.
- `audit-log.test.ts` — anyone can log their own action, nobody can
  fake someone else's, only admin can read the log.
- `manual-grades-privacy.test.ts` — a student sees their own grade,
  never a classmate's.

## Running them

Needs the Firebase CLI (same one used for Cloud Functions — see
`functions/README.md` if you haven't installed it yet) and Java (the
emulator runs on the JVM; `firebase emulators:start` will tell you if
Java is missing and how to get it).

From the project root:

```bash
npm install
npm run test:rules
```

This starts the Firestore emulator, runs all five suites against it,
and shuts the emulator down afterward — nothing touches your real
Firebase project.

## If a test fails

A failure here means either:
1. **The rules genuinely regressed** — something changed
   `firestore.rules` in a way that broke one of these invariants. Fix
   the rule, don't fix the test.
2. **The test's assumptions are stale** — if you deliberately change
   one of these behaviors (e.g., decide teachers *should* be able to
   rename students), update the corresponding test to match the new,
   intended behavior.

## Adding more tests

Each file follows the same shape: a `seed()` helper that writes test
data with rules disabled (`testEnv.withSecurityRulesDisabled`), then
`assertSucceeds`/`assertFails` against an `authenticatedContext(uid)`
or `unauthenticatedContext()`. Copy an existing file as a starting
point — the pattern is the same throughout.
