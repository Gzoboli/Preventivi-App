import { Font } from '@react-pdf/renderer'

let registered = false

/** Inter 400/600/700/800 embedded in the PDF; words are never hyphenated. */
export function registerInter(src: Record<400 | 600 | 700 | 800, string>) {
  if (registered) return
  Font.register({
    family: 'Inter',
    fonts: ([400, 600, 700, 800] as const).map((fontWeight) => ({ src: src[fontWeight], fontWeight })),
  })
  Font.registerHyphenationCallback((word) => [word])
  registered = true
}
