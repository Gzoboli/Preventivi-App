// Colours of the client PDF: the electrician's accent, made safe to use under white text.

const HEX = /^#?([0-9a-f]{6})$/i

type Rgb = [number, number, number]

function parse(hex: string): Rgb | null {
  const m = HEX.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const toHex = (c: Rgb) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase()

/** WCAG relative luminance. */
function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Contrast ratio of a colour against white. */
export function contrastWithWhite(hex: string): number {
  const c = parse(hex)
  return c ? 1.05 / (luminance(c) + 0.05) : 1
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

export type Palette = {
  /** Accent for fills under white text and for coloured text (contrast ≥ 4.5:1 on white). */
  accent: string
  /** ~10% of the accent on white: icon squares. */
  soft: string
}

/** The electrician's colour, darkened just enough when it is too light for white text. */
export function palette(hex: string | null | undefined, fallback = '#1F5EFF'): Palette {
  let c = parse(hex ?? '') ?? (parse(fallback) as Rgb)
  const original = c
  for (let i = 1; i <= 20 && 1.05 / (luminance(c) + 0.05) < 4.5; i++) c = mix(original, [0, 0, 0], i * 0.05)
  return { accent: toHex(c), soft: toHex(mix(c, [255, 255, 255], 0.9)) }
}
