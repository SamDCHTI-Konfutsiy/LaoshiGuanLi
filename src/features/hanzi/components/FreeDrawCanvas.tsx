import { useRef, useState, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { HanziGrid } from '@/features/hanzi/components/HanziGrid';
import type { HanziGridType } from '@/types/enums';

const BOX = 1000;
const MIN_STEP = 6; // in box units — skips jitter, keeps the stored path small

interface FreeDrawCanvasProps {
  value: string;
  onChange: (path: string) => void;
  gridType: HanziGridType;
  size: number;
  disabled?: boolean;
}

function splitStrokes(path: string): string[] {
  if (!path.trim()) return [];
  return path
    .split(/(?=M)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Free-hand writing surface (mouse, finger or stylus via Pointer Events).
 * Produces SVG path data in a 1000×1000 box. There is no recognition here
 * — the drawing is stored as-is for the teacher to look at.
 */
export function FreeDrawCanvas({ value, onChange, gridType, size, disabled = false }: FreeDrawCanvasProps) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const [live, setLiveState] = useState<string>('');
  const liveRef = useRef('');
  const setLive = (next: string) => {
    liveRef.current = next;
    setLiveState(next);
  };
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const drawing = useRef(false);

  function toBox(e: PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(BOX, ((e.clientX - rect.left) / rect.width) * BOX)),
      y: Math.max(0, Math.min(BOX, ((e.clientY - rect.top) / rect.height) * BOX)),
    };
  }

  function handleDown(e: PointerEvent<SVGSVGElement>) {
    if (disabled) return;
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = toBox(e);
    lastPoint.current = p;
    setLive(`M${Math.round(p.x)} ${Math.round(p.y)}`);
  }

  function handleMove(e: PointerEvent<SVGSVGElement>) {
    if (!drawing.current || disabled) return;
    const p = toBox(e);
    const last = lastPoint.current;
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < MIN_STEP) return;
    lastPoint.current = p;
    setLive(`${liveRef.current} L${Math.round(p.x)} ${Math.round(p.y)}`);
  }

  function handleUp() {
    if (!drawing.current) return;
    drawing.current = false;
    lastPoint.current = null;
    const s = liveRef.current;
    setLive('');
    if (s) {
      // A single tap becomes a dot rather than an invisible zero-length path.
      const stroke = s.includes('L') ? s : `${s} l1 1`;
      onChange(value ? `${value} ${stroke}` : stroke);
    }
  }

  function undo() {
    const strokes = splitStrokes(value);
    strokes.pop();
    onChange(strokes.join(' '));
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative rounded-md bg-surface-raised shadow-inner" style={{ width: size, height: size }}>
        <HanziGrid type={gridType} />
        <svg
          ref={svgRef}
          viewBox={`0 0 ${BOX} ${BOX}`}
          className={'absolute inset-0 h-full w-full ' + (disabled ? '' : 'cursor-crosshair')}
          style={{ touchAction: 'none' }}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          onPointerLeave={handleUp}
          role="img"
          aria-label={t('hanzi.writing.freeCanvas')}
        >
          <path d={value} fill="none" stroke="currentColor" strokeWidth={34} strokeLinecap="round" strokeLinejoin="round" className="text-text" />
          {live && <path d={live} fill="none" stroke="currentColor" strokeWidth={34} strokeLinecap="round" strokeLinejoin="round" className="text-steel-500" />}
        </svg>
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <button type="button" onClick={undo} disabled={!value} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-surface-raised disabled:opacity-40">
            {t('hanzi.writing.undo')}
          </button>
          <button type="button" onClick={() => onChange('')} disabled={!value} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-surface-raised disabled:opacity-40">
            {t('hanzi.writing.clear')}
          </button>
        </div>
      )}
    </div>
  );
}
