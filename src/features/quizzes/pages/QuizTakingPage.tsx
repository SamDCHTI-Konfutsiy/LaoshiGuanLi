import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useDoc } from '@/hooks/useDoc';
import { useCollection } from '@/hooks/useCollection';
import { collectionRef } from '@/services/repository';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { quizItemsQuery } from '@/features/quizzes/service';
import { attemptRef, saveAnswers, startAttempt, submitAttempt } from '@/features/quizzes/attempts-service';
import type { Quiz, QuizAnswer, QuizItem, WithId } from '@/types/models';

const quizzesCol = collectionRef<Quiz>('quizzes');

/** Deterministic per-attempt shuffle (stable across re-renders/saves, not re-shuffled every keystroke). */
function shuffledOrder<T>(items: T[], seed: string): T[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) >>> 0;
    const j = h % (i + 1);
    const temp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = temp;
  }
  return arr;
}

export function QuizTakingPage() {
  const { quizId, attemptNumber: attemptParam } = useParams<{ quizId: string; attemptNumber: string }>();
  const attemptNumber = Number(attemptParam);
  const { profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const quizRef = useMemo(() => (quizId ? doc(quizzesCol, quizId) : null), [quizId]);
  const { data: quiz, loading: quizLoading } = useDoc(quizRef);
  const itemsQ = useMemo(() => (quizId ? quizItemsQuery(quizId) : null), [quizId]);
  const { data: items, loading: itemsLoading } = useCollection(itemsQ);
  const aRef = useMemo(
    () => (quizId && profile ? attemptRef(quizId, profile.uid, attemptNumber) : null),
    [quizId, profile, attemptNumber],
  );
  const { data: attempt, loading: attemptLoading } = useDoc(aRef);

  const [initialized, setInitialized] = useState(false);
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>({});
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  const orderedItems = useMemo(() => {
    if (!quiz) return items;
    return quiz.shuffle && quizId ? shuffledOrder(items, `${quizId}_${profile?.uid ?? ''}_${attemptNumber}`) : items;
  }, [items, quiz, quizId, profile, attemptNumber]);

  // Create the attempt if it doesn't exist yet (first visit for this attempt number).
  useEffect(() => {
    if (initialized || attemptLoading || !quiz || !quizId || !profile) return;
    if (attempt) {
      const map: Record<string, QuizAnswer> = {};
      attempt.answers.forEach((a) => (map[a.questionId] = a));
      setAnswers(map);
      setInitialized(true);
      return;
    }
    const maxScore = items.reduce((sum, i) => sum + i.points, 0);
    void startAttempt(quizId, profile.uid, attemptNumber, maxScore).then(() => setInitialized(true));
  }, [initialized, attemptLoading, attempt, quiz, quizId, profile, attemptNumber, items]);

  const deadlineMs = attempt?.startedAt ? attempt.startedAt.toMillis() + (quiz?.durationMin ?? 0) * 60_000 : null;
  const [remainingSec, setRemainingSec] = useState<number | null>(null);

  useEffect(() => {
    if (!deadlineMs) return;
    const tick = () => setRemainingSec(Math.max(0, Math.round((deadlineMs - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [deadlineMs]);

  async function handleSubmit() {
    if (!quizId || !profile || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      await submitAttempt(quizId, profile.uid, attemptNumber, Object.values(answers));
      toast.show(t('quiz.submitSuccess'), 'success');
      navigate(-1);
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
      submittedRef.current = false;
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (remainingSec === 0 && !submittedRef.current) {
      void handleSubmit();
    }
    // Deliberately only watching remainingSec — handleSubmit is stable
    // enough in practice, and re-running this on its identity change
    // would just add churn, not correctness.
  }, [remainingSec]);

  function updateAnswer(questionId: string, patch: Partial<QuizAnswer>) {
    setAnswers((prev) => {
      const next = {
        ...prev,
        [questionId]: { questionId, selectedOptionIds: [], text: '', ...prev[questionId], ...patch },
      };
      if (quizId && profile) void saveAnswers(quizId, profile.uid, attemptNumber, Object.values(next));
      return next;
    });
  }

  if (quizLoading || itemsLoading || attemptLoading || !initialized) return <Spinner label={t('loading')} />;
  if (!quiz || !quizId || !profile) return <EmptyState title={t('admin.courses.notFound')} />;

  if (attempt && attempt.status !== 'in_progress') {
    return (
      <div className="p-6">
        <EmptyState title={t('quiz.alreadySubmitted')} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold">{quiz.title}</h1>
        {remainingSec !== null && (
          <span className="font-mono text-sm text-text-muted">
            {String(Math.floor(remainingSec / 60)).padStart(2, '0')}:{String(remainingSec % 60).padStart(2, '0')}
          </span>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {orderedItems.map((item, index) => (
          <QuestionCard
            key={item.id}
            index={index}
            item={item}
            answer={answers[item.id]}
            onChange={(patch) => updateAnswer(item.id, patch)}
          />
        ))}
      </div>

      <Button loading={submitting} onClick={() => void handleSubmit()} className="mt-6 w-full">
        {t('quiz.submitQuiz')}
      </Button>
    </div>
  );
}

function QuestionCard({
  index,
  item,
  answer,
  onChange,
}: {
  index: number;
  item: WithId<QuizItem>;
  answer: QuizAnswer | undefined;
  onChange: (patch: Partial<QuizAnswer>) => void;
}) {
  const { t } = useTranslation();
  const selected = answer?.selectedOptionIds ?? [];

  return (
    <div className="rounded-xl border border-border p-4">
      <p className="font-medium">
        {index + 1}. {item.prompt}
      </p>
      <p className="mt-1 text-xs text-text-muted">{item.points} pts</p>

      {(item.type === 'single_choice' || item.type === 'true_false') && (
        <div className="mt-3 flex flex-col gap-2">
          {item.options.map((opt) => (
            <label key={opt.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={item.id}
                checked={selected.includes(opt.id)}
                onChange={() => onChange({ selectedOptionIds: [opt.id] })}
                className="h-4 w-4"
              />
              {opt.text}
            </label>
          ))}
        </div>
      )}

      {item.type === 'multiple_choice' && (
        <div className="mt-3 flex flex-col gap-2">
          {item.options.map((opt) => (
            <label key={opt.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(opt.id)}
                onChange={(e) =>
                  onChange({
                    selectedOptionIds: e.target.checked
                      ? [...selected, opt.id]
                      : selected.filter((id) => id !== opt.id),
                  })
                }
                className="h-4 w-4"
              />
              {opt.text}
            </label>
          ))}
        </div>
      )}

      {item.type === 'fill_blank' && (
        <input
          type="text"
          value={answer?.text ?? ''}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder={t('quiz.yourAnswer')}
          className="mt-3 h-10 w-full rounded-lg border border-border bg-surface-raised px-3 text-sm"
        />
      )}

      {item.type === 'short_answer' && (
        <textarea
          value={answer?.text ?? ''}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder={t('quiz.yourAnswer')}
          rows={3}
          className="mt-3 w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
        />
      )}
    </div>
  );
}
