/**
 * HanziWriter integration.
 *
 * Character stroke data comes from the `hanzi-writer-data` package on the
 * jsDelivr CDN (HanziWriter's own default source — ~9 000 characters, a
 * few KB each). It is fetched with fetch() so the PWA service worker can
 * cache it (see the runtimeCaching rule in vite.config.ts): a character
 * loaded once keeps working offline. `prefetchCharacters` warms that cache
 * as soon as a student opens an assignment, while they are still online.
 *
 * What HanziWriter can and cannot do (important for honest grading):
 * - It CAN check, stroke by stroke, whether what is drawn matches a KNOWN
 *   target character's strokes in the right order and direction, count
 *   mistakes, show hints, and animate the correct stroke order.
 * - It CANNOT recognise an arbitrary free-hand character (it is not OCR).
 *   Free-hand drawings are therefore saved as pictures for the teacher.
 */

export const HANZI_DATA_CDN = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0';

export interface CharacterJson {
  strokes: string[];
  medians: number[][][];
  radStrokes?: number[];
}

const charCache = new Map<string, Promise<CharacterJson>>();

export function loadCharacterData(char: string): Promise<CharacterJson> {
  let pending = charCache.get(char);
  if (!pending) {
    pending = fetch(`${HANZI_DATA_CDN}/${encodeURIComponent(char)}.json`).then((res) => {
      if (!res.ok) throw new Error(`No stroke data for ${char} (${res.status})`);
      return res.json() as Promise<CharacterJson>;
    });
    pending.catch(() => charCache.delete(char)); // allow a retry later (e.g. back online)
    charCache.set(char, pending);
  }
  return pending;
}

/** Best-effort warm-up; failures are ignored here and surfaced by the pad that needs the character. */
export function prefetchCharacters(chars: Iterable<string>): void {
  for (const ch of new Set(chars)) {
    if (/\s/.test(ch)) continue;
    void loadCharacterData(ch).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// The library itself
// ---------------------------------------------------------------------------

/**
 * HanziWriter (MIT, https://hanziwriter.org) is loaded at runtime from the
 * same CDN as its data, instead of being an npm dependency — so this module
 * adds nothing to package.json / package-lock.json and the existing
 * `npm ci` build is unchanged. The service worker caches it for offline use.
 * Pinned to the 3.5 line (the version the official docs reference).
 */
export const HANZI_WRITER_URL = 'https://cdn.jsdelivr.net/npm/hanzi-writer@3.5/dist/hanzi-writer.min.js';

/** The subset of HanziWriter's API this app uses (see https://hanziwriter.org/docs.html). */
export interface StrokeData {
  character: string;
  strokeNum: number;
  mistakesOnStroke: number;
  totalMistakes: number;
  strokesRemaining: number;
  /** `points` are in HanziWriter's internal 1024-unit character space (y up). */
  drawnPath?: { pathString: string; points: { x: number; y: number }[] };
}

export interface QuizOptions {
  showHintAfterMisses?: number | false;
  onMistake?: (data: StrokeData) => void;
  onCorrectStroke?: (data: StrokeData) => void;
  onComplete?: (summary: { character: string; totalMistakes: number }) => void;
}

export interface HanziWriterOptions {
  width: number;
  height: number;
  padding: number;
  showCharacter: boolean;
  showOutline: boolean;
  strokeColor: string;
  radicalColor: string;
  outlineColor: string;
  drawingColor: string;
  highlightColor: string;
  drawingWidth: number;
  delayBetweenLoops: number;
  charDataLoader: (char: string, onLoad: (data: CharacterJson) => void, onError: (err?: unknown) => void) => void;
  onLoadCharDataSuccess: (data: CharacterJson) => void;
  onLoadCharDataError: (err?: unknown) => void;
}

export interface HanziWriterInstance {
  quiz(options?: QuizOptions): Promise<void> | void;
  cancelQuiz(): void;
  animateCharacter(options?: { onComplete?: () => void }): Promise<void> | void;
  loopCharacterAnimation(): Promise<void> | void;
  showCharacter(): Promise<void> | void;
  hideCharacter(): Promise<void> | void;
  showOutline(): Promise<void> | void;
  hideOutline(): Promise<void> | void;
}

export interface HanziWriterStatic {
  create(element: HTMLElement | string, character: string, options?: Partial<HanziWriterOptions>): HanziWriterInstance;
}

declare global {
  interface Window {
    HanziWriter?: HanziWriterStatic;
  }
}

let libraryPromise: Promise<HanziWriterStatic> | null = null;

/** Lazy — the script is only downloaded when a writing exercise / stroke animation is actually on screen. */
export function loadHanziWriter(): Promise<HanziWriterStatic> {
  if (window.HanziWriter) return Promise.resolve(window.HanziWriter);
  libraryPromise ??= new Promise<HanziWriterStatic>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = HANZI_WRITER_URL;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => (window.HanziWriter ? resolve(window.HanziWriter) : reject(new Error('HanziWriter global missing')));
    script.onerror = () => reject(new Error('Could not load HanziWriter'));
    document.head.appendChild(script);
  }).catch((err: unknown) => {
    libraryPromise = null; // allow a retry, e.g. once back online
    throw err;
  });
  return libraryPromise;
}

// ---------------------------------------------------------------------------
// Stroke path helpers
// ---------------------------------------------------------------------------

/**
 * HanziWriter reports drawn points in its internal character space: x in
 * 0..1024, y pointing UP from -124 to 900. We store them flipped into a
 * normal top-down 1024×1024 box so an <svg viewBox="0 0 1024 1024"> can
 * draw them directly.
 */
export function internalPointsToPath(points: { x: number; y: number }[] | undefined): string {
  if (!points || points.length === 0) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${Math.round(p.x)} ${Math.round(900 - p.y)}`)
    .join(' ');
}

export function appendPath(existing: string, next: string): string {
  if (!next) return existing;
  return existing ? `${existing} ${next}` : next;
}

// ---------------------------------------------------------------------------
// Text-to-speech for dictation
// ---------------------------------------------------------------------------

export function chineseVoiceAvailable(): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  return window.speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith('zh'));
}

export function speakChinese(text: string, rate = 0.8): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = rate;
  const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('zh-cn')) ?? synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('zh'));
  if (voice) utterance.voice = voice;
  synth.speak(utterance);
  return true;
}
