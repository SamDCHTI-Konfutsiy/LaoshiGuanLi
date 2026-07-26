import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useDoc } from '@/hooks/useDoc';
import { useCollection } from '@/hooks/useCollection';
import { collectionRef } from '@/services/repository';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { addBankQuestionToQuiz, quizItemsQuery, removeQuizQuestion } from '@/features/quizzes/service';
import { questionBankQuery } from '@/features/questionBank/service';
import type { Quiz } from '@/types/models';

const quizzesCol = collectionRef<Quiz>('quizzes');

export function QuizBuilderPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const { profile } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();

  const quizRef = useMemo(() => (quizId ? doc(quizzesCol, quizId) : null), [quizId]);
  const { data: quiz, loading: quizLoading } = useDoc(quizRef);
  const itemsQ = useMemo(() => (quizId ? quizItemsQuery(quizId) : null), [quizId]);
  const { data: items, loading: itemsLoading } = useCollection(itemsQ);
  const bankQ = useMemo(() => (profile ? questionBankQuery(profile.uid) : null), [profile]);
  const { data: bank, loading: bankLoading } = useCollection(bankQ);

  const [busyId, setBusyId] = useState<string | null>(null);

  const usedPrompts = useMemo(() => new Set(items.map((i) => i.prompt)), [items]);
  const available = useMemo(() => bank.filter((q) => !usedPrompts.has(q.prompt)), [bank, usedPrompts]);
  const totalPoints = useMemo(() => items.reduce((sum, i) => sum + i.points, 0), [items]);

  async function handleAdd(bankQuestionId: string) {
    if (!profile || !quizId) return;
    const question = bank.find((q) => q.id === bankQuestionId);
    if (!question) return;
    setBusyId(bankQuestionId);
    try {
      await addBankQuestionToQuiz(profile, quizId, question, items.length, '');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(itemId: string) {
    if (!profile || !quizId) return;
    setBusyId(itemId);
    try {
      await removeQuizQuestion(profile, quizId, itemId, '');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setBusyId(null);
    }
  }

  if (quizLoading) return <Spinner label={t('loading')} />;
  if (!quiz || !quizId) return <EmptyState title={t('admin.courses.notFound')} />;

  if (quiz.status !== 'draft') {
    return (
      <div className="p-6">
        <EmptyState title={t('quiz.builderLockedNotice')} />
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="font-display text-xl font-semibold">{t('quiz.builderTitle', { title: quiz.title })}</h1>
      <p className="mt-1 text-sm text-text-muted">{t('quiz.totalPoints', { points: totalPoints })}</p>

      <h2 className="mt-6 font-medium">{t('quiz.currentQuestions')}</h2>
      <div className="mt-2">
        {itemsLoading ? (
          <Spinner label={t('loading')} />
        ) : items.length === 0 ? (
          <EmptyState title={t('quiz.noQuestionsYet')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <span className="text-sm">{item.prompt}</span>
                  <div className="mt-1 flex gap-2">
                    <Badge tone="steel">{t(`quiz.questionType.${item.type}`)}</Badge>
                    <Badge>{item.points} pts</Badge>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void handleRemove(item.id)}
                  className="text-sm font-medium text-coral-500 hover:underline disabled:opacity-50"
                >
                  {t('common.remove')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h2 className="mt-6 font-medium">{t('quiz.addFromBank')}</h2>
      <div className="mt-2">
        {bankLoading ? (
          <Spinner label={t('loading')} />
        ) : available.length === 0 ? (
          <EmptyState title={t('quiz.bank.empty')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {available.map((q) => (
              <li key={q.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <span className="text-sm">{q.prompt}</span>
                  <div className="mt-1 flex gap-2">
                    <Badge tone="steel">{t(`quiz.questionType.${q.type}`)}</Badge>
                    <Badge>{t(`quiz.category.${q.category}`)}</Badge>
                    <Badge>{q.points} pts</Badge>
                  </div>
                </div>
                <Button loading={busyId === q.id} onClick={() => void handleAdd(q.id)}>
                  {t('quiz.addQuestionAction')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
