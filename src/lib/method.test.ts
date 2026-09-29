import { describe, expect, it } from 'vitest'
import {
  defaultVatRate,
  methodText,
  pricingContext,
  seriesForTier,
} from '../../supabase/functions/_shared/method.ts'
import { replyMode, replySchema } from '../../supabase/functions/_shared/aiSchema.ts'
import type { Answers } from '../../supabase/functions/_shared/answers.ts'

const items = [{ code: 'PRESA10', name: 'Presa 10A / bipresa', category: 'Prese', unit: 'punto', price_eur: 36, includes_material: true }]
const uplifts = [
  { marca: 'Vimar', serie: 'Arké', uplift_per_point_eur: 6 },
  { marca: 'Vimar', serie: 'Eikon', uplift_per_point_eur: null },
]

describe('pricingContext', () => {
  it('uses the usual values when nothing was answered', () => {
    const c = pricingContext({}, items, 10, uplifts)
    expect(c.hourlyRate).toBe(60)
    expect(c.helperRate).toBe(25)
    expect(c.discountPct).toBe(46) // "Non so"
    expect(c.markupPct).toBe(20)
    expect(c.uplift).toEqual({ media: 6, top: null }) // Arké known, Eikon unknown
  })

  it('reads typed values, no helper and a known discount', () => {
    const a: Answers = {
      q3: { value: 'altro', source: 'user', custom_text: '55 €' },
      q4: { value: 'nessuno', source: 'user' },
      q6: { value: '40', source: 'user' },
      q7: { value: { base: { choice: 'vimar_plana' }, consigliata: { choice: 'altro', custom: 'Gewiss Chorus' }, top: { choice: 'vimar_eikon' } }, source: 'user' },
    }
    const c = pricingContext(a, items, 22, uplifts)
    expect(c.hourlyRate).toBe(55)
    expect(c.helperRate).toBeNull()
    expect(c.discountPct).toBe(40)
    expect(c.uplift.media).toBeNull() // typed series → unknown uplift
    expect(seriesForTier(a, 'media')).toEqual({ label: 'Gewiss Chorus' }) // old "consigliata" key still read
  })

  it('picks the default IVA for a new quote', () => {
    expect(defaultVatRate({})).toBe(10)
    expect(defaultVatRate({ q10: { value: '22', source: 'user' } })).toBe(22)
    expect(defaultVatRate({ q10: { value: 'caso_per_caso', source: 'user' } })).toBe(10)
  })
})

describe('methodText', () => {
  it('describes answers, their origin, series and the price list in Italian', () => {
    const t = methodText({ q2: { value: 'a_punto', source: 'user' } }, 'Uso sempre tubo da 25', items, uplifts)
    expect(t).toContain('Come fai di solito il prezzo per i privati? → A punto, tutto compreso')
    expect(t).toContain('(risposta dell’elettricista)')
    expect(t).toContain('IVA che applichi di solito ai privati? → 10% (ristrutturazioni in casa) (valore standard, non confermato)')
    expect(t).toContain('Media: Vimar Arké — sovrapprezzo 6,00 € per punto')
    expect(t).toContain('Top: Vimar Eikon — sovrapprezzo per punto non disponibile')
    expect(t).toContain('Uso sempre tubo da 25')
    expect(t).toContain('PRESA10 | Presa 10A / bipresa | punto | 36,00 € | sì')
    expect(t).not.toContain('Quanto ricarichi') // only for hourly pricing
  })
})

describe('reply rules', () => {
  it('forces a clarify round first, a quote after two rounds', () => {
    expect(replyMode(1, 0)).toBe('clarify_only')
    expect(replyMode(1, 1)).toBe('either')
    expect(replyMode(1, 2)).toBe('quote_only')
    expect(replyMode(2, 0)).toBe('either')
    expect(replyMode(2, 1)).toBe('quote_only')
  })

  it('builds strict schemas (every object closed)', () => {
    const walk = (s: unknown): void => {
      if (!s || typeof s !== 'object') return
      const o = s as Record<string, unknown>
      if (o.type === 'object') {
        expect(o.additionalProperties).toBe(false)
        expect(Object.keys(o.properties as object).sort()).toEqual([...(o.required as string[])].sort())
      }
      Object.values(o).forEach(walk)
    }
    walk(replySchema('either'))
  })
})
