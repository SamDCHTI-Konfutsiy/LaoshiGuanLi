import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useCollection } from '@/hooks/useCollection';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { SelectField } from '@/components/ui/SelectField';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { StrokeOrderAnimation } from '@/features/hanzi/components/WritingPad';
import {
  createHanziWord,
  createHanziWords,
  deleteHanziWord,
  hanziWordsQuery,
  updateHanziWord,
  wordDedupKey,
  type HanziWordInput,
} from '@/features/hanzi/words-service';
import { parseWordsCsv, wordsTemplateCsv, wordsToCsv, type WordCsvResult } from '@/features/hanzi/csv';
import { HSK1_STARTER_WORDS } from '@/features/hanzi/starterWords';
import { isHanzi, numberedToMarked } from '@/features/hanzi/lib/pinyin';
import { downloadCsv, readFileAsText } from '@/utils/csv';
import type { HanziWord, WithId } from '@/types/models';

export const HSK_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export function matchesWordSearch(w: HanziWord, search: string): boolean {
  const s = search.trim().toLowerCase();
  if (!s) return true;
  const plainPinyin = w.pinyin.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  return (
    w.hanzi.includes(s) ||
    w.pinyin.toLowerCase().includes(s) ||
    plainPinyin.includes(s.replace(/[^a-z]/g, '') || '\u0000') ||
    w.translation.toLowerCase().includes(s) ||
    w.tags.some((tag) => tag.toLowerCase().includes(s))
  );
}

export function HskFilter({ value, onChange }: { value: number | 'all'; onChange: (v: number | 'all') => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('hanzi.words.hskFilter')}>
      {(['all', ...HSK_LEVELS] as const).map((lvl) => (
        <button
          key={lvl}
          type="button"
          aria-pressed={value === lvl}
          onClick={() => onChange(lvl)}
          className={
            'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ' +
            (value === lvl
              ? 'border-steel-500 bg-steel-50 text-steel-600 dark:bg-surface-raised dark:text-steel-300'
              : 'border-border text-text-muted hover:text-text')
          }
        >
          {lvl === 'all' ? t('hanzi.words.allLevels') : `HSK ${lvl}`}
        </button>
      ))}
    </div>
  );
}

export function WordsTab() {
  const { profile } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  const q = useMemo(() => hanziWordsQuery(), []);
  const { data: words, loading, error } = useCollection(q);
  const fileRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [hsk, setHsk] = useState<number | 'all'>('all');
  const [mineOnly, setMineOnly] = useState(false);
  const [editing, setEditing] = useState<WithId<HanziWord> | 'new' | null>(null);
  const [deleting, setDeleting] = useState<WithId<HanziWord> | null>(null);
  const [preview, setPreview] = useState<WithId<HanziWord> | null>(null);
  const [importPreview, setImportPreview] = useState<WordCsvResult | null>(null);
  const [busy, setBusy] = useState(false);

  const existingKeys = useMemo(() => new Set(words.map(wordDedupKey)), [words]);

  const filtered = useMemo(
    () =>
      words
        .filter((w) => (hsk === 'all' ? true : w.hsk === hsk))
        .filter((w) => (mineOnly && profile ? w.ownerId === profile.uid : true))
        .filter((w) => matchesWordSearch(w, search))
        .sort((a, b) => (a.hsk ?? 99) - (b.hsk ?? 99) || a.pinyin.localeCompare(b.pinyin)),
    [words, hsk, mineOnly, profile, search],
  );

  if (!profile) return null;
  const canEdit = (w: HanziWord) => profile.role === 'admin' || w.ownerId === profile.uid;

  async function handleSave(input: HanziWordInput) {
    if (!profile) return;
    try {
      if (editing === 'new') {
        await createHanziWord(profile, input);
        toast.show(t('hanzi.words.created'), 'success');
      } else if (editing) {
        await updateHanziWord(editing.id, input);
        toast.show(t('hanzi.words.updated'), 'success');
      }
      setEditing(null);
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    try {
      await deleteHanziWord(deleting.id);
      toast.show(t('hanzi.words.deleted'), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setDeleting(null);
    }
  }

  async function addMany(inputs: HanziWordInput[]) {
    if (!profile) return;
    const fresh = inputs.filter((w) => !existingKeys.has(wordDedupKey(w)));
    if (fresh.length === 0) {
      toast.show(t('hanzi.words.nothingNew'), 'info');
      return;
    }
    setBusy(true);
    try {
      const n = await createHanziWords(profile, fresh);
      toast.show(t('hanzi.words.imported', { count: n }), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportPreview(parseWordsCsv(await readFileAsText(file)));
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-text-muted">{t('hanzi.words.intro')}</p>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void handleFile(e)} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            {t('quiz.bank.importCsv')}
          </Button>
          <Button variant="secondary" disabled={words.length === 0} onClick={() => downloadCsv('hanzi-words.csv', wordsToCsv(filtered))}>
            {t('quiz.bank.exportCsv')}
          </Button>
          <Button variant="secondary" loading={busy} onClick={() => void addMany(HSK1_STARTER_WORDS)}>
            {t('hanzi.words.addStarter')}
          </Button>
          <Button onClick={() => setEditing('new')}>{t('hanzi.words.new')}</Button>
        </div>
      </div>
      <button type="button" onClick={() => downloadCsv('hanzi-words-template.csv', wordsTemplateCsv())} className="mt-1 text-xs text-steel-500 hover:underline">
        {t('quiz.bank.downloadTemplate')}
      </button>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-72">
          <TextField label={t('nav.search')} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('hanzi.words.searchPlaceholder')} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
          {t('hanzi.words.mineOnly')}
        </label>
      </div>
      <div className="mt-3">
        <HskFilter value={hsk} onChange={setHsk} />
      </div>

      <div className="mt-4">
        {loading ? (
          <Spinner label={t('loading')} />
        ) : error ? (
          <EmptyState title={t('hanzi.common.loadError')} />
        ) : filtered.length === 0 ? (
          <EmptyState title={t('hanzi.words.empty')} />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>{t('hanzi.fields.hanzi')}</Th>
                <Th>{t('hanzi.fields.pinyin')}</Th>
                <Th>{t('hanzi.fields.translation')}</Th>
                <Th>HSK</Th>
                <Th className="hidden md:table-cell">{t('hanzi.words.owner')}</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {filtered.map((w) => (
                <Tr key={w.id}>
                  <Td className="font-kai text-2xl">{w.hanzi}</Td>
                  <Td>{w.pinyin}</Td>
                  <Td className="max-w-xs">
                    {w.translation}
                    {w.altTranslations.length > 0 && <span className="text-text-muted"> · {w.altTranslations.join(', ')}</span>}
                  </Td>
                  <Td>{w.hsk ? <Badge tone="steel">HSK {w.hsk}</Badge> : '—'}</Td>
                  <Td className="hidden text-text-muted md:table-cell">{w.ownerName}</Td>
                  <Td className="whitespace-nowrap text-right">
                    <button type="button" onClick={() => setPreview(w)} className="text-sm font-medium text-steel-500 hover:underline">
                      {t('hanzi.words.strokeOrder')}
                    </button>
                    {canEdit(w) && (
                      <>
                        <button type="button" onClick={() => setEditing(w)} className="ml-3 text-sm font-medium text-steel-500 hover:underline">
                          {t('common.edit')}
                        </button>
                        <button type="button" onClick={() => setDeleting(w)} className="ml-3 text-sm font-medium text-coral-500 hover:underline">
                          {t('common.delete')}
                        </button>
                      </>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
        {!loading && <p className="mt-2 text-xs text-text-muted">{t('hanzi.words.count', { count: filtered.length, total: words.length })}</p>}
      </div>

      {editing && <WordFormModal initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSave={handleSave} />}

      {deleting && (
        <ConfirmDialog
          open
          title={t('hanzi.words.deleteTitle')}
          message={t('hanzi.words.deleteMessage', { hanzi: deleting.hanzi })}
          confirmLabel={t('common.delete')}
          destructive
          onCancel={() => setDeleting(null)}
          onConfirm={() => handleDelete()}
        />
      )}

      {preview && (
        <Modal open onClose={() => setPreview(null)} title={`${preview.hanzi} · ${preview.pinyin}`}>
          <div className="flex flex-wrap justify-center gap-3">
            {[...preview.hanzi.replace(/\s/g, '')].map((ch, i) => (
              <StrokeOrderAnimation key={`${ch}${i}`} char={ch} size={140} />
            ))}
          </div>
          <p className="mt-3 text-center text-sm text-text-muted">{preview.translation}</p>
        </Modal>
      )}

      {importPreview && (
        <Modal open onClose={() => setImportPreview(null)} title={t('quiz.bank.importPreviewTitle')}>
          <p className="text-sm">{t('hanzi.words.importValid', { count: importPreview.valid.length, dup: importPreview.valid.filter((w) => existingKeys.has(wordDedupKey(w))).length })}</p>
          {importPreview.errors.length > 0 && (
            <ul className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-surface p-3 text-xs text-coral-500">
              {importPreview.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setImportPreview(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={busy}
              disabled={importPreview.valid.length === 0}
              onClick={() => {
                const valid = importPreview.valid;
                setImportPreview(null);
                void addMany(valid);
              }}
            >
              {t('quiz.bank.confirmImport', { count: importPreview.valid.length })}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

const listToText = (xs: string[]) => xs.join('; ');
const textToList = (s: string) => s.split(/[;|]/).map((x) => x.trim()).filter(Boolean);

export function WordFormModal({
  initial,
  onClose,
  onSave,
  defaultHsk = null,
}: {
  initial: HanziWord | null;
  onClose: () => void;
  onSave: (input: HanziWordInput) => Promise<void>;
  defaultHsk?: number | null;
}) {
  const { t } = useTranslation();
  const [hanzi, setHanzi] = useState(initial?.hanzi ?? '');
  const [pinyin, setPinyin] = useState(initial?.pinyin ?? '');
  const [translation, setTranslation] = useState(initial?.translation ?? '');
  const [hsk, setHsk] = useState<string>(initial?.hsk ? String(initial.hsk) : defaultHsk ? String(defaultHsk) : '');
  const [altPinyin, setAltPinyin] = useState(listToText(initial?.altPinyin ?? []));
  const [altTranslations, setAltTranslations] = useState(listToText(initial?.altTranslations ?? []));
  const [tags, setTags] = useState(listToText(initial?.tags ?? []));
  const [saving, setSaving] = useState(false);

  const hanziError = hanzi && !isHanzi(hanzi) ? t('hanzi.words.onlyHanzi') : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (hanziError) return;
    setSaving(true);
    try {
      await onSave({
        hanzi: hanzi.replace(/\s/g, ''),
        pinyin: numberedToMarked(pinyin),
        translation,
        hsk: hsk ? Number(hsk) : null,
        altPinyin: textToList(altPinyin),
        altTranslations: textToList(altTranslations),
        tags: textToList(tags),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={initial ? t('hanzi.words.edit') : t('hanzi.words.new')}>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
        <TextField label={t('hanzi.fields.hanzi')} required value={hanzi} onChange={(e) => setHanzi(e.target.value)} lang="zh" className="font-kai text-xl" {...(hanziError ? { error: hanziError } : {})} />
        <TextField
          label={t('hanzi.fields.pinyin')}
          required
          value={pinyin}
          onChange={(e) => setPinyin(e.target.value)}
          onBlur={() => setPinyin((p) => numberedToMarked(p))}
          placeholder="nǐ hǎo / ni3 hao3"
        />
        <TextField label={t('hanzi.fields.translation')} required value={translation} onChange={(e) => setTranslation(e.target.value)} placeholder={t('hanzi.words.translationPlaceholder')} />
        <SelectField label="HSK" value={hsk} onChange={(e) => setHsk(e.target.value)}>
          <option value="">—</option>
          {HSK_LEVELS.map((l) => (
            <option key={l} value={l}>
              HSK {l}
            </option>
          ))}
        </SelectField>
        <TextField label={t('hanzi.fields.altTranslations')} value={altTranslations} onChange={(e) => setAltTranslations(e.target.value)} placeholder="salom; assalomu alaykum" />
        <TextField label={t('hanzi.fields.altPinyin')} value={altPinyin} onChange={(e) => setAltPinyin(e.target.value)} />
        <TextField label={t('hanzi.fields.tags')} value={tags} onChange={(e) => setTags(e.target.value)} />
        <p className="text-xs text-text-muted">{t('hanzi.words.separatorHint')}</p>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={saving} disabled={Boolean(hanziError)}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
