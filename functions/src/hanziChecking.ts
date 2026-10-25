// AUTO-COPIED from src/features/hanzi/checking.ts — keep the two files identical.
/**
 * Automatic answer checking for the Hanzi practice module.
 *
 * DEPENDENCY-FREE ON PURPOSE: this exact file is also copied to
 * functions/src/hanziChecking.ts so the optional `hanziAutoCheck` Cloud
 * Function grades with identical logic. If you change it here, copy it
 * there too (the functions build is a separate TypeScript project and
 * can't import from src/).
 *
 * What is (and is not) checked automatically:
 * - pinyin       — tone marks and tone numbers are treated as equal
 *                  (nǐ hǎo == ni3 hao3 == "nǐhǎo"); spaces, apostrophes,
 *                  hyphens and case are ignored; ü may be typed as v or u:.
 *                  Tones can be made optional per assignment.
 * - translation  — exact match after normalising case, spacing, punctuation
 *                  and the different Uzbek apostrophes (oʻ / o' / o`).
 *                  Synonyms must be listed by the teacher as alternatives;
 *                  anything else is marked incorrect and is for the teacher
 *                  to override. This is string matching, not understanding.
 * - hanzi_input /
 *   dictation    — exact character match (whitespace/punctuation ignored).
 * - writing      — NOT handwriting recognition. HanziWriter checks each
 *                  stroke against the known character in the student's
 *                  browser, and the browser reports "completed + mistake
 *                  count". A free-hand drawing without that report is left
 *                  'unanswered' for the teacher to judge from the picture.
 */

export type ExerciseType = 'writing' | 'hanzi_input' | 'pinyin' | 'translation' | 'dictation';
export type Verdict = 'correct' | 'incorrect' | 'unanswered';

export interface CheckOptions {
  pinyinRequireTones: boolean;
  writingMistakeTolerance: number;
}

interface WritingCharLike {
  completed: boolean;
  mistakes: number;
}

interface AnswerLike {
  text?: string;
  writing?: WritingCharLike[];
  freehand?: string;
}

interface ItemLike {
  type: ExerciseType;
  charCount?: number;
}

interface KeyLike {
  accepted: string[];
  hanzi?: string;
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

const TONE_BY_COMBINING_MARK: Record<string, number> = {
  '\u0304': 1, // macron  ā
  '\u0301': 2, // acute   á
  '\u030C': 3, // caron   ǎ
  '\u0300': 4, // grave   à
};

/**
 * Reduces any pinyin spelling to "letters|tones", e.g.
 *   "Nǐ hǎo" → "nihao|33",  "ni3 hao3" → "nihao|33",  "lǜ" → "lv|4".
 * Neutral tone (5, 0, or no mark) contributes nothing to the tone list.
 */
export function normalizePinyin(input: string, requireTones = true): string {
  const decomposed = input.toLowerCase().replace(/u:/g, 'ü').normalize('NFD');
  let letters = '';
  const tones: number[] = [];
  for (const ch of decomposed) {
    if (ch >= 'a' && ch <= 'z') {
      letters += ch;
      continue;
    }
    if (ch === '\u0308') {
      // diaeresis: ü → v (only meaningful right after a "u")
      if (letters.endsWith('u')) letters = letters.slice(0, -1) + 'v';
      continue;
    }
    const tone = TONE_BY_COMBINING_MARK[ch];
    if (tone) {
      tones.push(tone);
      continue;
    }
    if (ch >= '1' && ch <= '4') {
      tones.push(Number(ch));
      continue;
    }
    // '5'/'0' (neutral), spaces, apostrophes, hyphens, punctuation: dropped.
  }
  return requireTones ? `${letters}|${tones.join('')}` : letters;
}

const APOSTROPHES = /[\u2018\u2019\u02BB\u02BC\u0060\u00B4\u2032]/g;

/** Lower-cases, unifies Uzbek apostrophes, strips punctuation and extra whitespace. */
export function normalizeTranslation(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFC')
    .replace(APOSTROPHES, "'")
    .replace(/[.,!?;:"()[\]{}«»…—–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Keeps only the characters themselves — drops whitespace and ASCII/CJK punctuation. */
export function normalizeHanzi(input: string): string {
  return input.normalize('NFC').replace(/[\s.,!?;:'"()[\]{}。，！？、；：‘’“”（）《》…—·]/g, '');
}

/** "salom; assalomu alaykum / hello" → ["salom", "assalomu alaykum", "hello"]. */
export function splitAlternatives(value: string): string[] {
  return value
    .split(/[;/,，；]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------

function hasText(answer: AnswerLike | undefined): answer is AnswerLike & { text: string } {
  return Boolean(answer?.text && answer.text.trim() !== '');
}

export function checkItem(item: ItemLike, key: KeyLike, answer: AnswerLike | undefined, opts: CheckOptions): Verdict {
  switch (item.type) {
    case 'pinyin': {
      if (!hasText(answer)) return 'unanswered';
      const got = normalizePinyin(answer.text, opts.pinyinRequireTones);
      return key.accepted.some((a) => normalizePinyin(a, opts.pinyinRequireTones) === got) ? 'correct' : 'incorrect';
    }
    case 'translation': {
      if (!hasText(answer)) return 'unanswered';
      const got = normalizeTranslation(answer.text);
      const accepted = key.accepted.flatMap((a) => [a, ...splitAlternatives(a)]).map(normalizeTranslation);
      return accepted.includes(got) ? 'correct' : 'incorrect';
    }
    case 'hanzi_input':
    case 'dictation': {
      if (!hasText(answer)) return 'unanswered';
      const got = normalizeHanzi(answer.text);
      return key.accepted.some((a) => normalizeHanzi(a) === got) ? 'correct' : 'incorrect';
    }
    case 'writing': {
      const chars = answer?.writing ?? [];
      const expected = item.charCount ?? chars.length;
      const allCompleted = chars.length > 0 && chars.length >= expected && chars.every((c) => c.completed);
      if (!allCompleted) return 'unanswered'; // e.g. only a free-hand picture — teacher decides
      return chars.every((c) => c.mistakes <= opts.writingMistakeTolerance) ? 'correct' : 'incorrect';
    }
    default:
      return 'unanswered';
  }
}

export interface GradeResult {
  score: number;
  maxScore: number;
  correct: number;
  total: number;
  verdicts: Record<string, Verdict>;
  wrongWords: string[];
}

/** Score is spread evenly over items and rounded to one decimal. 'unanswered' counts as not correct. */
export function gradeSubmission(
  items: (ItemLike & { id: string })[],
  keys: Map<string, KeyLike>,
  answers: Record<string, AnswerLike | undefined>,
  opts: CheckOptions,
  maxScore: number,
): GradeResult {
  const verdicts: Record<string, Verdict> = {};
  const wrongWords: string[] = [];
  let correct = 0;
  for (const item of items) {
    const key = keys.get(item.id);
    const verdict = key ? checkItem(item, key, answers[item.id], opts) : 'unanswered';
    verdicts[item.id] = verdict;
    if (verdict === 'correct') correct += 1;
    else if (key?.hanzi) wrongWords.push(key.hanzi);
  }
  const total = items.length;
  const score = total === 0 ? 0 : Math.round((maxScore * correct * 10) / total) / 10;
  return { score, maxScore, correct, total, verdicts, wrongWords };
}

/** Score after the teacher's per-item corrections — what the review page suggests as the final score. */
export function scoreWithOverrides(
  verdicts: Record<string, Verdict>,
  overrides: Record<string, Verdict>,
  itemIds: string[],
  maxScore: number,
): number {
  if (itemIds.length === 0) return 0;
  const correct = itemIds.filter((id) => (overrides[id] ?? verdicts[id]) === 'correct').length;
  return Math.round((maxScore * correct * 10) / itemIds.length) / 10;
}
