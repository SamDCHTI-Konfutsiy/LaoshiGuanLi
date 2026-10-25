import type { Timestamp } from 'firebase/firestore';
import type { AccountStatus, AnnouncementScope, AttemptStatus, AttendanceStatus, HanziAssignmentStatus, HanziExerciseType, HanziGridType, HanziItemVerdict, HanziSubmissionStatus, HomeworkStatus, Locale, NotificationType, QuestionCategory, QuestionDifficulty, QuestionType, QuizStatus, Role } from '@/types/enums';

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

// ---------------------------------------------------------------------------
// Hanzi practice module (汉字练习) — see ARCHITECTURE.md → "Hanzi practice".
// ---------------------------------------------------------------------------

/** hanziWords/{id} — the shared school vocabulary base. Readable by every active teacher/admin; editable by its owner or admin. */
export interface HanziWord {
  hanzi: string;
  /** Display pinyin, tone marks or tone numbers (nǐ hǎo / ni3 hao3) — both are accepted when checking. */
  pinyin: string;
  /** Uzbek meaning, as shown to students. */
  translation: string;
  /** Extra accepted pinyin spellings (rare — e.g. a heteronym reading). */
  altPinyin: string[];
  /** Extra accepted Uzbek translations (synonyms). */
  altTranslations: string[];
  /** HSK level 1–9 (HSK 3.0; old HSK 1–6 fits inside), or null if unlevelled. */
  hsk: number | null;
  tags: string[];
  ownerId: string;
  ownerName: string;
  createdAt: Timestamp | null;
}

/** hanziAssignments/{id} */
export interface HanziAssignment {
  courseId: string;
  /** Copied from the course at creation — lets rules and queries scope by teacher without an extra get(). */
  teacherId: string;
  groupIds: string[];
  /** Individually picked students. Empty = every member of `groupIds`. */
  studentIds: string[];
  /**
   * Resolved list of students who may open this assignment. Always empty
   * while status is 'draft' and filled in by publish — this is the field
   * firestore.rules checks for student read access.
   */
  targetStudentIds: string[];
  title: string;
  instructions: string;
  exerciseTypes: HanziExerciseType[];
  wordIds: string[];
  itemCount: number;
  dueAt: Timestamp | null;
  allowLate: boolean;
  maxScore: number;
  maxAttempts: number;
  gridType: HanziGridType;
  /** Lets the student watch the stroke-order animation / get hints. Showing it reveals the answer, so it is opt-in. */
  allowStrokeHints: boolean;
  pinyinRequireTones: boolean;
  /** Max HanziWriter-reported mistakes per character still counted as correct. */
  writingMistakeTolerance: number;
  status: HanziAssignmentStatus;
  createdBy: string;
  createdAt: Timestamp | null;
  publishedAt: Timestamp | null;
}

/**
 * hanziAssignments/{id}/items/{itemId} — student-readable, never holds the
 * accepted answers. `target` is the one unavoidable exception: HanziWriter
 * needs the character to check strokes ('writing'), and the browser's
 * text-to-speech needs the text to read it aloud ('dictation').
 */
export interface HanziItem {
  order: number;
  type: HanziExerciseType;
  wordId: string;
  showHanzi: string | null;
  showPinyin: string | null;
  showTranslation: string | null;
  target: string | null;
  charCount: number;
}

/** hanziAssignments/{id}/keys/{itemId} — teacher/admin only. */
export interface HanziKey {
  hanzi: string;
  pinyin: string;
  translation: string;
  /** What a text answer is compared against (already includes the alternatives). */
  accepted: string[];
}

/** One drawn character in a 'writing' item, as reported by HanziWriter in the student's browser. */
export interface HanziWritingChar {
  char: string;
  completed: boolean;
  mistakes: number;
  /** SVG path data (1024×1024 box) of the strokes the student drew that HanziWriter accepted. */
  strokes: string;
  /** SVG path data of rejected strokes. */
  wrongStrokes: string;
}

export interface HanziAnswer {
  text: string;
  writing: HanziWritingChar[];
  /** Free-hand drawing (no automatic recognition), SVG path data in a 1000×1000 box. */
  freehand: string;
}

export interface HanziAutoResult {
  score: number;
  maxScore: number;
  correct: number;
  total: number;
  verdicts: Record<string, HanziItemVerdict>;
  /** Hanzi of every item not answered correctly (duplicates kept) — feeds the "most-missed words" statistic. */
  wrongWords: string[];
  checkedAt: Timestamp | null;
  checkedBy: 'function' | 'teacher';
}

/** hanziSubmissions/{assignmentId}_{studentId} */
export interface HanziSubmission {
  assignmentId: string;
  courseId: string;
  teacherId: string;
  studentId: string;
  answers: Record<string, HanziAnswer>;
  status: HanziSubmissionStatus;
  attemptsUsed: number;
  savedAt: Timestamp | null;
  submittedAt: Timestamp | null;
  /** Automatic check — kept separate from the teacher's final score, never overwritten by it. */
  autoResult: HanziAutoResult | null;
  teacherScore: number | null;
  teacherFeedback: string;
  itemComments: Record<string, string>;
  /** Teacher's per-item correction of the automatic verdict. */
  itemOverrides: Record<string, HanziItemVerdict>;
  /** Like autoResult.wrongWords, but after the teacher's per-item corrections. Set on review. */
  finalWrongWords: string[];
  reviewedBy: string | null;
  reviewedAt: Timestamp | null;
}
