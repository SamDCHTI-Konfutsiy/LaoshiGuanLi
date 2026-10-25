import { HanziGrid } from '@/features/hanzi/components/HanziGrid';
import type { HanziGridType } from '@/types/enums';

interface StrokesPreviewProps {
  /** SVG path data. */
  strokes: string;
  wrongStrokes?: string;
  /** 1024 for HanziWriter strokes, 1000 for free-hand drawings. */
  box: 1024 | 1000;
  gridType: HanziGridType;
  /** Faint reference character drawn underneath (teacher view only — it is the answer). */
  ghost?: string;
  size?: number;
  label?: string;
}

/** Read-only picture of what a student drew — used on the teacher's review page and in the student's own submitted view. */
export function StrokesPreview({ strokes, wrongStrokes = '', box, gridType, ghost, size = 112, label }: StrokesPreviewProps) {
  return (
    <figure className="flex flex-col items-center gap-1">
      <div className="relative bg-surface-raised" style={{ width: size, height: size }}>
        <HanziGrid type={gridType} />
        {ghost && (
          <span
            aria-hidden="true"
            className="font-kai pointer-events-none absolute inset-0 flex items-center justify-center text-text-muted/20"
            style={{ fontSize: size * 0.8, lineHeight: 1 }}
          >
            {ghost}
          </span>
        )}
        <svg viewBox={`0 0 ${box} ${box}`} className="absolute inset-0 h-full w-full" role="img" aria-label={label ?? 'handwriting'}>
          {wrongStrokes && (
            <path d={wrongStrokes} fill="none" stroke="currentColor" strokeWidth={box * 0.03} strokeLinecap="round" strokeLinejoin="round" className="text-coral-500/70" />
          )}
          {strokes && (
            <path d={strokes} fill="none" stroke="currentColor" strokeWidth={box * 0.035} strokeLinecap="round" strokeLinejoin="round" className="text-text" />
          )}
        </svg>
      </div>
      {label && <figcaption className="text-xs text-text-muted">{label}</figcaption>}
    </figure>
  );
}
