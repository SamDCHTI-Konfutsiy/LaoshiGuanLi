const MARKS: Record<string, string[]> = {
  a: ['ā', 'á', 'ǎ', 'à'],
  e: ['ē', 'é', 'ě', 'è'],
  i: ['ī', 'í', 'ǐ', 'ì'],
  o: ['ō', 'ó', 'ǒ', 'ò'],
  u: ['ū', 'ú', 'ǔ', 'ù'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
};

function markSyllable(syllable: string, tone: number): string {
  const s = syllable.replace(/v|u:/g, 'ü').replace(/V|U:/g, 'Ü');
  if (tone < 1 || tone > 4) return s;
  const lower = s.toLowerCase();
  // Standard placement: a or e takes the mark; in "ou" the o does; otherwise the last vowel.
  let idx = lower.search(/[ae]/);
  if (idx === -1) idx = lower.indexOf('ou');
  if (idx === -1) {
    for (let i = lower.length - 1; i >= 0; i--) {
      if ('iouü'.includes(lower[i]!)) {
        idx = i;
        break;
      }
    }
  }
  if (idx === -1) return s;
  const base = lower[idx]!;
  const marked = MARKS[base]?.[tone - 1];
  if (!marked) return s;
  const isUpper = s[idx] !== lower[idx];
  return s.slice(0, idx) + (isUpper ? marked.toUpperCase() : marked) + s.slice(idx + 1);
}

/** "ni3 hao3" → "nǐ hǎo", "lv4" → "lǜ", "ma5" → "ma". Text that already has marks is returned unchanged. */
export function numberedToMarked(input: string): string {
  return input.replace(/([a-zA-ZüÜ:]+)([1-5])/g, (_, syl: string, tone: string) => markSyllable(syl, Number(tone)));
}

export const HAN_RE = /\p{Script=Han}/u;

export function isHanzi(text: string): boolean {
  const chars = [...text.replace(/\s/g, '')];
  return chars.length > 0 && chars.every((c) => HAN_RE.test(c));
}
