// Line icons of the client PDF (24×24, stroked), drawn after the visual reference.
import type { SectionIcon } from './pdf/clientQuote'

export type IconShape =
  | { kind: 'path'; d: string }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number }
  | { kind: 'circle'; cx: number; cy: number; r: number }

export const ICONS: Record<SectionIcon, IconShape[]> = {
  cable: [
    { kind: 'path', d: 'M4 7c4 0 4 10 8 10s4-10 8-10' },
    { kind: 'circle', cx: 4, cy: 7, r: 1.6 },
    { kind: 'circle', cx: 20, cy: 7, r: 1.6 },
  ],
  board: [
    { kind: 'rect', x: 4, y: 3, w: 16, h: 18, rx: 1.5 },
    { kind: 'path', d: 'M8 8v4M12 8v4M16 8v4M7 16h10' },
  ],
  line: [{ kind: 'path', d: 'M3 20h5v-5h5v-5h5V5h3' }],
  switch: [
    { kind: 'rect', x: 5, y: 3, w: 14, h: 18, rx: 2 },
    { kind: 'rect', x: 9, y: 8, w: 6, h: 8, rx: 1 },
  ],
  cert: [
    { kind: 'path', d: 'M6 3h9l3 3v15H6z' },
    { kind: 'path', d: 'M9 13l2 2 4-4' },
  ],
  light: [
    { kind: 'path', d: 'M9 18h6M10 21h4' },
    { kind: 'path', d: 'M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z' },
  ],
  intercom: [
    { kind: 'rect', x: 6, y: 2, w: 12, h: 20, rx: 2 },
    { kind: 'circle', cx: 12, cy: 8, r: 2.5 },
    { kind: 'path', d: 'M9 15h6M9 18h6' },
  ],
  generic: [{ kind: 'path', d: 'M13 2L4 14h7l-1 8 9-12h-7z' }],
}
