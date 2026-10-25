import { doc, query, serverTimestamp, Timestamp, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/firebase/db';
import { collectionRef } from '@/services/repository';
import type { HanziWord, UserProfile } from '@/types/models';

export const hanziWordsCol = collectionRef<HanziWord>('hanziWords');

/** The whole shared vocabulary base — small enough (a few thousand words at most) to filter client-side by HSK/search. */
export function hanziWordsQuery() {
  return query(hanziWordsCol);
}

export interface HanziWordInput {
  hanzi: string;
  pinyin: string;
  translation: string;
  altPinyin: string[];
  altTranslations: string[];
  hsk: number | null;
  tags: string[];
}

function clean(input: HanziWordInput): HanziWordInput {
  const list = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
  return {
    hanzi: input.hanzi.trim(),
    pinyin: input.pinyin.trim(),
    translation: input.translation.trim(),
    altPinyin: list(input.altPinyin),
    altTranslations: list(input.altTranslations),
    hsk: input.hsk && input.hsk >= 1 && input.hsk <= 9 ? Math.round(input.hsk) : null,
    tags: list(input.tags),
  };
}

/** Routine content edit, like question-bank items — intentionally not audit-logged. */
export async function createHanziWord(actor: UserProfile, input: HanziWordInput): Promise<void> {
  const ref = doc(hanziWordsCol);
  const batch = writeBatch(db);
  batch.set(ref, {
    ...clean(input),
    ownerId: actor.uid,
    ownerName: actor.name,
    createdAt: serverTimestamp() as unknown as Timestamp,
  });
  await batch.commit();
}

/** Bulk create (CSV import / starter list) — chunked under Firestore's 500-writes-per-batch cap. */
export async function createHanziWords(actor: UserProfile, inputs: HanziWordInput[]): Promise<number> {
  let written = 0;
  for (let i = 0; i < inputs.length; i += 400) {
    const batch = writeBatch(db);
    for (const input of inputs.slice(i, i + 400)) {
      batch.set(doc(hanziWordsCol), {
        ...clean(input),
        ownerId: actor.uid,
        ownerName: actor.name,
        createdAt: serverTimestamp() as unknown as Timestamp,
      });
    }
    await batch.commit();
    written += Math.min(400, inputs.length - i);
  }
  return written;
}

export async function updateHanziWord(id: string, input: HanziWordInput): Promise<void> {
  await updateDoc(doc(hanziWordsCol, id), { ...clean(input) });
}

export async function deleteHanziWord(id: string): Promise<void> {
  await deleteDoc(doc(hanziWordsCol, id));
}

/** Key used to skip duplicates on import: same characters + same pinyin letters. */
export function wordDedupKey(w: { hanzi: string; pinyin: string }): string {
  return `${w.hanzi.trim()}|${w.pinyin.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}`;
}
