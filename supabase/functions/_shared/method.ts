// Turns the electrician's "Il mio metodo" into (a) readable Italian context for the AI and
// (b) the numbers the pricing needs. Unanswered questions use the same usual values as the app.
import {
  ALTRO,
  DEFAULT_DISCOUNT_PCT,
  QUESTIONS,
  SERIES,
  TIERS,
  getQuestion,
  type QuestionId,
  type TierId,
} from './questions.ts'
import {
  discountPct,
  effectiveAnswer,
  formatAnswer,
  parseItalianNumber,
  seriesValue,
  type Answers,
} from './answers.ts'
import { formatEur, formatNumber } from './format.ts'
import type { PricingInputs } from './pricing.ts'

export type PriceRow = { code: string; name: string; category: string | null; unit: string; price_eur: number | null; includes_material: boolean }
export type UpliftRow = { marca: string; serie: string; uplift_per_point_eur: number | null; short_description?: string | null }
export type DiscountRow = { brand: string; discount_pct: number | null }

/** Number from a single-choice answer ("60" or Altro "55 €"); null for non-numeric choices. */
function numberFrom(answers: Answers, id: QuestionId): number | null {
  const a = effectiveAnswer(answers, id)
  const v = a.value
  if (v === ALTRO) return a.custom_text ? parseItalianNumber(a.custom_text) : null
  const n = Number(v)
  return typeof v === 'string' && Number.isFinite(n) ? n : null
}

/** q15: 'dipende' | 'a_punto' | 'ore_materiali' | 'altro'. */
export function pricingMethod(answers: Answers): string {
  return effectiveAnswer(answers, 'q15').value as string
}

/** Hours in a working day, only when the electrician answered q18 (otherwise the AI asks). */
export function answeredHoursPerDay(answers: Answers): number | null {
  return effectiveAnswer(answers, 'q18').source === 'user' ? numberFrom(answers, 'q18') : null
}

/** Series chosen for a tier: a catalogue series, or free text typed in "Altro…". */
export function seriesForTier(answers: Answers, tier: TierId): { marca: string; serie: string; label: string } | { label: string } {
  const pick = seriesValue(effectiveAnswer(answers, 'q7'))[tier]
  if (!pick || pick.choice === ALTRO) return { label: pick?.custom?.trim() || 'Da definire' }
  const s = SERIES.find((x) => x.id === pick.choice)
  return s ? { marca: s.marca, serie: s.serie, label: s.label } : { label: pick.choice }
}

/** Markup on materials, % (q17). */
export function markupPct(answers: Answers): number {
  return numberFrom(answers, 'q17') ?? 0
}

/**
 * Wholesaler discount for a brand, %: the `discounts` row for that brand, else the q6 answer,
 * else the usual 46,6%.
 */
export function discountFor(brand: string | null, discounts: DiscountRow[], answers: Answers): number {
  const row = brand ? discounts.find((d) => d.brand.toLowerCase() === brand.toLowerCase()) : undefined
  if (row?.discount_pct != null) return Number(row.discount_pct)
  return discountPct(effectiveAnswer(answers, 'q6')) ?? DEFAULT_DISCOUNT_PCT
}

function listUplift(s: ReturnType<typeof seriesForTier>, rows: UpliftRow[]): number | null {
  if (!('marca' in s)) return null
  const row = rows.find(
    (r) => r.marca.toLowerCase() === s.marca.toLowerCase() && r.serie.toLowerCase() === s.serie.toLowerCase(),
  )
  return row?.uplift_per_point_eur ?? null
}

/**
 * Extra € per replaced device for a tier, charged to the client.
 * `series_uplift` holds the list-price cost of a typical point (switch + share of plate and
 * support) above the cheapest series; the electrician's per-point prices are taken to be for
 * their Base series, so the tier pays the difference from Base, at net cost plus markup.
 */
export function upliftFor(answers: Answers, tier: TierId, rows: UpliftRow[], discounts: DiscountRow[] = []): number | null {
  const s = seriesForTier(answers, tier)
  const up = listUplift(s, rows)
  if (up == null) return null
  const base = listUplift(seriesForTier(answers, 'base'), rows) ?? 0
  const brand = 'marca' in s ? s.marca : null
  const factor = (1 - discountFor(brand, discounts, answers) / 100) * (1 + markupPct(answers) / 100)
  return Math.round(Math.max(0, up - base) * factor * 100) / 100
}

/** Everything the pricing needs except the catalogue lookups (added by the edge function). */
export function pricingInputs(
  answers: Answers,
  priceItems: { code: string; price_eur: number | null }[],
  discounts: DiscountRow[],
  uplifts: UpliftRow[],
  vatRate: number,
): PricingInputs {
  const helper = effectiveAnswer(answers, 'q4').value
  return {
    priceItems,
    hourlyRate: numberFrom(answers, 'q3'),
    helperRate: helper === 'nessuno' ? null : numberFrom(answers, 'q4'),
    markupPct: markupPct(answers),
    discounts: Object.fromEntries(
      [...new Set([...discounts.map((d) => d.brand), ...SERIES.map((s) => s.marca)])].map((b) => [
        b.toLowerCase(),
        discountFor(b, discounts, answers),
      ]),
    ),
    defaultDiscountPct: discountFor(null, discounts, answers),
    catalogue: {},
    uplift: { media: upliftFor(answers, 'media', uplifts, discounts), top: upliftFor(answers, 'top', uplifts, discounts) },
    hoursPerDay: numberFrom(answers, 'q18'),
    vatRate,
  }
}

/** Default IVA for a new quote from "IVA che applichi di solito" (10 when "caso per caso" or unknown). */
export function defaultVatRate(answers: Answers): 4 | 10 | 22 {
  const n = numberFrom(answers, 'q10')
  return n === 22 || n === 4 ? n : 10
}

const fmt = (n: number | null) => (n == null ? 'senza prezzo' : formatEur(n))

/** Italian description of how this electrician works, for the AI. */
export function methodText(
  answers: Answers,
  notes: string | null,
  priceItems: PriceRow[],
  uplifts: UpliftRow[],
  discounts: DiscountRow[] = [],
): string {
  const lines: string[] = ['## Come lavora questo elettricista']
  for (const q of QUESTIONS) {
    if (q.id === 'q5') continue // the price list below says it better
    const a = effectiveAnswer(answers, q.id)
    const origin = a.source === 'user' ? 'risposta dell’elettricista' : 'valore standard, non confermato'
    lines.push(`- ${getQuestion(q.id).title} → ${formatAnswer(q.id, a)} (${origin})`)
  }

  lines.push('', '## Sconti dal grossista (sul prezzo di listino)')
  const brands = [...new Set([...discounts.map((d) => d.brand), ...SERIES.map((s) => s.marca)])]
  for (const b of brands) lines.push(`- ${b}: ${formatNumber(discountFor(b, discounts, answers))}%`)
  lines.push(`- Altre marche: ${formatNumber(discountFor(null, discounts, answers))}%`)

  lines.push('', '## Serie per le tre opzioni')
  for (const t of TIERS) {
    const s = seriesForTier(answers, t.id)
    const up = 'marca' in s ? upliftFor(answers, t.id, uplifts, discounts) : null
    const extra =
      t.id === 'base'
        ? ''
        : up == null
          ? ' — sovrapprezzo per frutto cambiato non disponibile'
          : ` — sovrapprezzo stimato dai listini ${fmt(up)} per ogni frutto cambiato (ipotesi da confermare)`
    lines.push(`- ${t.label}: ${s.label}${extra}`)
  }

  if (notes?.trim()) lines.push('', '## Note dell’elettricista (scritte da lui)', notes.trim())

  lines.push(
    '',
    '## Listino a punto dell’elettricista (prezzi finali al cliente, IVA esclusa)',
    'codice | voce | unità | prezzo | materiale incluso',
    ...priceItems.map(
      (p) => `${p.code} | ${p.name} | ${p.unit} | ${fmt(p.price_eur)} | ${p.includes_material ? 'sì' : 'no'}`,
    ),
  )
  return lines.join('\n')
}
