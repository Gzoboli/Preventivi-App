import { describe, expect, it } from 'vitest'
import { buildClientQuote, fileName, sectionIcon } from './clientQuote'
import { contrastWithWhite, palette } from './colors'
import { JOB2_INTERNAL, job2Input, job2TiersInput } from './job2.fixture'

describe('client PDF model (job 2 of the reference)', () => {
  const q = buildClientQuote(job2Input())

  it('has the prices of the reference: 1.650,26 € + IVA 10% = 1.815,29 €', () => {
    expect(q.single).toEqual({ imponibile: 1650.26, totale: 1815.29 })
    expect(q.totals).toEqual({ imponibile: 1650.26, iva: 165.03, totale: 1815.29 })
    expect(q.sections.map((s) => s.amount)).toEqual([919.2, 328.76, 314.4, 87.9, 0])
    expect(q.sections[4]).toMatchObject({ included: true, icon: 'cert' })
    expect(q.upgrade).toEqual({
      text: 'Vuole cambiare anche gli altri 7 interruttori?',
      detail: 'Stessa serie Vimar Plana, tutto coordinato.',
      price: 225.61,
    })
  })

  it('shows 4 tiles (the free certificate stays on page 2) with the right icons', () => {
    expect(q.tiles.map((t) => [t.icon, t.name])).toEqual([
      ['cable', 'Cavi nuovi'],
      ['board', 'Quadro nuovo'],
      ['line', 'Linea tra i piani'],
      ['switch', '3 interruttori nuovi'],
    ])
  })

  it('fills header, info strip, payment and clause', () => {
    expect(q.company).toMatchObject({ name: 'Elettrica Esempio s.a.s.', initials: 'EE' })
    expect(q.number).toBe('2026/014')
    expect(q.date).toBe('7 ottobre 2026')
    expect(q.info.map((i) => i.value)).toEqual(['circa 2 giorni', '60 giorni', '30% inizio, saldo a fine'])
    expect(q.payment).toEqual(['30% all’inizio dei lavori', 'Saldo a fine lavori, con la consegna della dichiarazione di conformità'])
    expect(q.clause.find((c) => c.bold)?.text).toBe('nessun lavoro extra senza il suo ok')
    expect(q.priceTable).toBeNull()
    expect(q.fileName).toBe('Preventivo_Sig_Bianchi_2026-014.pdf')
  })

  it('never contains internal information', () => {
    const json = JSON.stringify(q)
    for (const s of JOB2_INTERNAL) expect(json.toLowerCase()).not.toContain(s.toLowerCase())
    expect(json).not.toMatch(/titolare|aiutante|\bore\b|40,00/)
  })

  it('shows hours and rates only in the price table, when switched on', () => {
    const detail = buildClientQuote(job2Input({ showPrices: true }))
    const rows = detail.priceTable![0].rows
    expect(rows[0]).toEqual({ label: 'Manodopera titolare', qty: '12 ore', price: '40,00\u00a0€', total: '480,00\u00a0€' })
    expect(detail.priceTable![4].rows[0].total).toBe('inclusa')
    expect(JSON.stringify(detail)).not.toMatch(/mia stima|Controlla i tubi/i)
  })

  it('says "IVA esclusa" prices when there is no IVA', () => {
    const noVat = buildClientQuote(job2Input({ vatRate: 0 }))
    expect(noVat.single).toEqual({ imponibile: 1650.26, totale: 1650.26 })
    expect(noVat.totals.iva).toBe(0)
    expect(noVat.upgrade?.price).toBe(205.1)
  })

  it('never shows 0 € for a line without a price', () => {
    const input = job2Input()
    const totals = {
      ...input.totals,
      lines: input.totals.lines.map((l) => (l.line_id === input.ai.sections[2].lines[0].line_id ? { ...l, price_missing: true, total: 0 } : l)),
    }
    const m = buildClientQuote({ ...input, totals })
    expect(m.sections[2]).toMatchObject({ amount: null, pending: true })
    expect(m.pendingNote).toBe(true)
  })

  it('falls back for quotes made before the client texts existed', () => {
    const input = job2Input()
    const old = {
      ...input.ai,
      client_notes: undefined,
      client_exclusions: undefined,
      client_upgrade: undefined,
      sections: input.ai.sections.map((s) => ({ ...s, client_summary: undefined, client_points: undefined })),
    }
    const m = buildClientQuote({ ...input, ai: old, answers: {} })
    expect(m.notes).toEqual(['Tubi riutilizzabili'])
    expect(m.exclusions).toEqual(['Opere murarie e tracce', 'Smaltimento macerie', 'Fornitura e montaggio lampadari', 'Punto luce provvisorio'])
    expect(m.sections[0].points).toEqual(['Cavo FS17 1,5/2,5 mm² K4003'])
    expect(m.upgrade).toBeNull()
  })

  it('merges small sections into "Altro" beyond 8 tiles', () => {
    const input = job2Input()
    // Without the optional extra there is room for two rows of tiles.
    const many = { ...input.ai, client_upgrade: null, sections: Array.from({ length: 10 }, (_, i) => ({ ...input.ai.sections[3], name: `Stanza ${i + 1}` })) }
    expect(buildClientQuote({ ...input, ai: many }).tiles).toHaveLength(8)
    expect(buildClientQuote({ ...input, ai: many }).tiles[7].name).toBe('Altro')
  })
})

describe('client PDF model with three options', () => {
  it('builds Base / Consigliata / Top and details the chosen one', () => {
    const q = buildClientQuote(job2TiersInput())
    expect(q.single).toBeNull()
    expect(q.tiers!.map((t) => [t.label, t.plate, t.recommended])).toEqual([
      ['Base', 'flat_white', false],
      ['Consigliata', 'colored_round', true],
      ['Top', 'glass_dark', false],
    ])
    // 3 replaced switches × 6,50 € on the Consigliata option
    expect(q.totals.imponibile).toBe(1669.76)
    expect(q.sections[3].amount).toBe(107.4)
    expect(q.tiers![1].totale).toBe(1836.74)
    const base = buildClientQuote(job2TiersInput({ tier: 'base' }))
    expect(base.totals.imponibile).toBe(1650.26)
  })
})

describe('colours', () => {
  it('keeps a dark colour and darkens a light one until white text is readable', () => {
    expect(palette('#0E7C66').accent).toBe('#0E7C66')
    const light = palette('#FFE14D')
    expect(contrastWithWhite(light.accent)).toBeGreaterThanOrEqual(4.5)
    expect(palette('#1F5EFF').soft).toBe('#E9EFFF')
    expect(palette(null).accent).toBe('#1F5EFF')
  })
})

describe('helpers', () => {
  it('names the file and picks icons', () => {
    expect(fileName('Rossi & Figli', 2026, 3)).toBe('Preventivo_Rossi_Figli_2026-003.pdf')
    expect(fileName(null, 2026, 3)).toBe('Preventivo_Cliente_2026-003.pdf')
    expect(sectionIcon({ name: 'Videocitofono', icon: 'other', lines: [] })).toBe('intercom')
    expect(sectionIcon({ name: 'Punti luce soggiorno', icon: 'living', lines: [] })).toBe('light')
    expect(sectionIcon({ name: 'Varie', icon: 'other', lines: [] })).toBe('generic')
  })
})
