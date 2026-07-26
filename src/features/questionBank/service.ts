import { query, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import { collectionRef, createWithAudit, deleteWithAudit, updateWithAudit } from '@/services/repository';
import type { QuestionCategory, QuestionDifficulty, QuestionType } from '@/types/enums';
import type { BankQuestion, QuestionOption, UserProfile } from '@/types/models';

const bankCol = collectionRef<BankQuestion>('questionBank');

/** No orderBy — a teacher's own bank is small; sort/filter client-side. */
export function questionBankQuery(ownerId: string) {
  return query(bankCol, where('ownerId', '==', ownerId));
}

export interface BankQuestionInput {
  category: QuestionCategory;
  difficulty: QuestionDifficulty;
  type: QuestionType;
  prompt: string;
  options: QuestionOption[];
  correctOptionIds: string[];
  correctText: string;
  referenceAnswer: string;
  points: number;
  tags: string[];
}

export function createBankQuestion(actor: UserProfile, input: BankQuestionInput, reason: string) {
  const data: BankQuestion = { ...input, ownerId: actor.uid, createdAt: serverTimestamp() as unknown as Timestamp };
  return createWithAudit(bankCol, 'question', data, { actor, reason });
}

export function updateBankQuestion(
  actor: UserProfile,
  id: string,
  before: BankQuestion,
  input: BankQuestionInput,
  reason: string,
) {
  return updateWithAudit(bankCol, 'question', id, before, { ...before, ...input }, { actor, reason });
}

export function deleteBankQuestion(actor: UserProfile, id: string, before: BankQuestion, reason: string) {
  return deleteWithAudit(bankCol, 'question', id, before, { actor, reason });
}
