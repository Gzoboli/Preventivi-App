import { describe, expect, it } from 'vitest'
import {
  defaultVatRate,
  answeredHoursPerDay,
  methodText,
  pricingInputs,
  seriesForTier,
  upliftFor,
} from '../../supabase/functions/_shared/method.ts'
import { normalizeReply, replySchema } from '../../supabase/functions/_shared/aiSchema.ts'
import type { Answers } from '../../supabase/functions/_shared/answers.ts'

const items = [{ code: 'PRESA10', name: 'Presa 10A / bipresa', category: 'Prese', unit: 'punto', price_eur: 36, includes_material: true }]
const uplifts = [
  { marca: 'Vimar', serie: 'Arké', uplift_per_point_eur: 6 },
  { marca: 'Vimar', serie: 'Eikon', uplift_per_point_eur: null },
]

describe('pricingInputs', () => {
  it('uses the usual values when nothing was answered', () => {
    const c = pricingInputs({}, items, [], uplifts, 10)
    expect(c.hourlyRate).toBe(60)
    expect(c.helperRate).toBe(25)
    expect(c.defaultDiscountPct).toBe(46.6) // "Non so"
    expect(c.markupPct).toBe(20)
    expect(c.hoursPerDay).toBe(8)
    // Arké 6 € list above Plana (not listed → 0), at 46,6% discount and 20% markup; Eikon unknown
    expect(c.uplift).toEqual({ media: 3.84, top: null })
  })

  it('reads typed values, no helper, per-brand discounts', () => {
    const a: Answers = {
      q3: { value: 'altro', source: 'user', custom_text: '55 €' },
      q4: { value: 'nessuno', source: 'user' },
      q6: { value: '40', source: 'user' },
      q7: { value: { base: { choice: 'vimar_plana' }, consigliata: { choice: 'altro', custom: 'Gewiss Chorus' }, top: { choice: 'vimar_eikon' } }, source: 'user' },
    }
    const c = pricingInputs(a, items, [{ brand: 'BTicino', discount_pct: 50 }], uplifts, 22)
    expect(c.hourlyRate).toBe(55)
    expect(c.helperRate).toBeNull()
    expect(c.discounts.bticino).toBe(50)
    expect(c.discounts.vimar).toBe(40) // no row: the q6 answer
    expect(c.defaultDiscountPct).toBe(40)
    expect(c.uplift.media).toBeNull() // typed series → unknown uplift
    expect(seriesForTier(a, 'media')).toEqual({ label: 'Gewiss Chorus' }) // old "consigliata" key still read
  })

  it('uses the working day only when he answered it', () => {
    expect(answeredHoursPerDay({})).toBeNull()
    expect(answeredHoursPerDay({ q18: { value: '9', source: 'user' } })).toBe(9)
  })

  it('picks the default IVA for a new quote', () => {
    expect(defaultVatRate({})).toBe(10)
    expect(defaultVatRate({ q10: { value: '22', source: 'user' } })).toBe(22)
    expect(defaultVatRate({ q10: { value: 'caso_per_caso', source: 'user' } })).toBe(10)
  })
})

describe('upliftFor', () => {
  it('charges only the difference from the Base series', () => {
    const rows = [
      { marca: 'Vimar', serie: 'Plana', uplift_per_point_eur: 0 },
      { marca: 'BTicino', serie: 'L.NOW', uplift_per_point_eur: 12 },
      { marca: 'Vimar', serie: 'Eikon', uplift_per_point_eur: 25 },
    ]
    const a: Answers = {
      q6: { value: '50', source: 'user' },
      q17: { value: '0', source: 'user' },
      q7: { value: { base: { choice: 'bticino_living_now' }, media: { choice: 'vimar_plana' }, top: { choice: 'vimar_eikon' } }, source: 'user' },
    }
    expect(upliftFor(a, 'top', rows)).toBe(6.5) // (25 − 12) × 0.5
    expect(upliftFor(a, 'media', rows)).toBe(0) // cheaper than Base → no discount on the point price
  })
})

describe('methodText', () => {
  it('describes answers, their origin, series and the price list in Italian', () => {
    const t = methodText({ q15: { value: 'a_punto', source: 'user' } }, 'Uso sempre tubo da 25', items, uplifts).replace(/\u00a0/g, ' ')
    expect(t).toContain('Come preferisci fare il prezzo? → Sempre a punto')
    expect(t).toContain('(risposta dell’elettricista)')
    expect(t).toContain('IVA che applichi di solito ai privati? → 10% (ristrutturazioni in casa) (valore standard, non confermato)')
    expect(t).toContain('Consigliata: Vimar Arké — sovrapprezzo stimato dai listini 3,84 € per ogni frutto cambiato (ipotesi da confermare)')
    expect(t).toContain('Top: Vimar Eikon — sovrapprezzo per frutto cambiato non disponibile')
    expect(t).toContain('Uso sempre tubo da 25')
    expect(t).toContain('PRESA10 | Presa 10A / bipresa | punto | 36,00 € | sì')
    expect(t).toContain('Che ricarico metti sul materiale? → 20%')
    expect(t).toContain('- Vimar: 46,6%')
  })
})

describe('reply rules', () => {
  it('builds strict schemas (every object closed)', () => {
    const walk = (s: unknown): void => {
      if (!s || typeof s !== 'object') return
      const o = s as Record<string, unknown>
      if (o.type === 'object') {
        expect(o.additionalProperties).toBe(false)
        expect(Object.keys(o.properties as object).sort()).toEqual([...(o.required as string[])].sort())
      }
      // The API rejects an enum next to a list of types (e.g. ['string', 'null']).
      if (o.enum) expect(typeof o.type).toBe('string')
      Object.values(o).forEach(walk)
    }
    for (const mode of ['conversation', 'generate', 'revise', 'apply'] as const) walk(replySchema(mode))
  })

  it('stays within the API limit of 16 union-typed parameters', () => {
    const count = (s: unknown): number => {
      if (!s || typeof s !== 'object') return 0
      const o = s as Record<string, unknown>
      const own = o.anyOf || Array.isArray(o.type) ? 1 : 0
      return own + Object.values(o).reduce<number>((n, v) => n + count(v), 0)
    }
    for (const mode of ['conversation', 'generate', 'revise', 'apply'] as const) expect(count(replySchema(mode))).toBeLessThanOrEqual(16)
  })

  it('turns "unknown" values back into null', () => {
    const sheet = {
      tipo_lavoro: 'Ricablaggio', metodo: [], squadra: { persone: 2, aiutante: 'non_so', giorni: 0, ore_giorno: 0 }, ambienti: [],
      punti: 0, frutti: 'non_so', quadro: '', dico: 'inclusa', altro: [], mancanti: ['giorni'],
    }
    const q = normalizeReply({
      job_sheet: sheet,
      reply: { type: 'questions', understanding: 'x', method_proposal: [], questions: [{ id: 'a', text: 'Quanti giorni?', why: 'w', options: ['1', '2'], multi: false }], challenges: [{ text: 'c', question_id: '' }] },
    })
    expect(q.job_sheet.squadra).toEqual({ persone: 2, aiutante: null, giorni: null, ore_giorno: null })
    expect(q.job_sheet).toMatchObject({ punti: null, frutti: null, quadro: null, dico: 'inclusa' })
    expect(q.type === 'questions' && q.method_proposal).toBeNull()
    expect(q.type === 'questions' && q.challenges[0].question_id).toBeNull()

    const line = { line_id: 'L1', kind: 'ore', worker: 'nessuno', price_item_code: '', catalogue_code: '', description: 'd', qty: 3, unit: 'h', unit_price: 0, source: 'tuo_listino', why: '', quantity_estimated: false, price_missing: false, replaces_device: false, is_certificate: false }
    const t = { series: '', what_you_get: [] }
    const quote = normalizeReply({
      job_sheet: sheet,
      reply: { type: 'quote', title: 't', summary: 's', sections: [{ name: 'S', icon: 'other', method: 'punto', method_why: '', lines: [line] }], tiers: { offered: false, base: t, consigliata: t, top: t }, build_notes: [], assumptions: [], exclusions: [], to_check: [{ text: 'x', line_id: 'L1' }], estimated_days: 0, team: { persone: 0, giorni: 0, ore_giorno: 0 } },
    })
    expect(quote.type === 'quote' && quote.sections[0].lines[0]).toMatchObject({ worker: null, price_item_code: null, catalogue_code: null, unit_price: null })
    expect(quote.type === 'quote' && [quote.tiers, quote.estimated_days, quote.team]).toEqual([null, null, null])
  })
})
