import { describe, expect, it } from 'vitest'
import { renderToBuffer } from '@react-pdf/renderer'
import { ClientQuotePdf } from './ClientQuotePdf'
import { registerInter } from './fonts'
import { buildClientQuote, pageOneHeight, type ClientQuoteInput } from '../../lib/pdf/clientQuote'
import { job2Input, job2LongestInput, job2TiersInput } from '../../lib/pdf/job2.fixture'

const fonts = decodeURIComponent(new URL('../../../node_modules/@fontsource/inter/files/', import.meta.url).pathname)
const f = (w: number) => `${fonts}inter-latin-${w}-normal.woff`
registerInter({ 400: f(400), 600: f(600), 700: f(700), 800: f(800) })

async function pages(input: ClientQuoteInput): Promise<number> {
  const pdf = (await renderToBuffer(<ClientQuotePdf q={buildClientQuote(input)} />)).toString('latin1')
  return pdf.match(/\/Type\s*\/Page\b/g)?.length ?? 0
}

describe('client PDF', () => {
  it('is 2 pages, or 3 with the price detail switched on', async () => {
    expect(await pages(job2Input())).toBe(2)
    expect(await pages(job2TiersInput())).toBe(2)
    expect(await pages(job2Input({ showPrices: true }))).toBe(3)
  }, 30_000)

  it('keeps page 1 on one page even with the longest content', async () => {
    const q = buildClientQuote(job2LongestInput())
    expect(pageOneHeight(q)).toBeLessThanOrEqual(752)
    expect(q.tiles).toHaveLength(4)
    // 12 long sections: the detail continues on more pages, page 1 stays one page.
    expect(await pages(job2LongestInput())).toBe(4)
  }, 30_000)
})
