import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HanziGrid } from '@/features/hanzi/components/HanziGrid';
import { appendPath, internalPointsToPath, loadCharacterData, loadHanziWriter, type HanziWriterInstance } from '@/features/hanzi/lib/hanziWriter';
import type { HanziGridType } from '@/types/enums';
import type { HanziWritingChar } from '@/types/models';

type Writer = HanziWriterInstance;

function palette() {
  const dark = document.documentElement.classList.contains('dark');
  return dark
    ? { stroke: '#e7eaf0', drawing: '#90a8d4', outline: '#2f3a4d', highlight: '#c98a2c', radical: '#e7eaf0' }
    : { stroke: '#171b24', drawing: '#34548c', outline: '#dde1e8', highlight: '#c98a2c', radical: '#171b24' };
}

interface WritingPadProps {
  char: string;
  gridType: HanziGridType;
  size: number;
  allowHints: boolean;
  value: HanziWritingChar | undefined;
  onChange: (next: HanziWritingChar) => void;
  /** Called once if the stroke data can't be loaded (offline + not cached, or an unsupported character). */
  onUnavailable?: () => void;
}

/**
 * One character, written in HanziWriter's quiz mode: each stroke is checked
 * against the known character as it is drawn. The parent receives
 * { completed, mistakes, strokes } after every stroke, so partial work is
 * saved too.
 */
export function WritingPad({ char, gridType, size, allowHints, value, onChange, onUnavailable }: WritingPadProps) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<Writer | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;
  const initialCompleted = useRef(Boolean(value?.completed));
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [done, setDone] = useState<{ mistakes: number } | null>(value?.completed ? { mistakes: value.mistakes } : null);

  /** `reset` = the student explicitly started over, so the stored result is cleared too (not on first mount — that would save an empty answer just for opening the page). */
  function startQuiz(writer: Writer, reset: boolean) {
    const acc = { strokes: '', wrong: '', mistakes: 0 };
    setDone(null);
    writer.hideCharacter();
    if (allowHints) writer.showOutline();
    else writer.hideOutline();
    const emit = (completed: boolean) =>
      onChangeRef.current({ char, completed, mistakes: acc.mistakes, strokes: acc.strokes, wrongStrokes: acc.wrong });
    if (reset) emit(false);
    void writer.quiz({
      showHintAfterMisses: allowHints ? 3 : false,
      onCorrectStroke: (data) => {
        acc.strokes = appendPath(acc.strokes, internalPointsToPath(data.drawnPath?.points));
        acc.mistakes = data.totalMistakes;
        emit(false);
      },
      onMistake: (data) => {
        acc.wrong = appendPath(acc.wrong, internalPointsToPath(data.drawnPath?.points));
        acc.mistakes = data.totalMistakes;
        emit(false);
      },
      onComplete: (summary) => {
        acc.mistakes = summary.totalMistakes;
        setDone({ mistakes: summary.totalMistakes });
        emit(true);
      },
    });
  }

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    setState('loading');

    void loadHanziWriter()
      .then((HanziWriter) => {
        if (cancelled) return;
        host.innerHTML = '';
        const colors = palette();
        const writer = HanziWriter.create(host, char, {
          width: size,
          height: size,
          padding: Math.round(size * 0.06),
          showCharacter: false,
          showOutline: allowHints,
          strokeColor: colors.stroke,
          radicalColor: colors.radical,
          outlineColor: colors.outline,
          drawingColor: colors.drawing,
          highlightColor: colors.highlight,
          drawingWidth: Math.max(4, Math.round(size / 18)),
          charDataLoader: (c, onLoad, onError) => {
            loadCharacterData(c).then(onLoad, onError);
          },
          onLoadCharDataSuccess: () => {
            if (cancelled) return;
            setState('ready');
            if (initialCompleted.current) {
              // Already finished earlier (restored draft) — show it, don't force a redo.
              writer.showCharacter();
            } else {
              startQuiz(writer, false);
            }
          },
          onLoadCharDataError: () => {
            if (cancelled) return;
            setState('error');
            onUnavailableRef.current?.();
          },
        });
        writerRef.current = writer;
      })
      .catch(() => {
        if (!cancelled) {
          setState('error');
          onUnavailableRef.current?.();
        }
      });

    return () => {
      cancelled = true;
      try {
        writerRef.current?.cancelQuiz();
      } catch {
        // already torn down
      }
      writerRef.current = null;
      host.innerHTML = '';
    };
    // startQuiz is recreated each render but only reads refs/props captured here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char, size, allowHints]);

  function restart() {
    const writer = writerRef.current;
    if (!writer) return;
    initialCompleted.current = false;
    writer.cancelQuiz();
    startQuiz(writer, true);
  }

  function animate() {
    const writer = writerRef.current;
    if (!writer) return;
    initialCompleted.current = false;
    writer.cancelQuiz();
    void writer.animateCharacter({
      onComplete: () => {
        window.setTimeout(() => startQuiz(writer, true), 400);
      },
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative rounded-md bg-surface-raised shadow-inner" style={{ width: size, height: size }}>
        <HanziGrid type={gridType} />
        <div ref={hostRef} className="absolute inset-0" style={{ touchAction: 'none' }} />
        {state === 'loading' && (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-text-muted">{t('loading')}</span>
        )}
        {state === 'error' && (
          <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-coral-500">
            {t('hanzi.writing.dataUnavailable')}
          </span>
        )}
      </div>
      {state === 'ready' && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {done ? (
            <span className={'text-xs font-medium ' + (done.mistakes === 0 ? 'text-teal-500' : 'text-amber-500')}>
              ✓ {t('hanzi.writing.mistakes', { count: done.mistakes })}
            </span>
          ) : (
            <span className="text-xs text-text-muted">{t('hanzi.writing.drawHint')}</span>
          )}
          <button type="button" onClick={restart} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-surface-raised">
            {t('hanzi.writing.restart')}
          </button>
          {allowHints && (
            <button type="button" onClick={animate} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-surface-raised">
              {t('hanzi.writing.animate')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Looping stroke-order animation — teacher-facing (word base, review page). Shows the answer, so never used in a student's unsubmitted view unless hints are allowed. */
export function StrokeOrderAnimation({ char, size = 120, gridType = 'mi' }: { char: string; size?: number; gridType?: HanziGridType }) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    setError(false);
    void loadHanziWriter()
      .then((HanziWriter) => {
        if (cancelled) return;
        host.innerHTML = '';
        const colors = palette();
        const writer = HanziWriter.create(host, char, {
          width: size,
          height: size,
          padding: Math.round(size * 0.06),
          strokeColor: colors.stroke,
          radicalColor: colors.radical,
          outlineColor: colors.outline,
          delayBetweenLoops: 1500,
          charDataLoader: (c, onLoad, onError) => {
            loadCharacterData(c).then(onLoad, onError);
          },
          onLoadCharDataError: () => !cancelled && setError(true),
        });
        writer.loopCharacterAnimation();
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
      host.innerHTML = '';
    };
  }, [char, size]);

  return (
    <div className="relative rounded-md bg-surface-raised" style={{ width: size, height: size }}>
      <HanziGrid type={gridType} />
      <div ref={hostRef} className="absolute inset-0" />
      {error && (
        <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-coral-500">
          {t('hanzi.writing.dataUnavailable')}
        </span>
      )}
    </div>
  );
}
