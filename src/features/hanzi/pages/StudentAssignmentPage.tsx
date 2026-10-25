import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useDoc } from '@/hooks/useDoc';
import { useCollection } from '@/hooks/useCollection';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ItemPrompt } from '@/features/hanzi/components/ItemPrompt';
import { WritingPad } from '@/features/hanzi/components/WritingPad';
import { FreeDrawCanvas } from '@/features/hanzi/components/FreeDrawCanvas';
import { StrokesPreview } from '@/features/hanzi/components/StrokesPreview';
import { SubmissionStatusBadge, VerdictBadge } from '@/features/hanzi/components/StatusBadge';
import { hanziAssignmentsCol, itemsQuery } from '@/features/hanzi/assignments-service';
import {
  attemptsLeft,
  canRetry,
  canStudentEdit,
  clearLocalDraft,
  effectiveStatus,
  emptyAnswer,
  readLocalDraft,
  retryHanzi,
  saveHanziDraft,
  submissionRef,
  submitHanzi,
  withOfflineTimeout,
  writeLocalDraft,
} from '@/features/hanzi/submissions-service';
import { chineseVoiceAvailable, prefetchCharacters, speakChinese } from '@/features/hanzi/lib/hanziWriter';
import { numberedToMarked } from '@/features/hanzi/lib/pinyin';
import { formatDateTime } from '@/utils/date';
import type { HanziItemVerdict, HanziGridType } from '@/types/enums';
import type { HanziAnswer, HanziItem, HanziWritingChar, WithId } from '@/types/models';

type SaveState = 'idle' | 'saving' | 'saved' | 'queued' | 'error';

function usePadSize(): number {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // Phones: a big pad that fits beside the 16px gutters; desktop: capped.
  return Math.max(130, Math.min(220, Math.floor((Math.min(w, 760) - 80) / 2)));
}

export function StudentAssignmentPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const { profile } = useAuth();
  const toast = useToast();
  const online = useOnlineStatus();
  const { t, i18n } = useTranslation();
  const padSize = usePadSize();

  const aRef = useMemo(() => (assignmentId ? doc(hanziAssignmentsCol, assignmentId) : null), [assignmentId]);
  const { data: assignment, loading: aLoading, error: aError } = useDoc(aRef);
  const iq = useMemo(() => (assignmentId && assignment ? itemsQuery(assignmentId) : null), [assignmentId, Boolean(assignment)]);
  const { data: itemsRaw, loading: iLoading } = useCollection(iq);
  const sRef = useMemo(() => (assignmentId && profile ? submissionRef(assignmentId, profile.uid) : null), [assignmentId, profile?.uid]);
  const { data: sub, loading: sLoading } = useDoc(sRef);
  const items = useMemo(() => [...itemsRaw].sort((a, b) => a.order - b.order), [itemsRaw]);

  const [answers, setAnswers] = useState<Record<string, HanziAnswer>>({});
  const answersRef = useRef(answers);
  const subRef = useRef(sub);
  subRef.current = sub;
  const [initialised, setInitialised] = useState(false);
  const [restoredLocal, setRestoredLocal] = useState(false);
  const [freeMode, setFreeMode] = useState<Record<string, boolean>>({});
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const dirty = useRef(false);

  const editable = Boolean(assignment && canStudentEdit(sub, assignment));

  // Start from whichever is newer: what's on this device, or what's on the server.
  useEffect(() => {
    if (initialised || sLoading || !profile || !assignmentId) return;
    const local = readLocalDraft(assignmentId, profile.uid);
    const serverAt = sub?.savedAt?.toMillis() ?? 0;
    const serverEditable = !sub || sub.status === 'draft' || sub.status === 'needs_revision';
    if (local && local.updatedAt > serverAt + 1000 && serverEditable) {
      answersRef.current = local.answers;
      setAnswers(local.answers);
      setRestoredLocal(true);
      dirty.current = true;
    } else {
      answersRef.current = sub?.answers ?? {};
      setAnswers(sub?.answers ?? {});
    }
    setInitialised(true);
  }, [initialised, sLoading, sub, profile, assignmentId]);

  // When a submitted attempt is withdrawn for a retry, continue from what was submitted.
  const lastStatus = useRef(sub?.status);
  useEffect(() => {
    if (lastStatus.current === 'submitted' && sub?.status === 'draft') {
      answersRef.current = sub.answers;
      setAnswers(sub.answers);
    }
    lastStatus.current = sub?.status;
  }, [sub?.status]);

  // Warm the stroke-data cache while we're (probably) online.
  useEffect(() => {
    const chars = items.filter((i) => i.type === 'writing' && i.target).flatMap((i) => [...(i.target ?? '')]);
    if (chars.length) prefetchCharacters(chars);
  }, [items]);

  // Refs keep flushSave stable, so the listeners below aren't re-attached (and a
  // save isn't forced) every time a snapshot updates `assignment`.
  const assignmentRef = useRef(assignment);
  assignmentRef.current = assignment;
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const flushSave = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    const a = assignmentRef.current;
    const p = profileRef.current;
    if (!dirty.current || !p || !a || !canStudentEdit(subRef.current, a)) return;
    dirty.current = false;
    setSaveState('saving');
    withOfflineTimeout(saveHanziDraft(p, a, subRef.current, answersRef.current), () => setSaveState('error'))
      .then((r) => setSaveState(r === 'sent' ? 'saved' : 'queued'))
      .catch(() => {
        dirty.current = true;
        setSaveState('error');
      });
  }, []);

  // Save when the tab is hidden (phone locked, app switched) and when leaving the page.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flushSave();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      flushSave();
    };
  }, [flushSave]);

  function updateAnswer(itemId: string, patch: Partial<HanziAnswer>) {
    if (!profile || !assignmentId) return;
    const current = answersRef.current;
    const next = { ...current, [itemId]: { ...emptyAnswer(), ...current[itemId], ...patch } };
    answersRef.current = next;
    setAnswers(next);
    writeLocalDraft(assignmentId, profile.uid, next);
    dirty.current = true;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flushSave, 2500);
  }

  function updateWritingChar(item: HanziItem & { id: string }, index: number, value: HanziWritingChar) {
    const chars = [...(item.target ?? '')];
    const existing = answersRef.current[item.id]?.writing ?? [];
    const writing = chars.map(
      (ch, i) => (i === index ? value : (existing[i] ?? { char: ch, completed: false, mistakes: 0, strokes: '', wrongStrokes: '' })),
    );
    updateAnswer(item.id, { writing });
  }

  async function handleSubmit() {
    if (!profile || !assignment || !assignmentId) return;
    window.clearTimeout(saveTimer.current);
    dirty.current = false;
    setSubmitting(true);
    try {
      const r = await withOfflineTimeout(submitHanzi(profile, assignment, subRef.current, answersRef.current), () =>
        toast.show(t('hanzi.work.lateSubmitFailed'), 'error'),
      );
      if (r === 'sent') {
        clearLocalDraft(assignmentId, profile.uid);
        toast.show(t('hanzi.work.submitted'), 'success');
      } else {
        toast.show(t('hanzi.work.submitQueued'), 'info');
      }
      setConfirmSubmit(false);
    } catch {
      toast.show(t('hanzi.work.submitFailed'), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRetry() {
    if (!profile || !assignmentId) return;
    try {
      await retryHanzi(profile, assignmentId);
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    }
  }

  if (aLoading || (assignment && (iLoading || sLoading))) return <Spinner label={t('loading')} />;
  if (aError || !assignment || !profile) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState title={aError ? t('hanzi.student.noAccess') : t('hanzi.common.notFound')} action={<Link to="/student/hanzi" className="text-sm text-steel-500 hover:underline">{t('hanzi.student.backToList')}</Link>} />
      </div>
    );
  }

  const status = effectiveStatus(sub);
  const showResults = !editable && sub && sub.status !== 'draft';
  const verdictOf = (id: string): HanziItemVerdict | null => sub?.itemOverrides?.[id] ?? sub?.autoResult?.verdicts[id] ?? null;
  const left = attemptsLeft(sub, assignment);
  const pastDue = Boolean(assignment.dueAt && Date.now() > assignment.dueAt.toMillis());
  const answeredCount = items.filter((it) => {
    const a = answers[it.id];
    return Boolean(a && (a.text.trim() || a.freehand || a.writing.some((w) => w.strokes)));
  }).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-6">
      <div>
        <Link to="/student/hanzi" className="text-sm text-steel-500 hover:underline">
          ← {t('hanzi.title')}
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <h1 className="font-display text-xl font-semibold">{assignment.title}</h1>
          <SubmissionStatusBadge status={status} />
        </div>
        <p className={'mt-1 text-sm ' + (pastDue && editable ? 'text-coral-500' : 'text-text-muted')}>
          {assignment.dueAt ? t('homework.due', { date: formatDateTime(assignment.dueAt, i18n.language) }) : t('hanzi.assignments.noDeadline')}
          {pastDue && assignment.allowLate && editable && ` · ${t('hanzi.work.lateAllowed')}`} · {t('hanzi.work.attemptsLeft', { count: left, max: assignment.maxAttempts })}
        </p>
        {assignment.instructions && <p className="mt-2 whitespace-pre-wrap text-sm">{assignment.instructions}</p>}
      </div>

      {!online && editable && <p className="rounded-lg border border-amber-500/40 bg-amber-100 px-3 py-2 text-sm text-amber-600 dark:bg-surface-raised dark:text-amber-500">{t('hanzi.work.offline')}</p>}
      {restoredLocal && editable && <p className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-muted">{t('hanzi.work.restored')}</p>}

      {sub && (sub.status === 'reviewed' || sub.status === 'needs_revision') && (
        <div className={'rounded-xl border p-4 ' + (sub.status === 'reviewed' ? 'border-teal-500/40' : 'border-coral-500/40')}>
          <p className="font-medium">
            {sub.status === 'reviewed' ? t('hanzi.work.reviewedTitle') : t('hanzi.work.revisionTitle')}
            {sub.teacherScore != null && (
              <span className="ml-2 text-lg font-semibold">
                {sub.teacherScore}/{assignment.maxScore}
              </span>
            )}
          </p>
          {sub.teacherFeedback && <p className="mt-1 whitespace-pre-wrap text-sm">{sub.teacherFeedback}</p>}
        </div>
      )}

      {showResults && sub.status !== 'reviewed' && sub.status !== 'needs_revision' && (
        <div className="rounded-xl border border-border p-4 text-sm">
          {sub.autoResult ? (
            <p>
              {t('hanzi.work.autoResult')}: <strong>{sub.autoResult.score}/{sub.autoResult.maxScore}</strong> ({sub.autoResult.correct}/{sub.autoResult.total}) — {t('hanzi.work.waitTeacher')}
            </p>
          ) : (
            <p className="text-text-muted">{t('hanzi.work.waitAuto')}</p>
          )}
          {canRetry(sub, assignment) && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={() => void handleRetry()}>
                {t('hanzi.work.retry')}
              </Button>
              <span className="text-xs text-text-muted">{t('hanzi.work.retryHelp', { count: left })}</span>
            </div>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState title={t('hanzi.work.noItems')} />
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((item, index) => (
            <li key={item.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <ItemPrompt item={item} index={index} />
                <div className="flex items-center gap-2">
                  <Badge tone="steel">{t(`hanzi.types.${item.type}`)}</Badge>
                  {showResults && verdictOf(item.id) && <VerdictBadge verdict={verdictOf(item.id)!} />}
                </div>
              </div>
              <div className="mt-3">
                {editable ? (
                  <ItemInput
                    item={item}
                    answer={answers[item.id]}
                    gridType={assignment.gridType}
                    allowHints={assignment.allowStrokeHints}
                    padSize={padSize}
                    freeMode={Boolean(freeMode[item.id])}
                    setFreeMode={(v) => setFreeMode((m) => ({ ...m, [item.id]: v }))}
                    onText={(text) => updateAnswer(item.id, { text })}
                    onFreehand={(freehand) => updateAnswer(item.id, { freehand })}
                    onWritingChar={(i, v) => updateWritingChar(item, i, v)}
                  />
                ) : (
                  <AnswerView item={item} answer={sub?.answers[item.id]} gridType={assignment.gridType} />
                )}
              </div>
              {sub?.itemComments?.[item.id] && (
                <p className="mt-3 rounded-md bg-surface-raised px-3 py-2 text-sm">
                  <span className="font-medium">{t('hanzi.work.teacherComment')}:</span> {sub.itemComments[item.id]}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      {editable && items.length > 0 && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3 sm:mx-0 sm:rounded-xl sm:border">
          <span className="text-sm text-text-muted">
            {t('hanzi.work.progress', { done: answeredCount, total: items.length })} · {t(`hanzi.work.save.${saveState}`)}
          </span>
          <Button onClick={() => setConfirmSubmit(true)} disabled={answeredCount === 0 || (left === 0 && sub?.status !== 'needs_revision')}>
            {t('hanzi.work.submit')}
          </Button>
        </div>
      )}

      {confirmSubmit && (
        <ConfirmDialog
          open
          title={t('hanzi.work.confirmTitle')}
          message={t('hanzi.work.confirmMessage', { done: answeredCount, total: items.length, left: Math.max(0, left - 1) })}
          confirmLabel={submitting ? t('loading') : t('hanzi.work.submit')}
          onCancel={() => setConfirmSubmit(false)}
          onConfirm={() => handleSubmit()}
        />
      )}
    </div>
  );
}

function ItemInput({
  item,
  answer,
  gridType,
  allowHints,
  padSize,
  freeMode,
  setFreeMode,
  onText,
  onFreehand,
  onWritingChar,
}: {
  item: WithId<HanziItem>;
  answer: HanziAnswer | undefined;
  gridType: HanziGridType;
  allowHints: boolean;
  padSize: number;
  freeMode: boolean;
  setFreeMode: (v: boolean) => void;
  onText: (text: string) => void;
  onFreehand: (path: string) => void;
  onWritingChar: (index: number, value: HanziWritingChar) => void;
}) {
  const { t } = useTranslation();
  const text = answer?.text ?? '';
  const inputClass =
    'h-11 w-full rounded-lg border border-border bg-surface-raised px-3 text-base text-text placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel-500';

  if (item.type === 'writing') {
    const chars = [...(item.target ?? '')];
    return (
      <div className="flex flex-col gap-3">
        {freeMode ? (
          <FreeDrawCanvas value={answer?.freehand ?? ''} onChange={onFreehand} gridType={gridType} size={padSize} />
        ) : (
          <div className="flex flex-wrap justify-center gap-4 sm:justify-start">
            {chars.map((ch, i) => (
              <WritingPad
                key={`${item.id}-${i}`}
                char={ch}
                gridType={gridType}
                size={padSize}
                allowHints={allowHints}
                value={answer?.writing?.[i]}
                onChange={(v) => onWritingChar(i, v)}
                onUnavailable={() => setFreeMode(true)}
              />
            ))}
          </div>
        )}
        <button type="button" onClick={() => setFreeMode(!freeMode)} className="self-start text-xs text-steel-500 hover:underline">
          {freeMode ? t('hanzi.writing.useChecker') : t('hanzi.writing.useFree')}
        </button>
        {freeMode && <p className="text-xs text-text-muted">{t('hanzi.writing.freeNote')}</p>}
      </div>
    );
  }

  if (item.type === 'dictation') {
    return <DictationInput item={item} text={text} onText={onText} inputClass={inputClass} />;
  }

  if (item.type === 'pinyin') {
    const preview = numberedToMarked(text);
    return (
      <div className="flex flex-col gap-1.5">
        <input className={inputClass} value={text} onChange={(e) => onText(e.target.value)} placeholder="nǐ hǎo / ni3 hao3" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label={t('hanzi.fields.pinyin')} />
        {preview !== text && <p className="text-sm text-text-muted">→ {preview}</p>}
      </div>
    );
  }

  if (item.type === 'translation') {
    return <input className={inputClass} value={text} onChange={(e) => onText(e.target.value)} placeholder={t('hanzi.work.translationPlaceholder')} aria-label={t('hanzi.fields.translation')} />;
  }

  // hanzi_input
  return (
    <div className="flex flex-col gap-1.5">
      <input lang="zh-CN" className={inputClass + ' font-kai text-2xl'} value={text} onChange={(e) => onText(e.target.value)} placeholder={'□'.repeat(Math.max(1, item.charCount))} aria-label={t('hanzi.fields.hanzi')} />
      <p className="text-xs text-text-muted">{t('hanzi.work.imeHint')}</p>
    </div>
  );
}

function DictationInput({ item, text, onText, inputClass }: { item: HanziItem; text: string; onText: (t: string) => void; inputClass: string }) {
  const { t } = useTranslation();
  const [voiceOk, setVoiceOk] = useState(() => chineseVoiceAvailable());
  useEffect(() => {
    // Voices load asynchronously on most browsers.
    if (!('speechSynthesis' in window)) return;
    const update = () => setVoiceOk(chineseVoiceAvailable());
    window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => item.target && speakChinese(item.target)}>
          🔊 {t('hanzi.work.listen')}
        </Button>
        <Button variant="secondary" onClick={() => item.target && speakChinese(item.target, 0.5)}>
          🐢 {t('hanzi.work.listenSlow')}
        </Button>
      </div>
      {!voiceOk && <p className="text-xs text-amber-500">{t('hanzi.work.noVoice')}</p>}
      <input lang="zh-CN" className={inputClass + ' font-kai text-2xl'} value={text} onChange={(e) => onText(e.target.value)} placeholder={'□'.repeat(Math.max(1, item.charCount))} aria-label={t('hanzi.fields.hanzi')} />
    </div>
  );
}

function AnswerView({ item, answer, gridType }: { item: HanziItem; answer: HanziAnswer | undefined; gridType: HanziGridType }) {
  const { t } = useTranslation();
  if (!answer || (!answer.text && !answer.freehand && !answer.writing.some((w) => w.strokes))) {
    return <p className="text-sm text-text-muted">{t('hanzi.review.noAnswer')}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {answer.text && (
        <p className={item.type === 'hanzi_input' || item.type === 'dictation' ? 'font-kai text-2xl' : 'text-base'}>{answer.text}</p>
      )}
      {(answer.writing.length > 0 || answer.freehand) && (
        <div className="flex flex-wrap gap-3">
          {answer.writing.map((w, i) => (
            <StrokesPreview key={i} strokes={w.strokes} wrongStrokes={w.wrongStrokes} box={1024} gridType={gridType} label={w.completed ? t('hanzi.writing.mistakes', { count: w.mistakes }) : t('hanzi.review.unfinished')} />
          ))}
          {answer.freehand && <StrokesPreview strokes={answer.freehand} box={1000} gridType={gridType} label={t('hanzi.review.freehand')} />}
        </div>
      )}
    </div>
  );
}
