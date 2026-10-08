// Plate drawings for the three options (Base / Consigliata / Top), shared by the app and the PDF.
import type { PlateStyle } from './pdf/clientQuote'

export type PlateShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number; fill: string; stroke?: string; opacity?: number }
  | { kind: 'path'; d: string; fill: string; opacity?: number }

/** Shapes on a 40×40 canvas; `color` is the option's colour. */
export function plateShapes(style: PlateStyle, color: string): PlateShape[] {
  switch (style) {
    case 'flat_white':
      return [
        { kind: 'rect', x: 4, y: 4, w: 32, h: 32, rx: 3, fill: '#FFFFFF', stroke: '#CBD5E1' },
        { kind: 'rect', x: 13, y: 10, w: 14, h: 20, rx: 2, fill: '#F1F5F9', stroke: '#CBD5E1' },
      ]
    case 'colored_round':
      return [
        { kind: 'rect', x: 4, y: 4, w: 32, h: 32, rx: 10, fill: color },
        { kind: 'rect', x: 13, y: 10, w: 14, h: 20, rx: 5, fill: '#FFFFFF', opacity: 0.92 },
      ]
    case 'glass_dark':
      return [
        { kind: 'rect', x: 4, y: 4, w: 32, h: 32, rx: 4, fill: '#1F2937' },
        { kind: 'path', d: 'M7 7 L22 7 L7 22 Z', fill: '#FFFFFF', opacity: 0.1 },
        { kind: 'rect', x: 14, y: 11, w: 12, h: 18, rx: 1.5, fill: '#374151', stroke: color },
      ]
  }
}
