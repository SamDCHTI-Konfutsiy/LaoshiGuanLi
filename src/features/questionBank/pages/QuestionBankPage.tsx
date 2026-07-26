import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useCollection } from '@/hooks/useCollection';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { TextAreaField } from '@/components/ui/TextAreaField';
import { SelectField } from '@/components/ui/SelectField';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import {
  createBankQuestion,
  deleteBankQuestion,
  questionBankQuery,
  updateBankQuestion,
  type BankQuestionInput,
} from '@/features/questionBank/service';
import { parseQuestionsCsv, questionsToCsv, type CsvImportResult } from '@/features/questionBank/csv';
import { buildCsv, downloadCsv, readFileAsText } from '@/utils/csv';
import { QUESTION_CATEGORIES, QUESTION_DIFFICULTIES, QUESTION_TYPES } from '@/types/enums';
import type { BankQuestion, QuestionOption, WithId } from '@/types/models';

let optionCounter = 0;
function newOptionId(): string {
  optionCounter += 1;
  return `opt${Date.now()}${optionCounter}`;
}

export function QuestionBankPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  const qQuery = useMemo(() => (profile ? questionBankQuery(profile.uid) : null), [profile]);
  const { data: questions, loading } = useCollection(qQuery);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [editing, setEditing] = useState<WithId<BankQuestion> | 'new' | null>(null);
  const [deleting, setDeleting] = useState<WithId<BankQuestion> | null>(null);
  const [importPreview, setImportPreview] = useState<CsvImportResult | null>(null);
  const [importing, setImporting] = useState(false);

  const filtered = useMemo(
    () => questions.filter((q) => categoryFilter === 'all' || q.category === categoryFilter),
    [questions, categoryFilter],
  );

  async function handleSave(input: BankQuestionInput, reason: string) {
    if (!profile) return;
    try {
      if (editing === 'new') {
        await createBankQuestion(profile, input, reason);
        toast.show(t('quiz.bank.created'), 'success');
      } else if (editing) {
        await updateBankQuestion(profile, editing.id, editing, input, reason);
        toast.show(t('quiz.bank.updated'), 'success');
      }
      setEditing(null);
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    }
  }

  async function handleDelete(reason: string) {
    if (!profile || !deleting) return;
    try {
      await deleteBankQuestion(profile, deleting.id, deleting, reason);
      toast.show(t('quiz.bank.deleted'), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setDeleting(null);
    }
  }

  function handleExport() {
    downloadCsv('question-bank.csv', questionsToCsv(questions));
  }

  function handleDownloadTemplate() {
    const template = buildCsv(
      ['type', 'category', 'difficulty', 'prompt', 'options', 'correctOptions', 'correctText', 'referenceAnswer', 'points', 'tags'],
      [
        ['single_choice', 'grammar', 'easy', 'Which word completes the sentence?', 'go|goes|going', 'goes', '', '', '1', 'present-tense'],
        ['multiple_choice', 'vocabulary', 'medium', 'Which of these are fruits?', 'apple|carrot|banana|potato', 'apple|banana', '', '', '2', ''],
        ['true_false', 'reading', 'easy', 'The sun rises in the west.', 'True|False', 'False', '', '', '1', ''],
        ['fill_blank', 'grammar', 'medium', 'She ___ to school every day.', '', '', 'goes', '', '1', ''],
        ['short_answer', 'writing', 'hard', 'Describe your favorite holiday.', '', '', '', 'A short paragraph mentioning where and why.', '5', ''],
      ],
    );
    downloadCsv('question-bank-template.csv', template);
  }

  async function handleFilePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    const text = await readFileAsText(file);
    setImportPreview(parseQuestionsCsv(text));
  }

  async function handleConfirmImport() {
    if (!profile || !importPreview) return;
    setImporting(true);
    let ok = 0;
    for (const input of importPreview.valid) {
      try {
        await createBankQuestion(profile, input, t('quiz.bank.importedReason'));
        ok += 1;
      } catch {
        // continue with the rest; report the shortfall below
      }
    }
    setImporting(false);
    setImportPreview(null);
    toast.show(t('quiz.bank.importDone', { count: ok }), ok === importPreview.valid.length ? 'success' : 'error');
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold">{t('quiz.bank.title')}</h1>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-2">
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={(e) => void handleFilePicked(e)} className="hidden" />
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              {t('quiz.bank.importCsv')}
            </Button>
            <Button variant="secondary" onClick={handleExport} disabled={questions.length === 0}>
              {t('quiz.bank.exportCsv')}
            </Button>
            <Button onClick={() => setEditing('new')}>{t('quiz.bank.new')}</Button>
          </div>
          <button type="button" onClick={handleDownloadTemplate} className="text-xs text-steel-500 hover:underline">
            {t('quiz.bank.downloadTemplate')}
          </button>
        </div>
      </div>

      <div className="mb-4 mt-4 flex flex-wrap gap-2">
        {(['all', ...QUESTION_CATEGORIES] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategoryFilter(c)}
            aria-pressed={categoryFilter === c}
            className={
              'rounded-full border px-3 py-1 text-sm font-medium transition-colors ' +
              (categoryFilter === c
                ? 'border-steel-500 bg-steel-50 text-steel-600 dark:bg-surface-raised dark:text-steel-300'
                : 'border-border text-text-muted hover:text-text')
            }
          >
            {c === 'all' ? t('admin.users.allRoles') : t(`quiz.category.${c}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner label={t('loading')} />
      ) : filtered.length === 0 ? (
        <EmptyState title={t('quiz.bank.empty')} />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>{t('quiz.prompt')}</Th>
              <Th>{t('quiz.type')}</Th>
              <Th>{t('quiz.category.label')}</Th>
              <Th>{t('quiz.difficulty.label')}</Th>
              <Th>{t('quiz.points')}</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {filtered.map((q) => (
              <Tr key={q.id}>
                <Td className="max-w-sm truncate font-medium">{q.prompt}</Td>
                <Td>
                  <Badge tone="steel">{t(`quiz.questionType.${q.type}`)}</Badge>
                </Td>
                <Td>{t(`quiz.category.${q.category}`)}</Td>
                <Td>{t(`quiz.difficulty.${q.difficulty}`)}</Td>
                <Td>{q.points}</Td>
                <Td className="text-right">
                  <button
                    type="button"
                    onClick={() => setEditing(q)}
                    className="text-sm font-medium text-steel-500 hover:underline"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(q)}
                    className="ml-3 text-sm font-medium text-coral-500 hover:underline"
                  >
                    {t('common.delete')}
                  </button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {editing && (
        <QuestionFormModal initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSave={handleSave} />
      )}

      {deleting && (
        <ConfirmDialog
          open
          title={t('quiz.bank.deleteTitle')}
          message={t('quiz.bank.deleteMessage')}
          confirmLabel={t('common.delete')}
          destructive
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
        />
      )}

      {importPreview && (
        <Modal open onClose={() => setImportPreview(null)} title={t('quiz.bank.importPreviewTitle')}>
          <p className="text-sm text-text">
            {t('quiz.bank.importValidCount', { count: importPreview.valid.length })}
          </p>
          {importPreview.errors.length > 0 && (
            <div className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-surface p-3">
              <p className="text-sm font-medium text-coral-500">
                {t('quiz.bank.importErrorCount', { count: importPreview.errors.length })}
              </p>
              <ul className="mt-1 flex flex-col gap-0.5 text-xs text-text-muted">
                {importPreview.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setImportPreview(null)}>
              {t('common.cancel')}
            </Button>
            <Button loading={importing} disabled={importPreview.valid.length === 0} onClick={() => void handleConfirmImport()}>
              {t('quiz.bank.confirmImport', { count: importPreview.valid.length })}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function QuestionFormModal({
  initial,
  onClose,
  onSave,
}: {
  initial: WithId<BankQuestion> | null;
  onClose: () => void;
  onSave: (input: BankQuestionInput, reason: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState(initial?.type ?? 'single_choice');
  const [category, setCategory] = useState(initial?.category ?? 'grammar');
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? 'easy');
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');
  const [options, setOptions] = useState<QuestionOption[]>(
    initial?.options.length
      ? initial.options
      : type === 'true_false'
        ? [
            { id: 'true', text: t('quiz.true') },
            { id: 'false', text: t('quiz.false') },
          ]
        : [],
  );
  const [correctOptionIds, setCorrectOptionIds] = useState<string[]>(initial?.correctOptionIds ?? []);
  const [correctText, setCorrectText] = useState(initial?.correctText ?? '');
  const [referenceAnswer, setReferenceAnswer] = useState(initial?.referenceAnswer ?? '');
  const [points, setPoints] = useState(initial?.points ?? 1);
  const [tagsInput, setTagsInput] = useState(initial?.tags.join(', ') ?? '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  function handleTypeChange(next: typeof type) {
    setType(next);
    setCorrectOptionIds([]);
    if (next === 'true_false') {
      setOptions([
        { id: 'true', text: t('quiz.true') },
        { id: 'false', text: t('quiz.false') },
      ]);
    } else if (next === 'single_choice' || next === 'multiple_choice') {
      setOptions((prev) => (prev.some((o) => o.id.startsWith('opt')) ? prev : []));
    } else {
      setOptions([]);
    }
  }

  function addOption() {
    setOptions((prev) => [...prev, { id: newOptionId(), text: '' }]);
  }

  function updateOptionText(id: string, text: string) {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, text } : o)));
  }

  function removeOption(id: string) {
    setOptions((prev) => prev.filter((o) => o.id !== id));
    setCorrectOptionIds((prev) => prev.filter((oid) => oid !== id));
  }

  function toggleCorrect(id: string) {
    if (type === 'multiple_choice') {
      setCorrectOptionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    } else {
      setCorrectOptionIds([id]);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(
        {
          type,
          category,
          difficulty,
          prompt,
          options,
          correctOptionIds,
          correctText,
          referenceAnswer,
          points,
          tags: tagsInput
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        },
        reason,
      );
    } finally {
      setSaving(false);
    }
  }

  const isChoiceType = type === 'single_choice' || type === 'multiple_choice' || type === 'true_false';

  return (
    <Modal open onClose={onClose} title={initial ? t('quiz.bank.editTitle') : t('quiz.bank.newTitle')}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <SelectField
          label={t('quiz.type')}
          value={type}
          onChange={(e) => handleTypeChange(e.target.value as typeof type)}
        >
          {QUESTION_TYPES.map((qt) => (
            <option key={qt} value={qt}>
              {t(`quiz.questionType.${qt}`)}
            </option>
          ))}
        </SelectField>
        <TextAreaField label={t('quiz.prompt')} required value={prompt} onChange={(e) => setPrompt(e.target.value)} />

        {isChoiceType && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text">{t('quiz.options')}</span>
            {options.map((opt) => (
              <div key={opt.id} className="flex items-center gap-2">
                <input
                  type={type === 'multiple_choice' ? 'checkbox' : 'radio'}
                  name="correct"
                  checked={correctOptionIds.includes(opt.id)}
                  onChange={() => toggleCorrect(opt.id)}
                  className="h-4 w-4"
                  aria-label={t('quiz.markCorrect')}
                />
                <input
                  type="text"
                  value={opt.text}
                  disabled={type === 'true_false'}
                  onChange={(e) => updateOptionText(opt.id, e.target.value)}
                  placeholder={t('quiz.optionText')}
                  className="h-9 flex-1 rounded-lg border border-border bg-surface-raised px-3 text-sm disabled:opacity-70"
                />
                {type !== 'true_false' && (
                  <button
                    type="button"
                    onClick={() => removeOption(opt.id)}
                    className="text-sm text-coral-500 hover:underline"
                  >
                    {t('common.remove')}
                  </button>
                )}
              </div>
            ))}
            {type !== 'true_false' && (
              <Button type="button" variant="secondary" onClick={addOption}>
                {t('quiz.addOption')}
              </Button>
            )}
            <p className="text-xs text-text-muted">{t('quiz.markCorrectHint')}</p>
          </div>
        )}

        {type === 'fill_blank' && (
          <TextField
            label={t('quiz.correctText')}
            required
            value={correctText}
            onChange={(e) => setCorrectText(e.target.value)}
          />
        )}

        {type === 'short_answer' && (
          <TextAreaField
            label={t('quiz.referenceAnswer')}
            value={referenceAnswer}
            onChange={(e) => setReferenceAnswer(e.target.value)}
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <SelectField label={t('quiz.category.label')} value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
            {QUESTION_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`quiz.category.${c}`)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('quiz.difficulty.label')}
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
          >
            {QUESTION_DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {t(`quiz.difficulty.${d}`)}
              </option>
            ))}
          </SelectField>
        </div>
        <TextField label={t('quiz.points')} type="number" min={1} required value={points} onChange={(e) => setPoints(Number(e.target.value))} />
        <TextField label={t('quiz.tags')} value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder={t('quiz.tagsPlaceholder')} />
        <TextAreaField label={t('common.reasonOptional')} value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={saving}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
