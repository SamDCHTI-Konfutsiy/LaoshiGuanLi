export const ROLES = ['admin', 'teacher', 'student'] as const;
export type Role = (typeof ROLES)[number];

/** A signup request is 'pending' until an admin approves or rejects it (rejection reuses 'disabled'). */
export const ACCOUNT_STATUSES = ['pending', 'active', 'disabled'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const HOMEWORK_STATUSES = ['draft', 'published', 'closed', 'graded'] as const;
export type HomeworkStatus = (typeof HOMEWORK_STATUSES)[number];

export const QUESTION_TYPES = ['single_choice', 'multiple_choice', 'true_false', 'fill_blank', 'short_answer'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_CATEGORIES = ['grammar', 'vocabulary', 'reading', 'listening', 'writing'] as const;
export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number];

export const QUESTION_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type QuestionDifficulty = (typeof QUESTION_DIFFICULTIES)[number];

/** No 'graded' state at the quiz level — grading happens per-attempt, not per-quiz. */
export const QUIZ_STATUSES = ['draft', 'published', 'closed'] as const;
export type QuizStatus = (typeof QUIZ_STATUSES)[number];

export const ATTEMPT_STATUSES = ['in_progress', 'submitted', 'graded'] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const ATTENDANCE_STATUSES = ['present', 'late', 'absent', 'excused'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ANNOUNCEMENT_SCOPES = ['all', 'role', 'course', 'group'] as const;
export type AnnouncementScope = (typeof ANNOUNCEMENT_SCOPES)[number];

export const NOTIFICATION_TYPES = ['homework_published', 'quiz_published', 'grade_published', 'announcement', 'payment_reminder', 'hanzi_published', 'hanzi_reviewed'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const SUPPORTED_LOCALES = ['en', 'uz'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

// ---------------------------------------------------------------------------
// Hanzi practice module (汉字练习)
// ---------------------------------------------------------------------------

/**
 * writing      — draw the character(s); stroke order checked by HanziWriter.
 * hanzi_input  — type the character(s) with a keyboard/IME (pinyin + meaning shown).
 * pinyin       — see the hanzi, type its pinyin.
 * translation  — see the hanzi (+ pinyin), type the Uzbek meaning.
 * dictation    — hear the word (browser text-to-speech), type the hanzi.
 */
export const HANZI_EXERCISE_TYPES = ['writing', 'hanzi_input', 'pinyin', 'translation', 'dictation'] as const;
export type HanziExerciseType = (typeof HANZI_EXERCISE_TYPES)[number];

/** Same shape as homework's lifecycle minus 'graded' — grading is per-submission. */
export const HANZI_ASSIGNMENT_STATUSES = ['draft', 'published', 'closed'] as const;
export type HanziAssignmentStatus = (typeof HANZI_ASSIGNMENT_STATUSES)[number];

/**
 * draft          — "yuborilmagan": student has saved progress but not submitted.
 * submitted      — "yuborilgan": waiting for the teacher.
 * in_review      — "tekshirilmoqda": the teacher opened/started reviewing it.
 * needs_revision — "qayta ishlash kerak": sent back; student may resubmit.
 * reviewed       — "tekshirildi": final teacher score is set.
 * A student with no submission document at all is also "not submitted".
 */
export const HANZI_SUBMISSION_STATUSES = ['draft', 'submitted', 'in_review', 'needs_revision', 'reviewed'] as const;
export type HanziSubmissionStatus = (typeof HANZI_SUBMISSION_STATUSES)[number];

export const HANZI_GRID_TYPES = ['mi', 'tian'] as const; // 米字格 / 田字格
export type HanziGridType = (typeof HANZI_GRID_TYPES)[number];

export type HanziItemVerdict = 'correct' | 'incorrect' | 'unanswered';
