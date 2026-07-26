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

export const NOTIFICATION_TYPES = ['homework_published', 'quiz_published', 'grade_published', 'announcement', 'payment_reminder'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const SUPPORTED_LOCALES = ['en', 'uz'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
