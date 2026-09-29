import { describe, expect, it } from 'vitest'
import { computeTotals, round2, type AiLine, type PricingContext } from '../../supabase/functions/_shared/totals.ts'

const ctx: PricingContext = {
  priceItems: [
    { code: 'PRESA10', price_eur: 32 },
    { code: 'INT', price_eur: 29.3 },
    { code: 'PLUCE', price_eur: 18 },
    { code: 'CENTR8', price_eur: 62 },
    { code: 'NOPRICE', price_eur: null },
  ],
  hourlyRate: 40,
  helperRate: 25,
  discountPct: 46,
  markupPct: 20,
  vatRate: 10,
  uplift: { media: 5, top: 12 },
}

const line = (over: Partial<AiLine>): AiLine => ({
  price_item_code: null,
  description: 'voce',
  qty: 1,
  unit: 'punto',
  kind: 'punto',
  worker: null,
  unit_price: null,
  counts_as_point: false,
  to_confirm: false,
  note: null,
  ...over,
})

describe('computeTotals', () => {
  it('prices listed items, hours and estimates, and computes the three tiers', () => {
    const t = computeTotals(
      {
        rooms: [
          {
            name: 'Cucina',
            icon: 'kitchen',
            lines: [
              line({ price_item_code: 'PRESA10', qty: 4 }), // 4 × 32 = 128, 4 points
              line({ price_item_code: 'INT', qty: 2 }), // 2 × 29,30 = 58,60, 2 points
              line({ price_item_code: 'PLUCE', qty: 2 }), // 2 × 18 = 36, not a point
            ],
          },
          {
            name: 'Quadro',
            icon: 'panel',
            lines: [
              line({ price_item_code: 'CENTR8', qty: 1 }), // 62
              line({ kind: 'ore', unit: 'ore', worker: 'titolare', qty: 3 }), // 3 × 40 = 120
              line({ kind: 'ore', unit: 'ore', worker: 'aiutante', qty: 3 }), // 3 × 25 = 75
              line({ kind: 'materiale', unit: 'pz', unit_price: 100, qty: 1 }), // 100 × 0,54 × 1,2 = 64,80 (stima)
            ],
          },
        ],
      },
      ctx,
    )
    // base = 128 + 58.6 + 36 + 62 + 120 + 75 + 64.8 = 544.4
    expect(t.base.imponibile).toBe(544.4)
    expect(t.base.iva).toBe(54.44)
    expect(t.base.totale).toBe(598.84)
    expect(t.points).toBe(6)
    expect(t.media.imponibile).toBe(574.4) // + 6 × 5
    expect(t.top.imponibile).toBe(616.4) // + 6 × 12
    expect(t.top.totale).toBe(678.04)
    expect(t.base.to_confirm_count).toBe(1) // the estimate
    const est = t.lines.find((l) => l.source === 'stima')!
    expect(est.unit_price).toBe(64.8)
    expect(est.to_confirm).toBe(true)
  })

  it('marks missing prices, unknown helper rate and missing uplift as "da confermare"', () => {
    const t = computeTotals(
      {
        rooms: [
          {
            name: 'Bagno',
            icon: 'bathroom',
            lines: [
              line({ price_item_code: 'NOPRICE', qty: 1 }),
              line({ price_item_code: 'UNKNOWN', qty: 2 }),
              line({ kind: 'ore', worker: 'aiutante', qty: 2 }),
              line({ counts_as_point: true, qty: 3, unit_price: 40 }), // estimate, counts as point
            ],
          },
        ],
      },
      { ...ctx, helperRate: null, uplift: { media: null, top: 12 } },
    )
    expect(t.lines.map((l) => l.source)).toEqual(['mancante', 'mancante', 'mancante', 'stima'])
    expect(t.lines.every((l) => l.to_confirm)).toBe(true)
    expect(t.base.imponibile).toBe(120)
    expect(t.points).toBe(3)
    expect(t.media.uplift_missing).toBe(true)
    expect(t.media.imponibile).toBe(120)
    expect(t.top.imponibile).toBe(156)
  })

  it('treats invalid quantities as 0 and to confirm; uses IVA 22 and 4', () => {
    const q = { rooms: [{ name: 'X', icon: 'other' as const, lines: [line({ price_item_code: 'PRESA10', qty: Number.NaN })] }] }
    const t = computeTotals(q, ctx)
    expect(t.lines[0].total).toBe(0)
    expect(t.lines[0].to_confirm).toBe(true)
    const q2 = { rooms: [{ name: 'X', icon: 'other' as const, lines: [line({ price_item_code: 'PRESA10', qty: 10 })] }] }
    expect(computeTotals(q2, { ...ctx, vatRate: 22 }).base.totale).toBe(390.4)
    expect(computeTotals(q2, { ...ctx, vatRate: 4 }).base.totale).toBe(332.8)
  })

  it('rounds money to cents', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(0.1 + 0.2)).toBe(0.3)
  })
})
