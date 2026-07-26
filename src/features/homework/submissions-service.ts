import { doc, query, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { collectionRef } from '@/services/repository';
import { deleteAttachment, uploadAttachments } from '@/services/attachments';
import { notifyUser } from '@/services/notifications';
import type { HomeworkAttachment, HomeworkSubmission, UserProfile } from '@/types/models';

function submissionsCol(hwId: string) {
  return collectionRef<HomeworkSubmission>(`homework/${hwId}/submissions`);
}

/** For the teacher/admin grading view — every submission for one assignment. */
export function submissionsQuery(hwId: string) {
  return query(submissionsCol(hwId));
}

export function submissionRef(hwId: string, studentId: string) {
  return doc(submissionsCol(hwId), studentId);
}

export interface SubmitInput {
  text: string;
}

/** Create or resubmit (Firestore treats setDoc as create/update based on whether the doc exists — rules cover both cases identically for an ungraded submission). New files are appended to whatever the student already had attached. */
export async function submitHomework(
  student: UserProfile,
  hwId: string,
  courseId: string,
  input: SubmitInput,
  newFiles: File[],
  existingFiles: HomeworkAttachment[],
  dueAt: Timestamp,
): Promise<void> {
  const uploaded = await uploadAttachments(`homework/${courseId}/${hwId}/submissions/${student.uid}`, newFiles);
  const data: HomeworkSubmission = {
    text: input.text,
    files: [...existingFiles, ...uploaded],
    submittedAt: serverTimestamp() as unknown as Timestamp,
    isLate: Date.now() > dueAt.toMillis(),
    score: null,
    feedback: '',
    gradedBy: null,
    gradedAt: null,
  };
  await setDoc(submissionRef(hwId, student.uid), data);
}

export async function removeSubmissionFile(
  hwId: string,
  studentId: string,
  currentFiles: HomeworkAttachment[],
  file: HomeworkAttachment,
): Promise<void> {
  await deleteAttachment(file.path);
  await updateDoc(submissionRef(hwId, studentId), {
    files: currentFiles.filter((f) => f.path !== file.path),
  });
}

/** Grading only ever touches these four fields — enforced both here and in firestore.rules. Routine teacher action, intentionally not audit-logged (unlike admin actions elsewhere in the app). */
export async function gradeSubmission(
  grader: UserProfile,
  hwId: string,
  studentId: string,
  score: number,
  feedback: string,
  homeworkTitle: string,
  courseId: string,
): Promise<void> {
  await updateDoc(submissionRef(hwId, studentId), {
    score,
    feedback,
    gradedBy: grader.uid,
    gradedAt: serverTimestamp(),
  });
  try {
    await notifyUser(studentId, {
      type: 'grade_published',
      title: homeworkTitle,
      body: `Graded: ${score}`,
      link: `courses/${courseId}`,
    });
  } catch {
    // Best-effort — grading already succeeded either way.
  }
}
