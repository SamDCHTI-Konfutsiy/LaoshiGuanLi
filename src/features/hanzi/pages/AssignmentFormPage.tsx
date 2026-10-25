import { useEffect, useMemo, useState, type FormEvent } from 'react';
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
import { SelectField } from '@/components/ui/SelectField';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { HanziGrid } from '@/features/hanzi/components/HanziGrid';
import { HskFilter, matchesWordSearch, WordFormModal } from '@/features/hanzi/pages/WordsTab';
import { useGroups, useManagedCourses, useStudents } from '@/features/hanzi/hooks';
import { createHanziWord, hanziWordsQuery, type HanziWordInput } from '@/features/hanzi/words-service';
import {
  createHanziAssignment,
  groupMemberIds,
  hanziAssignmentsCol,
  MAX_WORDS_PER_ASSIGNMENT,
  updateDraftHanziAssignment,
  updatePublishedHanziAssignment,
  type HanziAssignmentInput,
} from '@/features/hanzi/assignments-service';
import { toDateTimeInputValue } from '@/utils/date';
import { HANZI_EXERCISE_TYPES, HANZI_GRID_TYPES, type HanziExerciseType, type HanziGridType } from '@/types/enums';
import type { HanziWord, WithId } from '@/types/models';

function defaultInput(): HanziAssignmentInput {
  return {
    title: '',
    instructions: '',
    groupIds: [],
    studentIds: [],
    exerciseTypes: ['writing', 'pinyin', 'translation'],
    dueAt: '',
    allowLate: false,
    maxScore: 10,
    maxAttempts: 2,
    gridType: 'mi',
    allowStrokeHints: true,
    pinyinRequireTones: true,
    writingMistakeTolerance: 3,
  };
}

export function AssignmentFormPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const { profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const base = `/${profile?.role ?? 'teacher'}/hanzi`;

  const aRef = useMemo(() => (assignmentId ? doc(hanziAssignmentsCol, assignmentId) : null), [assignmentId]);
  const { data: existing, loading: existingLoading } = useDoc(aRef);
  const { data: courses, loading: coursesLoading } = useManagedCourses(profile);
  const { data: groups } = useGroups();
  const { byId: studentsById } = useStudents();
  const wq = useMemo(() => hanziWordsQuery(), []);
  const { data: words, loading: wordsLoading } = useCollection(wq);

  const [courseId, setCourseId] = useState('');
  const [input, setInput] = useState<HanziAssignmentInput>(defaultInput);
  const [selectedWordIds, setSelectedWordIds] = useState<string[]>([]);
  const [pickStudents, setPickStudents] = useState(false);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [hsk, setHsk] = useState<number | 'all'>('all');
  const [quickAdd, setQuickAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initialised, setInitialised] = useState(false);

  const isEdit = Boolean(assignmentId);
  const locked = Boolean(existing && existing.status !== 'draft'); // published: exercise set frozen

  // Load an existing assignment into the form once.
  useEffect(() => {
    if (initialised) return;
    if (isEdit && !existing) return;
    if (existing) {
      setCourseId(existing.courseId);
      setInput({
        title: existing.title,
        instructions: existing.instructions,
        groupIds: existing.groupIds,
        studentIds: existing.studentIds,
        exerciseTypes: existing.exerciseTypes,
        dueAt: existing.dueAt ? toDateTimeInputValue(existing.dueAt) : '',
        allowLate: existing.allowLate,
        maxScore: existing.maxScore,
        maxAttempts: existing.maxAttempts,
        gridType: existing.gridType,
        allowStrokeHints: existing.allowStrokeHints,
        pinyinRequireTones: existing.pinyinRequireTones,
        writingMistakeTolerance: existing.writingMistakeTolerance,
      });
      setSelectedWordIds(existing.wordIds);
      setPickStudents(existing.studentIds.length > 0);
    }
    setInitialised(true);
  }, [existing, isEdit, initialised]);

  // Default to the first course for a new assignment.
  useEffect(() => {
    if (!isEdit && !courseId && courses.length > 0) setCourseId(courses[0]!.id);
  }, [courses, courseId, isEdit]);

  const course = courses.find((c) => c.id === courseId) ?? null;
  const courseGroups = useMemo(() => groups.filter((g) => course?.groupIds.includes(g.id)), [groups, course]);

  // Members of the chosen groups, for optional individual picking.
  useEffect(() => {
    let cancelled = false;
    if (input.groupIds.length === 0) {
      setMemberIds([]);
      return;
    }
    void Promise.all(input.groupIds.map(groupMemberIds)).then((lists) => {
      if (!cancelled) setMemberIds([...new Set(lists.flat())]);
    });
    return () => {
      cancelled = true;
    };
  }, [input.groupIds.join(',')]);

  const wordsById = useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);
  const selectedWords = selectedWordIds.map((id) => wordsById.get(id)).filter((w): w is WithId<HanziWord> => Boolean(w));
  const missingWords = selectedWordIds.length - selectedWords.length;
  const candidates = useMemo(
    () =>
      words
        .filter((w) => !selectedWordIds.includes(w.id))
        .filter((w) => (hsk === 'all' ? true : w.hsk === hsk))
        .filter((w) => matchesWordSearch(w, search))
        .sort((a, b) => (a.hsk ?? 99) - (b.hsk ?? 99) || a.pinyin.localeCompare(b.pinyin))
        .slice(0, 80),
    [words, selectedWordIds, hsk, search],
  );

  const set = <K extends keyof HanziAssignmentInput>(key: K, value: HanziAssignmentInput[K]) => setInput((s) => ({ ...s, [key]: value }));

  function toggleType(type: HanziExerciseType) {
    set('exerciseTypes', input.exerciseTypes.includes(type) ? input.exerciseTypes.filter((x) => x !== type) : [...input.exerciseTypes, type]);
  }
  function toggleGroup(id: string) {
    set('groupIds', input.groupIds.includes(id) ? input.groupIds.filter((x) => x !== id) : [...input.groupIds, id]);
  }
  function toggleStudent(id: string) {
    set('studentIds', input.studentIds.includes(id) ? input.studentIds.filter((x) => x !== id) : [...input.studentIds, id]);
  }
  function addWord(id: string) {
    if (selectedWordIds.length >= MAX_WORDS_PER_ASSIGNMENT) {
      toast.show(t('hanzi.builder.tooManyWords', { max: MAX_WORDS_PER_ASSIGNMENT }), 'error');
      return;
    }
    setSelectedWordIds((s) => [...s, id]);
  }
  function moveWord(index: number, dir: -1 | 1) {
    setSelectedWordIds((s) => {
      const next = [...s];
      const j = index + dir;
      if (j < 0 || j >= next.length) return s;
      [next[index], next[j]] = [next[j]!, next[index]!];
      return next;
    });
  }

  async function handleQuickAdd(word: HanziWordInput) {
    if (!profile) return;
    try {
      await createHanziWord(profile, word);
      toast.show(t('hanzi.words.created'), 'success');
      setQuickAdd(false);
      setSearch(word.hanzi);
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    }
  }

  const itemCount = selectedWords.length * input.exerciseTypes.length;
  const studentList = pickStudents ? input.studentIds : [];
  const canSave =
    input.title.trim() !== '' &&
    Boolean(course) &&
    input.groupIds.length > 0 &&
    (!pickStudents || input.studentIds.length > 0) &&
    (locked || (selectedWords.length > 0 && input.exerciseTypes.length > 0));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!profile || !course || !canSave) return;
    setSaving(true);
    const finalInput: HanziAssignmentInput = { ...input, studentIds: studentList };
    try {
      if (existing && locked) {
        await updatePublishedHanziAssignment(profile, existing, finalInput);
        navigate(`${base}/assignments/${existing.id}`);
      } else if (existing) {
        await updateDraftHanziAssignment(profile, existing, finalInput, selectedWords);
        navigate(`${base}/assignments/${existing.id}`);
      } else {
        const id = await createHanziAssignment(profile, course, finalInput, selectedWords);
        navigate(`${base}/assignments/${id}`);
      }
      toast.show(t('hanzi.builder.saved'), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return null;
  if ((isEdit && existingLoading) || coursesLoading) return <Spinner label={t('loading')} />;
  if (isEdit && !existing) return <EmptyState title={t('hanzi.common.notFound')} />;
  if (courses.length === 0) return <div className="p-4 sm:p-6"><EmptyState title={t('hanzi.builder.noCourses')} /></div>;

  const checkbox = 'h-4 w-4 accent-steel-500';

  return (
    <>
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to={base} className="text-sm text-steel-500 hover:underline">
            ← {t('hanzi.title')}
          </Link>
          <h1 className="mt-1 font-display text-xl font-semibold">{isEdit ? t('hanzi.builder.editTitle') : t('hanzi.builder.newTitle')}</h1>
        </div>
        <Button type="submit" loading={saving} disabled={!canSave}>
          {isEdit ? t('common.save') : t('hanzi.builder.saveDraft')}
        </Button>
      </div>

      {locked && <p className="rounded-lg border border-amber-500/40 bg-amber-100 px-3 py-2 text-sm text-amber-600 dark:bg-surface-raised dark:text-amber-500">{t('hanzi.builder.lockedNote')}</p>}

      {/* 1 — Basics */}
      <section className="grid gap-4 rounded-xl border border-border p-4 md:grid-cols-2">
        <h2 className="font-display font-semibold md:col-span-2">1. {t('hanzi.builder.basics')}</h2>
        <SelectField label={t('hanzi.builder.course')} value={courseId} disabled={isEdit} onChange={(e) => { setCourseId(e.target.value); set('groupIds', []); set('studentIds', []); }}>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </SelectField>
        <TextField label={t('hanzi.builder.titleField')} required value={input.title} onChange={(e) => set('title', e.target.value)} placeholder={t('hanzi.builder.titlePlaceholder')} />
        <div className="md:col-span-2">
          <TextAreaField label={t('hanzi.builder.instructions')} value={input.instructions} onChange={(e) => set('instructions', e.target.value)} rows={2} />
        </div>
      </section>

      {/* 2 — Who */}
      <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <h2 className="font-display font-semibold">2. {t('hanzi.builder.audience')}</h2>
        {courseGroups.length === 0 ? (
          <p className="text-sm text-text-muted">{t('hanzi.builder.noGroups')}</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {courseGroups.map((g) => (
              <label key={g.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <input type="checkbox" className={checkbox} checked={input.groupIds.includes(g.id)} disabled={locked} onChange={() => toggleGroup(g.id)} />
                {g.name} <span className="text-text-muted">({g.memberCount})</span>
              </label>
            ))}
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className={checkbox} checked={pickStudents} disabled={locked || input.groupIds.length === 0} onChange={(e) => setPickStudents(e.target.checked)} />
          {t('hanzi.builder.pickStudents')}
        </label>
        {pickStudents && (
          <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-2 lg:grid-cols-3">
            {memberIds.length === 0 && <p className="text-sm text-text-muted">{t('hanzi.builder.noMembers')}</p>}
            {memberIds
              .map((id) => ({ id, name: studentsById.get(id)?.name ?? id }))
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((s) => (
                <label key={s.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-surface-raised">
                  <input type="checkbox" className={checkbox} checked={input.studentIds.includes(s.id)} disabled={locked} onChange={() => toggleStudent(s.id)} />
                  {s.name}
                </label>
              ))}
          </div>
        )}
      </section>

      {/* 3 — Words */}
      <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display font-semibold">
            3. {t('hanzi.builder.words')} <span className="text-sm font-normal text-text-muted">({selectedWords.length}/{MAX_WORDS_PER_ASSIGNMENT})</span>
          </h2>
          {!locked && (
            <Button variant="secondary" onClick={() => setQuickAdd(true)}>
              {t('hanzi.words.new')}
            </Button>
          )}
        </div>
        {missingWords > 0 && <p className="text-sm text-amber-500">{t('hanzi.builder.missingWords', { count: missingWords })}</p>}

        {selectedWords.length > 0 && (
          <ol className="flex flex-wrap gap-2">
            {selectedWords.map((w, i) => (
              <li key={w.id} className="flex items-center gap-2 rounded-lg border border-steel-500/40 bg-steel-50 px-2 py-1 dark:bg-surface-raised">
                <span className="font-kai text-lg">{w.hanzi}</span>
                <span className="text-xs text-text-muted">{w.pinyin}</span>
                {!locked && (
                  <span className="flex items-center">
                    <button type="button" aria-label="←" onClick={() => moveWord(i, -1)} className="px-1 text-xs text-text-muted hover:text-text">‹</button>
                    <button type="button" aria-label="→" onClick={() => moveWord(i, 1)} className="px-1 text-xs text-text-muted hover:text-text">›</button>
                    <button type="button" aria-label={t('common.remove')} onClick={() => setSelectedWordIds((s) => s.filter((x) => x !== w.id))} className="px-1 text-coral-500">×</button>
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}

        {!locked && (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="sm:w-72">
                <TextField label={t('nav.search')} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('hanzi.words.searchPlaceholder')} />
              </div>
              <HskFilter value={hsk} onChange={setHsk} />
            </div>
            {wordsLoading ? (
              <Spinner label={t('loading')} />
            ) : words.length === 0 ? (
              <EmptyState title={t('hanzi.builder.noWordsYet')} />
            ) : (
              <div className="grid max-h-72 gap-1 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-2 lg:grid-cols-3">
                {candidates.map((w) => (
                  <button key={w.id} type="button" onClick={() => addWord(w.id)} className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-raised">
                    <span className="font-kai text-lg">{w.hanzi}</span>
                    <span className="text-text-muted">{w.pinyin}</span>
                    <span className="truncate">{w.translation}</span>
                    {w.hsk && <Badge tone="steel">{w.hsk}</Badge>}
                  </button>
                ))}
                {candidates.length === 0 && <p className="text-sm text-text-muted">{t('hanzi.words.empty')}</p>}
              </div>
            )}
          </>
        )}
      </section>

      {/* 4 — Exercises & settings */}
      <section className="grid gap-4 rounded-xl border border-border p-4 md:grid-cols-2">
        <h2 className="font-display font-semibold md:col-span-2">4. {t('hanzi.builder.exercises')}</h2>
        <div className="flex flex-col gap-2 md:col-span-2">
          {HANZI_EXERCISE_TYPES.map((type) => (
            <label key={type} className="flex items-start gap-2 text-sm">
              <input type="checkbox" className={checkbox + ' mt-0.5'} checked={input.exerciseTypes.includes(type)} disabled={locked} onChange={() => toggleType(type)} />
              <span>
                <span className="font-medium">{t(`hanzi.types.${type}`)}</span>
                <span className="block text-text-muted">{t(`hanzi.typeHelp.${type}`)}</span>
              </span>
            </label>
          ))}
          <p className="text-sm text-text-muted">{t('hanzi.builder.itemCount', { count: itemCount })}</p>
        </div>

        <TextField label={t('hanzi.builder.dueAt')} type="datetime-local" value={input.dueAt} onChange={(e) => set('dueAt', e.target.value)} />
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" className={checkbox} checked={input.allowLate} onChange={(e) => set('allowLate', e.target.checked)} />
          {t('homework.allowLate')}
        </label>
        <TextField label={t('hanzi.builder.maxScore')} type="number" min={1} max={1000} value={input.maxScore} onChange={(e) => set('maxScore', Number(e.target.value))} />
        <TextField label={t('hanzi.builder.maxAttempts')} type="number" min={1} max={20} value={input.maxAttempts} onChange={(e) => set('maxAttempts', Number(e.target.value))} />

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t('hanzi.builder.grid')}</span>
          <div className="flex gap-3">
            {HANZI_GRID_TYPES.map((g: HanziGridType) => (
              <label key={g} className={'flex cursor-pointer flex-col items-center gap-1 rounded-lg border p-2 text-xs ' + (input.gridType === g ? 'border-steel-500' : 'border-border')}>
                <input type="radio" name="grid" className="sr-only" checked={input.gridType === g} disabled={locked} onChange={() => set('gridType', g)} />
                <span className="relative block h-12 w-12 bg-surface-raised"><HanziGrid type={g} /></span>
                {t(`hanzi.grid.${g}`)}
              </label>
            ))}
          </div>
        </div>
        <TextField
          label={t('hanzi.builder.tolerance')}
          type="number"
          min={0}
          max={20}
          value={input.writingMistakeTolerance}
          disabled={locked}
          onChange={(e) => set('writingMistakeTolerance', Number(e.target.value))}
        />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className={checkbox + ' mt-0.5'} checked={input.allowStrokeHints} onChange={(e) => set('allowStrokeHints', e.target.checked)} />
          <span>
            {t('hanzi.builder.allowHints')}
            <span className="block text-text-muted">{t('hanzi.builder.allowHintsHelp')}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className={checkbox + ' mt-0.5'} checked={input.pinyinRequireTones} disabled={locked} onChange={(e) => set('pinyinRequireTones', e.target.checked)} />
          <span>
            {t('hanzi.builder.requireTones')}
            <span className="block text-text-muted">{t('hanzi.builder.requireTonesHelp')}</span>
          </span>
        </label>
      </section>

      <div className="flex justify-end">
        <Button type="submit" loading={saving} disabled={!canSave}>
          {isEdit ? t('common.save') : t('hanzi.builder.saveDraft')}
        </Button>
      </div>
    </form>
    {/* Outside the <form>: the modal has its own form, and React would bubble its submit into this one. */}
    {quickAdd && <WordFormModal initial={null} defaultHsk={hsk === 'all' ? null : hsk} onClose={() => setQuickAdd(false)} onSave={handleQuickAdd} />}
    </>
  );
}
