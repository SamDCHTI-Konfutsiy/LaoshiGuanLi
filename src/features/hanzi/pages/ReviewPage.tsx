import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useDoc } from '@/hooks/useDoc';
import { useCollection } from '@/hooks/useCollection';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { TextAreaField } from '@/components/ui/TextAreaField';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { ItemPrompt } from '@/features/hanzi/components/ItemPrompt';
import { StrokesPreview } from '@/features/hanzi/components/StrokesPreview';
import { SubmissionStatusBadge, VerdictBadge } from '@/features/hanzi/components/StatusBadge';
import { useStudents } from '@/features/hanzi/hooks';
import { scoreWithOverrides } from '@/features/hanzi/checking';
import { hanziAssignmentsCol, itemsQuery, keysQuery } from '@/features/hanzi/assignments-service';
import {
  adminAssignmentSubmissionsQuery,
  computeAutoResult,
  isLate,
  markInReview,
  saveAutoResult,
  saveReview,
  submissionRef,
  teacherAssignmentSubmissionsQuery,
} from '@/features/hanzi/submissions-service';
import { formatDateTime } from '@/utils/date';
import type { HanziItemVerdict } from '@/types/enums';

export function ReviewPage() {
  const { assignmentId, studentId } = useParams<{ assignmentId: string; studentId: string }>();
  const { profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const base = `/${profile?.role}/hanzi`;

  const aRef = useMemo(() => (assignmentId ? doc(hanziAssignmentsCol, assignmentId) : null), [assignmentId]);
  const { data: assignment, loading: aLoading } = useDoc(aRef);
  const sRef = useMemo(() => (assignmentId && studentId ? submissionRef(assignmentId, studentId) : null), [assignmentId, studentId]);
  const { data: sub, loading: sLoading } = useDoc(sRef);
  const iq = useMemo(() => (assignmentId ? itemsQuery(assignmentId) : null), [assignmentId]);
  const { data: itemsRaw } = useCollection(iq);
  const kq = useMemo(() => (assignmentId ? keysQuery(assignmentId) : null), [assignmentId]);
  const { data: keysRaw } = useCollection(kq);
  const allQ = useMemo(() => {
    if (!assignmentId || !profile) return null;
    return profile.role === 'admin' ? adminAssignmentSubmissionsQuery(assignmentId) : teacherAssignmentSubmissionsQuery(profile.uid, assignmentId);
  }, [assignmentId, profile?.uid, profile?.role]);
  const { data: allSubs } = useCollection(allQ);
  const { byId: students } = useStudents();

  const items = useMemo(() => [...itemsRaw].sort((x, y) => x.order - y.order), [itemsRaw]);
  const keys = useMemo(() => new Map(keysRaw.map((k) => [k.id, k])), [keysRaw]);

  const [overrides, setOverrides] = useState<Record<string, HanziItemVerdict>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [score, setScore] = useState<number | ''>('');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState<'reviewed' | 'needs_revision' | null>(null);
  const loadedFor = useRef<string | null>(null);

  // Seed the form from the stored review once per submission (and again if the student resubmits).
  useEffect(() => {
    if (!sub) return;
    const tag = `${sub.id}:${sub.submittedAt?.toMillis() ?? 0}`;
    if (loadedFor.current === tag) return;
    loadedFor.current = tag;
    setOverrides(sub.itemOverrides ?? {});
    setComments(sub.itemComments ?? {});
    setScore(sub.teacherScore ?? '');
    setFeedback(sub.teacherFeedback ?? '');
  }, [sub]);

  // Opening a submitted piece of work moves it to "tekshirilmoqda".
  useEffect(() => {
    if (sub && assignment && sub.status === 'submitted') {
      void markInReview(assignment.id, sub.studentId).catch(() => undefined);
    }
  }, [sub?.status, assignment?.id]);

  // Automatic-check fallback (see AssignmentDetailPage).
  const autoTried = useRef<string | null>(null);
  useEffect(() => {
    if (!sub || !assignment || sub.status === 'draft' || sub.autoResult) return;
    if (items.length === 0 || keys.size < items.length) return;
    const tag = `${sub.id}:${sub.submittedAt?.toMillis() ?? 0}`;
    if (autoTried.current === tag) return;
    autoTried.current = tag;
    void saveAutoResult(assignment.id, sub.studentId, computeAutoResult(assignment, items, keys, sub.answers)).catch(() => undefined);
  }, [sub, assignment, items, keys]);

  const reviewable = useMemo(
    () =>
      allSubs
        .filter((s) => s.status !== 'draft')
        .map((s) => ({ id: s.studentId, name: students.get(s.studentId)?.name ?? s.studentId }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allSubs, students],
  );
  const pos = reviewable.findIndex((r) => r.id === studentId);
  const prev = pos > 0 ? reviewable[pos - 1] : undefined;
  const next = pos >= 0 && pos < reviewable.length - 1 ? reviewable[pos + 1] : undefined;

  if (aLoading || sLoading) return <Spinner label={t('loading')} />;
  if (!assignment || !sub || !profile || !studentId) return <EmptyState title={t('hanzi.common.notFound')} />;

  const verdicts = sub.autoResult?.verdicts ?? {};
  const itemIds = items.map((i) => i.id);
  const suggested = scoreWithOverrides(verdicts, overrides, itemIds, assignment.maxScore);
  const finalVerdict = (id: string): HanziItemVerdict => overrides[id] ?? verdicts[id] ?? 'unanswered';
  const studentName = students.get(studentId)?.name ?? studentId;

  async function save(status: 'reviewed' | 'needs_revision') {
    if (!profile || !assignment || (status === 'reviewed' && score === '')) return;
    setSaving(status);
    try {
      const finalWrongWords = items.filter((it) => finalVerdict(it.id) !== 'correct').map((it) => keys.get(it.id)?.hanzi ?? '').filter(Boolean);
      const cleanComments = Object.fromEntries(Object.entries(comments).filter(([, v]) => v.trim() !== ''));
      await saveReview(profile, assignment, studentId!, {
        teacherScore: score === '' ? null : Math.min(assignment.maxScore, Math.max(0, Number(score))),
        teacherFeedback: feedback.trim(),
        itemComments: cleanComments,
        itemOverrides: overrides,
        finalWrongWords,
        status,
      });
      toast.show(status === 'reviewed' ? t('hanzi.review.saved') : t('hanzi.review.sentBack'), 'success');
      if (next) navigate(`${base}/assignments/${assignment.id}/review/${next.id}`);
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div>
        <Link to={`${base}/assignments/${assignment.id}`} className="text-sm text-steel-500 hover:underline">
          ← {assignment.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-semibold">{studentName}</h1>
            <p className="text-sm text-text-muted">
              {formatDateTime(sub.submittedAt, i18n.language)} · {t('hanzi.csv.attempts')}: {sub.attemptsUsed}/{assignment.maxAttempts}
              {isLate(sub, assignment) && <span className="ml-1 text-amber-500">· {t('homework.submittedLate')}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SubmissionStatusBadge status={sub.status} />
            {prev && (
              <Link to={`${base}/assignments/${assignment.id}/review/${prev.id}`} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-raised">
                ‹ {prev.name}
              </Link>
            )}
            {next && (
              <Link to={`${base}/assignments/${assignment.id}/review/${next.id}`} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-raised">
                {next.name} ›
              </Link>
            )}
          </div>
        </div>
      </div>

      <ol className="flex flex-col gap-3">
        {items.map((item, index) => {
          const key = keys.get(item.id);
          const answer = sub.answers[item.id];
          const auto = verdicts[item.id];
          return (
            <li key={item.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <ItemPrompt item={item} index={index} />
                <div className="flex items-center gap-2">
                  <Badge tone="steel">{t(`hanzi.types.${item.type}`)}</Badge>
                  {auto ? <VerdictBadge verdict={auto} /> : <Badge>{t('hanzi.review.notChecked')}</Badge>}
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                <div className="flex flex-col gap-2 text-sm">
                  <p>
                    <span className="text-text-muted">{t('hanzi.review.expected')}: </span>
                    <span lang="zh" className="font-kai text-lg">{key?.hanzi}</span> · {key?.pinyin} · {key?.translation}
                    {item.type === 'translation' || item.type === 'pinyin' ? (
                      <span className="text-text-muted"> ({t('hanzi.review.accepted')}: {key?.accepted.join(' | ')})</span>
                    ) : null}
                  </p>
                  {answer?.text ? (
                    <p>
                      <span className="text-text-muted">{t('hanzi.review.answer')}: </span>
                      <span lang={item.type === 'pinyin' || item.type === 'translation' ? undefined : 'zh'} className="font-medium">
                        {answer.text}
                      </span>
                    </p>
                  ) : item.type !== 'writing' && !answer?.freehand ? (
                    <p className="text-text-muted">{t('hanzi.review.noAnswer')}</p>
                  ) : null}

                  {(answer?.writing?.length ?? 0) > 0 || answer?.freehand ? (
                    <div className="flex flex-wrap gap-3">
                      {answer?.writing?.map((w, i) => (
                        <StrokesPreview
                          key={`${w.char}${i}`}
                          strokes={w.strokes}
                          wrongStrokes={w.wrongStrokes}
                          box={1024}
                          gridType={assignment.gridType}
                          ghost={w.char}
                          label={w.completed ? t('hanzi.writing.mistakes', { count: w.mistakes }) : t('hanzi.review.unfinished')}
                        />
                      ))}
                      {answer?.freehand && (
                        <StrokesPreview strokes={answer.freehand} box={1000} gridType={assignment.gridType} label={t('hanzi.review.freehand')} />
                      )}
                    </div>
                  ) : item.type === 'writing' ? (
                    <p className="text-text-muted">{t('hanzi.review.noAnswer')}</p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2 md:w-64">
                  <div className="flex flex-wrap gap-1" role="group" aria-label={t('hanzi.review.override')}>
                    {(['auto', 'correct', 'incorrect'] as const).map((opt) => {
                      const active = opt === 'auto' ? !overrides[item.id] : overrides[item.id] === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          aria-pressed={active}
                          onClick={() =>
                            setOverrides((o) => {
                              const n = { ...o };
                              if (opt === 'auto') delete n[item.id];
                              else n[item.id] = opt;
                              return n;
                            })
                          }
                          className={
                            'rounded-md border px-2 py-1 text-xs font-medium ' +
                            (active
                              ? opt === 'correct'
                                ? 'border-teal-500 bg-teal-100 text-teal-600 dark:bg-surface-raised dark:text-teal-500'
                                : opt === 'incorrect'
                                  ? 'border-coral-500 bg-coral-100 text-coral-600 dark:bg-surface-raised dark:text-coral-500'
                                  : 'border-steel-500 bg-steel-50 text-steel-600 dark:bg-surface-raised dark:text-steel-300'
                              : 'border-border text-text-muted hover:text-text')
                          }
                        >
                          {t(`hanzi.review.opt.${opt}`)}
                        </button>
                      );
                    })}
                  </div>
                  <TextField
                    label={t('hanzi.review.comment')}
                    value={comments[item.id] ?? ''}
                    onChange={(e) => setComments((c) => ({ ...c, [item.id]: e.target.value }))}
                    placeholder={t('hanzi.review.commentPlaceholder')}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <section className="sticky bottom-0 flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-lg">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>
            {t('hanzi.review.auto')}:{' '}
            <strong>{sub.autoResult ? `${sub.autoResult.score}/${sub.autoResult.maxScore} (${sub.autoResult.correct}/${sub.autoResult.total})` : t('hanzi.review.notChecked')}</strong>
            {sub.autoResult && <span className="text-text-muted"> · {sub.autoResult.checkedBy === 'function' ? t('hanzi.review.byServer') : t('hanzi.review.byTeacher')}</span>}
          </span>
          <span>
            {t('hanzi.review.suggested')}: <strong>{suggested}/{assignment.maxScore}</strong>
            <button type="button" onClick={() => setScore(suggested)} className="ml-2 text-steel-500 hover:underline">
              {t('hanzi.review.useSuggested')}
            </button>
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-[160px_1fr]">
          <TextField
            label={`${t('hanzi.review.final')} / ${assignment.maxScore}`}
            type="number"
            min={0}
            max={assignment.maxScore}
            step="0.5"
            value={score}
            onChange={(e) => setScore(e.target.value === '' ? '' : Number(e.target.value))}
          />
          <TextAreaField label={t('homework.feedback')} rows={2} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" loading={saving === 'needs_revision'} disabled={saving !== null} onClick={() => void save('needs_revision')}>
            {t('hanzi.review.sendBack')}
          </Button>
          <Button loading={saving === 'reviewed'} disabled={score === '' || saving !== null} onClick={() => void save('reviewed')}>
            {t('hanzi.review.markReviewed')}
          </Button>
        </div>
      </section>
    </div>
  );
}
