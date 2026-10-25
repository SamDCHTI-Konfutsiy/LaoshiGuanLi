import type { HanziGridType } from '@/types/enums';

/**
 * 米字格 (mi) / 田字格 (tian) practice-paper guide lines, drawn as an SVG
 * that stretches to fill its (square) parent. Purely decorative — sits
 * behind HanziWriter or the free-draw surface.
 */
export function HanziGrid({ type, className = '' }: { type: HanziGridType; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className={'pointer-events-none absolute inset-0 h-full w-full ' + className}>
      <rect x="0.75" y="0.75" width="98.5" height="98.5" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-coral-500/70" />
      <g stroke="currentColor" strokeWidth="0.6" strokeDasharray="3 2.5" className="text-coral-500/50" fill="none">
        <line x1="50" y1="0" x2="50" y2="100" />
        <line x1="0" y1="50" x2="100" y2="50" />
        {type === 'mi' && (
          <>
            <line x1="0" y1="0" x2="100" y2="100" />
            <line x1="100" y1="0" x2="0" y2="100" />
          </>
        )}
      </g>
    </svg>
  );
}
