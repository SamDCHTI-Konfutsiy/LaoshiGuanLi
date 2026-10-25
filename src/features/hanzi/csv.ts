import { buildCsv, parseCsv } from '@/utils/csv';
import type { HanziWordInput } from '@/features/hanzi/words-service';
import type { HanziWord, WithId } from '@/types/models';

export const WORD_CSV_HEADERS = ['hanzi', 'pinyin', 'translation', 'hsk', 'altPinyin', 'altTranslations', 'tags'];

const splitList = (v: string | undefined) => (v ?? '').split('|').map((s) => s.trim()).filter(Boolean);

export function wordsToCsv(words: WithId<HanziWord>[]): string {
  return buildCsv(
    WORD_CSV_HEADERS,
    words.map((w) => [w.hanzi, w.pinyin, w.translation, w.hsk ? String(w.hsk) : '', w.altPinyin.join('|'), w.altTranslations.join('|'), w.tags.join('|')]),
  );
}

export function wordsTemplateCsv(): string {
  return buildCsv(WORD_CSV_HEADERS, [
    ['你好', 'nǐ hǎo', 'salom', '1', 'ni3 hao3', 'assalomu alaykum', 'greeting'],
    ['学习', 'xué xí', "o'qimoq; o'rganmoq", '1', '', '', ''],
  ]);
}

export interface WordCsvResult {
  valid: HanziWordInput[];
  errors: string[];
}

/** Columns: hanzi, pinyin, translation (required); hsk, altPinyin, altTranslations, tags (optional, lists separated by "|"). */
export function parseWordsCsv(text: string): WordCsvResult {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (rows.length === 0) return { valid: [], errors: ['Empty file.'] };
  const [header, ...data] = rows;
  const col = (name: string) => header!.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const idx = Object.fromEntries(WORD_CSV_HEADERS.map((h) => [h, col(h)])) as Record<string, number>;
  if (idx.hanzi === -1 || idx.pinyin === -1 || idx.translation === -1) {
    return { valid: [], errors: ['Header row must include "hanzi", "pinyin" and "translation" columns.'] };
  }
  const valid: HanziWordInput[] = [];
  const errors: string[] = [];
  data.forEach((row, i) => {
    const get = (name: string) => (idx[name]! >= 0 ? (row[idx[name]!] ?? '').trim() : '');
    const hanzi = get('hanzi');
    const pinyin = get('pinyin');
    const translation = get('translation');
    if (!hanzi || !pinyin || !translation) {
      errors.push(`Row ${i + 2}: hanzi, pinyin and translation are required.`);
      return;
    }
    if ([...hanzi].length > 16) {
      errors.push(`Row ${i + 2}: "${hanzi}" is longer than 16 characters.`);
      return;
    }
    const hskRaw = get('hsk');
    const hsk = hskRaw ? Number(hskRaw.replace(/[^\d]/g, '')) : null;
    if (hskRaw && (!hsk || hsk < 1 || hsk > 9)) {
      errors.push(`Row ${i + 2}: HSK level must be 1–9.`);
      return;
    }
    valid.push({
      hanzi,
      pinyin,
      translation,
      hsk,
      altPinyin: splitList(get('altPinyin')),
      altTranslations: splitList(get('altTranslations')),
      tags: splitList(get('tags')),
    });
  });
  return { valid, errors };
}
