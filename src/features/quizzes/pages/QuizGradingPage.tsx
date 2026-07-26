import { useEffect, useMemo, useState } from 'react';
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
import { getQuizKeys, quizItemsQuery } from '@/features/quizzes/service';
import { attemptsQuery, finalizeGrade } from '@/features/quizzes/attempts-service';
import { usersQuery } from '@/features/users/service';
import { formatDateTime } from '@/utils/date';
import type { Quiz, QuizAnswer, QuizItem, QuizKey, WithId } from '@/types/models';

const quizzesCol = collectionRef<Quiz>('quizzes');

export function QuizGradingPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const { t, i18n } = useTranslation();

  const quizRef = useMemo(() => (quizId ? doc(quizzesCol, quizId) : null), [quizId]);
  const { data: quiz, loading: quizLoading } = useDoc(quizRef);
  const itemsQ = useMemo(() => (quizId ? quizItemsQuery(quizId) : null), [quizId]);
  const { data: items, loading: itemsLoading } = useCollection(itemsQ);
  const attemptsQ = useMemo(() => (quizId ? attemptsQuery(quizId) : null), [quizId]);
  const { data: attempts, loading: attemptsLoading } = useCollection(attemptsQ);
  const stQuery = useMemo(() => usersQuery('student'), []);
  const { data: students } = useCollection(stQuery);

  const [keys, setKeys] = useState<Map<string, QuizKey> | null>(null);
  useEffect(() => {
    if (!quizId) return;
    void getQuizKeys(quizId).then(setKeys);
  }, [quizId]);

  const studentName = useMemo(() => new Map(students.map((s) => [s.uid, s.name])), [students]);
  const relevant = useMemo(
    () => [...attempts].filter((a) => a.status === 'submitted' || a.status === 'graded'),
    [attempts],
  );

  if (quizLoading || itemsLoading || attemptsLoading || !keys) return <Spinner label={t('loading')} />;
  if (!quiz || !quizId) return <EmptyState title={t('admin.courses.notFound')} />;

  return (
    <div className="p-6">
      <h1 className="font-display text-xl font-semibold">{quiz.title}</h1>
      <p className="mt-1 text-sm text-text-muted">
        {t('homework.due', { date: formatDateTime(quiz.dueAt, i18n.language) })}
      </p>

      <div className="mt-6">
        {relevant.length === 0 ? (
          <EmptyState title={t('homework.noSubmissions')} />
        ) : (
          <ul className="flex flex-col gap-4">
            {relevant.map((attempt) => (
              <AttemptGradeCard
                key={attempt.id}
                quizId={quizId}
                quizTitle={quiz.title}
                courseId={quiz.courseId}
                studentName={studentName.get(attempt.studentId) ?? attempt.studentId}
                studentId={attempt.studentId}
                attemptNumber={attempt.attemptNumber}
                answers={attempt.answers}
                status={attempt.status}
                score={attempt.score}
                maxScore={attempt.maxScore}
                items={items}
                keys={keys}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AttemptGradeCard({
  quizId,
  quizTitle,
  courseId,
  studentName,
  studentId,
  attemptNumber,
  answers,
  status,
  score,
  maxScore,
  items,
  keys,
}: {
  quizId: string;
  quizTitle: string;
  courseId: string;
  studentName: string;
  studentId: string;
  attemptNumber: number;
  answers: QuizAnswer[];
  status: 'submitted' | 'graded' | 'in_progress';
  score: number | null;
  maxScore: number;
  items: WithId<QuizItem>[];
  keys: Map<string, QuizKey>;
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  const answerByQuestion = useMemo(() => new Map(answers.map((a) => [a.questionId, a])), [answers]);

  const objectiveScore = useMemo(() => {
    let sum = 0;
    for (const item of items) {
      if (item.type === 'short_answer') continue;
      const key = keys.get(item.id);
      const answer = answerByQuestion.get(item.id);
      if (!key || !answer) continue;
      if (item.type === 'fill_blank') {
        if (answer.text.trim().toLowerCase() === key.correctText.trim().toLowerCase()) sum += item.points;
        continue;
      }
      const selected = [...answer.selectedOptionIds].sort();
      const correct = [...key.correctOptionIds].sort();
      if (selected.length === correct.length && selected.every((id, i) => id === correct[i])) sum += item.points;
    }
    return sum;
  }, [items, keys, answerByQuestion]);

  const shortAnswerItems = items.filter((i) => i.type === 'short_answer');
  const [manualScores, setManualScores] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const totalScore = objectiveScore + Object.values(manualScores).reduce((a, b) => a + b, 0);

  async function handleFinalize() {
    if (!profile) return;
    setSaving(true);
    try {
      await finalizeGrade(profile, quizId, studentId, attemptNumber, totalScore, quizTitle, courseId);
      toast.show(t('homework.gradeSaved'), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">{studentName}</h2>
        {status === 'graded' ? (
          <Badge tone="teal">{t('quiz.graded', { score, max: maxScore })}</Badge>
        ) : (
          <Badge tone="amber">{t('quiz.awaitingGrade')}</Badge>
        )}
      </div>

      <p className="mt-2 text-sm text-text-muted">
        {t('quiz.objectiveScore', { score: objectiveScore })}
      </p>

      {shortAnswerItems.length > 0 && (
        <div className="mt-3 flex flex-col gap-3">
          {shortAnswerItems.map((item) => {
            const answer = answerByQuestion.get(item.id);
            return (
              <div key={item.id} className="rounded-lg bg-surface p-3">
                <p className="text-sm font-medium">{item.prompt}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-text-muted">{answer?.text || '—'}</p>
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-sm text-text-muted">{t('homework.score')}:</label>
                  <input
                    type="number"
                    min={0}
                    max={item.points}
                    value={manualScores[item.id] ?? 0}
                    onChange={(e) =>
                      setManualScores((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))
                    }
                    className="h-8 w-20 rounded-lg border border-border bg-surface-raised px-2 text-sm"
                  />
                  <span className="text-xs text-text-muted">/ {item.points}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {status !== 'graded' && (
        <Button loading={saving} onClick={() => void handleFinalize()} className="mt-4">
          {t('quiz.finalizeGrade', { total: totalScore, max: maxScore })}
        </Button>
      )}
    </li>
  );
}
