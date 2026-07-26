import type { Timestamp } from 'firebase/firestore';
import type { AccountStatus, AnnouncementScope, AttemptStatus, AttendanceStatus, HomeworkStatus, Locale, NotificationType, QuestionCategory, QuestionDifficulty, QuestionType, QuizStatus, Role } from '@/types/enums';

/** Attaches the Firestore document ID to a model read from a query/get. */
export type WithId<T> = T & { id: string };

/**
 * Strips the `id` field WithId<T> attaches for convenience. Spreading a
 * WithId<T> value straight into a write (`{ ...before, ...changes }`) is
 * an easy mistake — TypeScript allows it (structural typing doesn't flag
 * excess properties on a variable), but it leaks `id` in as a real
 * Firestore field. Most rules silently accept the stray field, but any
 * rule using a strict `hasOnly([...])` on changed keys rejects the whole
 * write. Use this at the start of any write path that might receive a
 * WithId<T> as its "before" state.
 */
export function withoutId<T extends object>(data: WithId<T> | T): T {
  if (!('id' in data)) return data;
  const clean = { ...data };
  delete (clean as { id?: unknown }).id;
  return clean as T;
}


/** users/{uid} */
export interface UserProfile {
  uid: string;
  role: Role;
  status: AccountStatus;
  name: string;
  email: string;
  locale: Locale;
  createdAt: Timestamp | null; // pending until server round-trip resolves serverTimestamp()
  groupIds: string[];
  fcmTokens: string[];
  photoURL?: string;
  telegramChatId?: string;
  /** Set by the client when generating a link code; cleared by the Cloud Function once the Telegram account links. */
  telegramLinkCode?: string | null;
}

/** semesters/{id} */
export interface Semester {
  name: string;
  startAt: Timestamp;
  endAt: Timestamp;
  isActive: boolean;
}

/** classrooms/{id} */
export interface Classroom {
  name: string;
  capacity: number;
  location: string;
}

/** groups/{id} */
export interface Group {
  name: string;
  semesterId: string;
  teacherIds: string[];
  memberCount: number;
  createdAt: Timestamp | null; // pending until server round-trip resolves serverTimestamp()
}

/** groups/{id}/members/{uid} — {uid} is the doc ID, not a field. */
export interface GroupMember {
  joinedAt: Timestamp;
}

/** courses/{id} */
export interface Course {
  title: string;
  description: string;
  teacherId: string;
  groupIds: string[];
  semesterId: string;
  archived: boolean;
  createdAt: Timestamp | null; // pending until server round-trip resolves serverTimestamp()
}

export interface LessonAttachment {
  name: string;
  path: string;
  size: number;
  contentType: string;
}

/** courses/{courseId}/lessons/{id} */
export interface Lesson {
  title: string;
  description: string;
  order: number;
  date: Timestamp;
  classroomId: string | null;
  attachments: LessonAttachment[];
  createdAt: Timestamp | null; // pending until server round-trip resolves serverTimestamp()
}

/** auditLogs/{id} — create-only, admin-read. */
export interface AuditLogEntry {
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  reason: string;
  createdAt: Timestamp | null; // pending until server round-trip resolves serverTimestamp()
}

export interface HomeworkAttachment {
  name: string;
  path: string;
  size: number;
  contentType: string;
}

/** homework/{id} */
export interface Homework {
  courseId: string;
  groupIds: string[];
  lessonId: string | null;
  title: string;
  instructions: string;
  attachments: HomeworkAttachment[];
  publishAt: Timestamp;
  dueAt: Timestamp;
  allowLate: boolean;
  maxScore: number;
  status: HomeworkStatus;
  createdBy: string;
  createdAt: Timestamp | null; // pending until server round-trip resolves serverTimestamp()
}

/** homework/{hwId}/submissions/{studentId} — {studentId} is the doc ID, not a field. */
export interface HomeworkSubmission {
  text: string;
  files: HomeworkAttachment[];
  submittedAt: Timestamp | null;
  isLate: boolean;
  score: number | null;
  feedback: string;
  gradedBy: string | null;
  gradedAt: Timestamp | null;
}

export interface QuestionOption {
  id: string;
  text: string;
}

/** questionBank/{id} — a teacher's reusable question repository. */
export interface BankQuestion {
  ownerId: string;
  category: QuestionCategory;
  difficulty: QuestionDifficulty;
  type: QuestionType;
  prompt: string;
  /** single_choice/multiple_choice/true_false only; empty for fill_blank/short_answer. */
  options: QuestionOption[];
  /** single_choice/multiple_choice/true_false: the correct option id(s). */
  correctOptionIds: string[];
  /** fill_blank: expected answer, matched case-insensitively. */
  correctText: string;
  /** short_answer: grader's reference answer — never auto-matched, just shown while grading. */
  referenceAnswer: string;
  points: number;
  tags: string[];
  createdAt: Timestamp | null;
}

/** quizzes/{id} */
export interface Quiz {
  courseId: string;
  groupIds: string[];
  title: string;
  durationMin: number;
  publishAt: Timestamp;
  dueAt: Timestamp;
  attemptsAllowed: number;
  shuffle: boolean;
  passingScore: number;
  autoGrade: boolean;
  status: QuizStatus;
  createdBy: string;
  createdAt: Timestamp | null;
}

/** quizzes/{quizId}/items/{qid} — student-readable, NEVER includes the answer. */
export interface QuizItem {
  order: number;
  type: QuestionType;
  prompt: string;
  options: QuestionOption[];
  points: number;
}

/** quizzes/{quizId}/keys/{qid} — teacher/admin only, ever. */
export interface QuizKey {
  correctOptionIds: string[];
  correctText: string;
}

export interface QuizAnswer {
  questionId: string;
  selectedOptionIds: string[];
  text: string;
}

/** quizzes/{quizId}/attempts/{studentId_n} */
export interface QuizAttempt {
  studentId: string;
  attemptNumber: number;
  answers: QuizAnswer[];
  startedAt: Timestamp | null;
  submittedAt: Timestamp | null;
  status: AttemptStatus;
  score: number | null;
  maxScore: number;
  gradedBy: string | null;
  gradedAt: Timestamp | null;
}

/** attendance/{id} — one document per (course, session). */
export interface AttendanceRecord {
  courseId: string;
  groupId: string;
  lessonId: string | null;
  date: Timestamp;
  records: Record<string, AttendanceStatus>; // studentUid -> status
  takenBy: string;
  createdAt: Timestamp | null;
}

/** manualGrades/{id} — ad-hoc graded item outside homework/quiz (e.g. class participation). */
export interface ManualGrade {
  studentId: string;
  courseId: string;
  title: string;
  score: number;
  maxScore: number;
  comment: string;
  createdBy: string;
  createdAt: Timestamp | null;
}

/** announcements/{id} */
export interface Announcement {
  title: string;
  body: string;
  audienceScope: AnnouncementScope;
  audienceRole: Role | null;
  courseId: string | null;
  groupId: string | null;
  publishAt: Timestamp;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp | null;
}

/** notifications/{uid}/items/{id} */
export interface AppNotification {
  type: NotificationType;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: Timestamp | null;
}

/** settings/payments — admin-configured values shared by the manual reminder button and the monthly Cloud Function. */
export interface PaymentSettings {
  monthlyFeeAmount: number;
}

/** payments/{studentId}_{yearMonth} — one record per student per calendar month. No record for a given month means "unpaid" by default; admin only ever writes a record once a payment (or an explicit unpaid note) is recorded. */
export interface Payment {
  studentId: string;
  yearMonth: string; // "2026-07"
  paid: boolean;
  amount: number | null;
  paidAt: Timestamp | null;
  markedBy: string | null;
  note: string;
  createdAt: Timestamp | null;
}

/** schedules/{id} — one weekly recurring class slot. */
export interface ScheduleSlot {
  courseId: string;
  groupId: string;
  classroomId: string | null;
  semesterId: string;
  weekday: number; // 0 = Monday .. 6 = Sunday
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  createdAt: Timestamp | null;
}
