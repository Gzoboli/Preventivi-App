import { describe, expect, it } from 'vitest'
import {
  EMPTY_JOB_SHEET,
  aggregate,
  diffQuotes,
  normalizeJobSheet,
  priceQuote,
  removeLines,
  validate,
  type AiLine,
  type AiQuote,
  type PricingInputs,
} from '../../supabase/functions/_shared/pricing.ts'

const ctx: PricingInputs = {
  priceItems: [
    { code: 'INT', price_eur: 30 },
    { code: 'PRESA10', price_eur: 36 },
    { code: 'DICO_ESIST', price_eur: 300 },
  ],
  hourlyRate: 40,
  helperRate: 25,
  markupPct: 20,
  discounts: { bticino: 50, vimar: 40 },
  defaultDiscountPct: 46.6,
  catalogue: {
    K4003: { codice: 'K4003', marca: 'BTicino', descrizione: 'L.NOW - DEVIATORE', prezzo_listino_eur: 14.69, unita: 'pz' },
  },
  uplift: { media: 5, top: 15 },
  hoursPerDay: 8,
  vatRate: 10,
}

let n = 0
function line(p: Partial<AiLine>): AiLine {
  n += 1
  return {
    line_id: `L${n}`,
    kind: 'punto',
    worker: null,
    price_item_code: null,
    catalogue_code: null,
    description: `Voce ${n}`,
    qty: 1,
    unit: 'punto',
    unit_price: null,
    source: 'tuo_listino',
    why: '',
    quantity_estimated: false,
    price_missing: false,
    replaces_device: false,
    is_certificate: false,
    ...p,
  }
}

function quote(sections: AiQuote['sections'], extra: Partial<AiQuote> = {}): AiQuote {
  return {
    type: 'quote',
    job_sheet: { ...EMPTY_JOB_SHEET, dico: 'inclusa' },
    title: 'Prova',
    summary: '',
    sections,
    tiers: null,
    build_notes: [],
    assumptions: [],
    exclusions: [],
    to_check: [],
    estimated_days: null,
    team: null,
    ...extra,
  }
}

const section = (lines: AiLine[], method: AiQuote['sections'][number]['method'] = 'punto') => ({
  name: 'Soggiorno',
  icon: 'living' as const,
  method,
  method_why: '',
  lines,
})

describe('pricing', () => {
  it('uses his price list, his rates and the catalogue with the brand discount and his markup', () => {
    const q = quote([
      section([
        line({ line_id: 'p', price_item_code: 'PRESA10', qty: 4 }),
        line({ line_id: 'h', kind: 'ore', worker: 'titolare', qty: 12, unit: 'h' }),
        line({ line_id: 'a', kind: 'ore', worker: 'aiutante', qty: 12, unit: 'h' }),
        line({ line_id: 'm', kind: 'materiale', catalogue_code: 'k4003', qty: 2, unit: 'pz', source: 'catalogo' }),
      ]),
    ])
    const t = priceQuote(q, ctx)
    const byId = Object.fromEntries(t.lines.map((l) => [l.line_id, l]))
    expect(byId.p).toMatchObject({ unit_price: 36, total: 144, price_source: 'listino' })
    expect(byId.h).toMatchObject({ unit_price: 40, total: 480, price_source: 'tariffa' })
    expect(byId.a).toMatchObject({ unit_price: 25, total: 300, price_source: 'tariffa' })
    // 14,69 × (1 − 50%) × (1 + 20%) = 8,814 → 8,81
    expect(byId.m).toMatchObject({ unit_price: 8.81, total: 17.62, price_source: 'catalogo' })
    expect(byId.m.breakdown).toContain('50% sconto')
    expect(t.single.imponibile).toBe(941.62)
    expect(t.single.totale).toBe(1035.78)
  })

  it('a price he said wins; an estimated material gets discount and markup; nothing found → prezzo mancante', () => {
    const q = quote([
      section([
        line({ line_id: 'said', price_item_code: 'INT', unit_price: 28, source: 'detto_da_te' }),
        line({ line_id: 'cable', kind: 'materiale', unit_price: 100, qty: 1, source: 'mia_stima' }),
        line({ line_id: 'none', kind: 'materiale', qty: 3 }),
      ]),
    ])
    const t = priceQuote(q, ctx)
    const byId = Object.fromEntries(t.lines.map((l) => [l.line_id, l]))
    expect(byId.said).toMatchObject({ unit_price: 28, price_source: 'detto' })
    expect(byId.cable).toMatchObject({ unit_price: 64.08, price_source: 'stima' }) // 100 × 0,534 × 1,2
    expect(byId.none).toMatchObject({ unit_price: 0, price_missing: true, price_source: 'mancante' })
    expect(t.missing_count).toBe(1)
  })

  it('includes the certificate when he does the job', () => {
    const cert = line({ line_id: 'dico', kind: 'forfait', price_item_code: 'DICO_ESIST' })
    expect(priceQuote(quote([section([cert])]), ctx).lines[0]).toMatchObject({ unit_price: 0, price_source: 'inclusa' })
    const byOthers = quote([section([cert])], { job_sheet: { ...EMPTY_JOB_SHEET, dico: 'forfait' } })
    expect(priceQuote(byOthers, ctx).lines[0]).toMatchObject({ unit_price: 300, price_source: 'listino' })
  })

  it('shows one price when no device is replaced; otherwise the surcharge applies to replaced devices only', () => {
    const tiers = {
      base: { series: 'Plana', what_you_get: [] },
      consigliata: { series: 'Arké', what_you_get: [] },
      top: { series: 'Eikon', what_you_get: [] },
    }
    const kept = quote([section([line({ price_item_code: 'INT', qty: 10 })])], { tiers })
    expect(priceQuote(kept, ctx).tiers).toBeNull()

    const replaced = quote(
      [section([line({ price_item_code: 'INT', qty: 10 }), line({ price_item_code: 'PRESA10', qty: 4, replaces_device: true })])],
      { tiers },
    )
    const t = priceQuote(replaced, ctx)
    expect(t.device_points).toBe(4)
    expect(t.tiers?.base.imponibile).toBe(444)
    expect(t.tiers?.media.imponibile).toBe(464) // + 4 × 5 €
    expect(t.tiers?.top.imponibile).toBe(504) // + 4 × 15 €
  })

  it('recomputes from stored unit prices after a manual edit', () => {
    const q = quote([section([line({ line_id: 'x', price_item_code: 'INT', qty: 2 })])])
    const t = priceQuote(q, ctx)
    const edited = { ...q, sections: [{ ...q.sections[0], lines: [{ ...q.sections[0].lines[0], qty: 5 }] }] }
    const t2 = aggregate(edited, t.lines, { vatRate: 22, uplift: t.uplift, hoursPerDay: 8 })
    expect(t2.lines[0].total).toBe(150)
    expect(t2.single.totale).toBe(183)
  })

  it('prices the optional extra from his price list, never from the AI', () => {
    const q = quote([section([line({ price_item_code: 'INT' })])], {
      client_upgrade: { text: 'Vuole cambiare anche gli altri 7 interruttori?', detail: '', price_item_code: 'INT', qty: 7 },
    })
    expect(priceQuote(q, ctx).upgrade).toEqual({ imponibile: 210 })
    const unknown = { ...q, client_upgrade: { ...q.client_upgrade!, price_item_code: 'NON_ESISTE' } }
    expect(priceQuote(unknown, ctx).upgrade).toBeNull()
    expect(priceQuote(quote([section([line({})])]), ctx).upgrade).toBeNull()
  })
})

describe('validator', () => {
  it('catches a forced double count (rewiring by the hour AND per point) and offers to remove the point lines', () => {
    const q = quote([
      section(
        [
          line({ line_id: 'ore', kind: 'ore', worker: 'titolare', qty: 16, unit: 'h' }),
          line({ line_id: 'cavo', kind: 'materiale', unit_price: 1, qty: 400, unit: 'm', source: 'mia_stima' }),
          line({ line_id: 'punti', kind: 'punto', price_item_code: 'INT', qty: 10, description: 'Punto comando' }),
        ],
        'ore_materiali',
      ),
    ])
    const flags = validate(q, 8)
    expect(flags).toHaveLength(1)
    expect(flags[0]).toMatchObject({ code: 'double_count', line_ids: ['punti'], fix: 'remove_lines' })
    expect(flags[0].message).toContain('Possibile doppio conteggio')
    expect(validate(removeLines(q, flags[0].line_ids), 8)).toEqual([])
    expect(priceQuote(q, ctx).flags[0].code).toBe('double_count')
  })

  it('flags hours that do not match the team (±25%)', () => {
    const sheet = { ...EMPTY_JOB_SHEET, squadra: { persone: 2, aiutante: true, giorni: 2, ore_giorno: null } }
    const mk = (h: number) => quote([section([line({ kind: 'ore', worker: 'titolare', qty: h, unit: 'h' })], 'ore_materiali')], { job_sheet: sheet })
    expect(validate(mk(32), 8)).toEqual([]) // 2 × 2 × 8
    expect(validate(mk(26), 8)).toEqual([]) // within 25%
    const flags = validate(mk(12), 8)
    expect(flags[0].code).toBe('hours_mismatch')
    expect(flags[0].message).toContain('2 persone × 2 giorni × 8 ore fanno 32 ore')
  })
})

describe('versions', () => {
  it('lists what changed between two versions', () => {
    const a = quote([section([line({ line_id: 'c', description: 'Cavo', qty: 550, unit: 'm' }), line({ line_id: 'd', description: 'Sfilaggio' })])])
    const b = quote([section([line({ line_id: 'c', description: 'Cavo', qty: 400, unit: 'm' }), line({ line_id: 'e', description: 'Collaudo' })])])
    const changes = diffQuotes(a, b)
    expect(changes).toEqual([
      expect.objectContaining({ kind: 'cambiata', line_id: 'c', detail: 'quantità 550 → 400' }),
      expect.objectContaining({ kind: 'aggiunta', line_id: 'e' }),
      expect.objectContaining({ kind: 'tolta', line_id: 'd' }),
    ])
  })

  it('normalizes a stored job sheet', () => {
    expect(normalizeJobSheet({})).toEqual(EMPTY_JOB_SHEET)
    expect(normalizeJobSheet({ squadra: { persone: 2 } }).squadra).toEqual({ persone: 2, aiutante: null, giorni: null, ore_giorno: null })
  })
})
