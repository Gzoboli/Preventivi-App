import { describe, expect, it } from 'vitest'
import {
  anchorPrice,
  applyPercent,
  discountPct,
  effectiveAnswer,
  firstUnansweredScreen,
  formatAnswer,
  parseItalianNumber,
  priceChanges,
  remainingScreens,
  roundTo10Cents,
  screensFor,
  type Answers,
} from './answers'
import { PRICE_ANCHORS, QUESTIONS } from './questions'

const STARTER = [
  { code: 'INT', price_eur: 29.3 },
  { code: 'INT2P', price_eur: 36.4 },
  { code: 'PULS', price_eur: 29.3 },
  { code: 'PRESA10', price_eur: 32 },
  { code: 'PRESAUNI', price_eur: 36.3 },
  { code: 'PRESATV', price_eur: 44.2 },
  { code: 'PLUCE', price_eur: 18 },
  { code: 'CENTR8', price_eur: 62 },
  { code: 'MTDIFF', price_eur: 84 },
  { code: 'MT1', price_eur: 21 },
  { code: 'DICO_ESIST', price_eur: 300 },
]

describe('questions', () => {
  it('have unique ids and valid defaults, never containing "altro"', () => {
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length)
    for (const q of QUESTIONS) {
      if (q.kind === 'single' || q.kind === 'multi') {
        const ids = q.options.map((o) => o.id)
        expect(q.defaults.length).toBeGreaterThan(0)
        for (const d of q.defaults) expect(ids).toContain(d)
        expect(ids).not.toContain('altro')
      }
    }
  })

  it('every price row has 4 amounts and a positive base', () => {
    for (const a of PRICE_ANCHORS) {
      expect(a.options).toHaveLength(4)
      expect(a.base).toBeGreaterThan(0)
      expect(a.code || a.scale?.length).toBeTruthy()
    }
  })

  it('onboarding has 4 screens: method, team and rates, prices, materials', () => {
    expect(screensFor({})).toEqual([['q15'], ['q3', 'q4', 'q16', 'q18'], ['q5'], ['q6', 'q17']])
  })
})

describe('numbers', () => {
  it('rounds to 0,10 € and applies percentages', () => {
    expect(roundTo10Cents(29.34)).toBe(29.3)
    expect(roundTo10Cents(29.35)).toBe(29.4)
    expect(applyPercent(29.3, 10)).toBe(32.2)
    expect(applyPercent(300, 10)).toBe(330)
  })
  it('parses Italian numbers', () => {
    expect(parseItalianNumber('29,30')).toBe(29.3)
    expect(parseItalianNumber('1.234,5 €')).toBe(1234.5)
    expect(parseItalianNumber('42%')).toBe(42)
    expect(parseItalianNumber('')).toBeNull()
    expect(parseItalianNumber('abc')).toBeNull()
    expect(parseItalianNumber('-3')).toBeNull()
  })
})

describe('progress', () => {
  it('counts remaining screens and finds where to resume', () => {
    expect(remainingScreens({})).toBe(4)
    const a: Answers = { q15: { value: 'a_punto', source: 'user' }, q3: { value: '50', source: 'user' } }
    expect(remainingScreens(a)).toBe(3) // screen 2 needs q3, q4, q16 and q18
    expect(firstUnansweredScreen(a)).toBe(2)
  })

  it('keeps answers given to the replaced questions (q2 → q15, q5m → q17)', () => {
    const old: Answers = { q2: { value: 'a_ore', source: 'user' }, q5m: { value: '30', source: 'user' } }
    expect(effectiveAnswer(old, 'q15')).toEqual({ value: 'ore_materiali', source: 'user' })
    expect(effectiveAnswer({ q2: { value: 'misto', source: 'user' } }, 'q15').value).toBe('dipende')
    expect(effectiveAnswer(old, 'q17')).toEqual({ value: '30', source: 'user' })
    expect(firstUnansweredScreen(old)).toBe(2) // screen 1 counts as answered
    expect(effectiveAnswer({}, 'q15')).toEqual({ value: 'dipende', source: 'default' })
  })

  it('uses the usual answer when missing or stored in an older shape', () => {
    expect(effectiveAnswer({}, 'q3')).toEqual({ value: '60', source: 'default' })
    const old: Answers = { q6: { value: { brands: {} }, source: 'user' } } // v1 per-brand shape
    expect(effectiveAnswer(old, 'q6')).toEqual({ value: 'non_so', source: 'default' })
    expect(remainingScreens(old)).toBe(4)
  })
})

describe('typical prices → price list', () => {
  it('reads exact "Altro…" prices and ignores "Non so"', () => {
    expect(anchorPrice({ choice: '36' })).toBe(36)
    expect(anchorPrice({ choice: 'altro', custom: '34,50' })).toBe(34.5)
    expect(anchorPrice({ choice: 'altro', custom: 'boh' })).toBeNull()
    expect(anchorPrice({ choice: 'non_so' })).toBeNull()
  })

  it('sets the item price and scales related items from the starter prices', () => {
    const changes = priceChanges({ presa: { choice: '36' }, quadro: { choice: '300' } }, STARTER)
    const byCode = Object.fromEntries(changes.map((c) => [c.code, c.price_eur]))
    expect(byCode.PRESA10).toBe(36)
    expect(byCode.PRESAUNI).toBe(40.8) // 36.3 × 36/32 = 40.84
    // panel: base 62+84+5×21 = 251 → ×300/251
    expect(byCode.CENTR8).toBe(74.1)
    expect(byCode.MTDIFF).toBe(100.4)
    expect(byCode.MT1).toBe(25.1)
    expect(byCode.INT).toBeUndefined() // not answered
  })

  it('creates items missing from the starter list', () => {
    const [c] = priceChanges({ clima: { choice: 'altro', custom: '125' } }, STARTER)
    expect(c.code).toBe('CLIMA')
    expect(c.price_eur).toBe(125)
    expect(c.create?.name).toContain('condizionatore')
    // existing code → no create
    expect(priceChanges({ tv: { choice: '50' } }, STARTER)[0].create).toBeUndefined()
  })

  it('is idempotent: answering twice gives the same prices', () => {
    const p = { comando: { choice: '33' } }
    expect(priceChanges(p, STARTER)).toEqual(priceChanges(p, STARTER))
  })
})

describe('display', () => {
  it('formats answers in Italian', () => {
    expect(formatAnswer('q3', { value: 'altro', source: 'user', custom_text: '55 €' })).toBe('55 €')
    expect(formatAnswer('q13', { value: ['macerie', 'altro'], source: 'user', custom_text: 'Citofono' })).toBe(
      'Smaltimento macerie, Citofono',
    )
    expect(formatAnswer('q5', effectiveAnswer({}, 'q5'))).toBe('Listino di partenza')
    const prices = formatAnswer('q5', {
      value: { presa: { choice: '36' }, tv: { choice: 'non_so' }, clima: { choice: 'altro', custom: '125,5' } },
      source: 'user',
    })
    // Intl uses a non-breaking space before "€"
    expect(prices.replace(/ /g, ' ')).toBe('Presa 10A / bipresa 36 € · Predisposizione condizionatore 125,50 €')
    expect(formatAnswer('q6', effectiveAnswer({}, 'q6'))).toBe('Non so (usiamo il 46,6%)')
    expect(formatAnswer('q7', effectiveAnswer({}, 'q7'))).toBe('Vimar Plana / Vimar Arké / Vimar Eikon')
  })

  it('computes the discount', () => {
    expect(discountPct({ value: 'non_so', source: 'user' })).toBeNull()
    expect(discountPct({ value: '45', source: 'user' })).toBe(45)
    expect(discountPct({ value: 'altro', source: 'user', custom_text: '42,5' })).toBe(42.5)
  })
})
