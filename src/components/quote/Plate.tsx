import { plateShapes } from '../../lib/plates'
import type { PlateStyle } from '../../lib/pdf/clientQuote'

/** The plate drawing of an option (same drawing as in the client PDF). */
export function Plate({ style, color, size = 40 }: { style: PlateStyle; color: string; size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden className="shrink-0">
      {plateShapes(style, color).map((sh, i) =>
        sh.kind === 'rect' ? (
          <rect key={i} x={sh.x} y={sh.y} width={sh.w} height={sh.h} rx={sh.rx} fill={sh.fill} fillOpacity={sh.opacity ?? 1} stroke={sh.stroke} />
        ) : (
          <path key={i} d={sh.d} fill={sh.fill} fillOpacity={sh.opacity ?? 1} />
        ),
      )}
    </svg>
  )
}

/** Plate style and colour per option, as in the PDF (the recommended one uses the accent). */
export const TIER_PLATES = {
  base: { style: 'flat_white', color: '#64748B' },
  media: { style: 'colored_round', color: '#1F5EFF' },
  top: { style: 'glass_dark', color: '#A07C2C' },
} as const satisfies Record<string, { style: PlateStyle; color: string }>
