// Turns the electrician's "Il mio metodo" into (a) readable Italian context for the AI and
// (b) the numbers the totals need. Unanswered questions use the same usual values as the app.
import {
  ALTRO,
  DEFAULT_DISCOUNT_PCT,
  QUESTIONS,
  SERIES,
  TIERS,
  getQuestion,
  type QuestionId,
} from './questions.ts'
import {
  discountPct,
  effectiveAnswer,
  formatAnswer,
  parseItalianNumber,
  seriesValue,
  type Answers,
} from './answers.ts'
import type { PricingContext, TierId } from './totals.ts'

type PriceRow = { code: string; name: string; category: string | null; unit: string; price_eur: number | null; includes_material: boolean }
type UpliftRow = { marca: string; serie: string; uplift_per_point_eur: number | null; short_description?: string | null }

/** Number from a single-choice answer ("60" or Altro "55 €"); null for non-numeric choices. */
function numberFrom(answers: Answers, id: QuestionId): number | null {
  const a = effectiveAnswer(answers, id)
  const v = a.value
  if (v === ALTRO) return a.custom_text ? parseItalianNumber(a.custom_text) : null
  const n = Number(v)
  return typeof v === 'string' && Number.isFinite(n) ? n : null
}

export function pricingMethod(answers: Answers): string {
  return effectiveAnswer(answers, 'q2').value as string
}

/** Series chosen for a tier: a catalogue series, or free text typed in "Altro…". */
export function seriesForTier(answers: Answers, tier: TierId): { marca: string; serie: string; label: string } | { label: string } {
  const pick = seriesValue(effectiveAnswer(answers, 'q7'))[tier]
  if (!pick || pick.choice === ALTRO) return { label: pick?.custom?.trim() || 'Da definire' }
  const s = SERIES.find((x) => x.id === pick.choice)
  return s ? { marca: s.marca, serie: s.serie, label: s.label } : { label: pick.choice }
}

/**
 * Discount and markup applied to catalogue list prices, as a single multiplier:
 * list × (1 − wholesaler discount) × (1 + markup on materials).
 */
export function materialFactor(answers: Answers): number {
  const discount = discountPct(effectiveAnswer(answers, 'q6')) ?? DEFAULT_DISCOUNT_PCT
  const markup = numberFrom(answers, 'q5m') ?? 0
  return (1 - discount / 100) * (1 + markup / 100)
}

function listUplift(s: ReturnType<typeof seriesForTier>, rows: UpliftRow[]): number | null {
  if (!('marca' in s)) return null
  const row = rows.find(
    (r) => r.marca.toLowerCase() === s.marca.toLowerCase() && r.serie.toLowerCase() === s.serie.toLowerCase(),
  )
  return row?.uplift_per_point_eur ?? null
}

/**
 * Extra € per point for a tier, charged to the client.
 * `series_uplift` holds the list-price cost of a typical point (switch + share of plate and
 * support) above the cheapest series; the electrician's per-point prices are taken to be for
 * their Base series, so the tier pays the difference from Base, at net cost plus markup.
 */
export function upliftFor(answers: Answers, tier: TierId, rows: UpliftRow[], factor = materialFactor(answers)): number | null {
  const up = listUplift(seriesForTier(answers, tier), rows)
  if (up == null) return null
  const base = listUplift(seriesForTier(answers, 'base'), rows) ?? 0
  return Math.round(Math.max(0, up - base) * factor * 100) / 100
}

export function pricingContext(
  answers: Answers,
  priceItems: { code: string; price_eur: number | null }[],
  vatRate: number,
  uplifts: UpliftRow[],
): PricingContext {
  const helper = effectiveAnswer(answers, 'q4').value
  return {
    priceItems,
    hourlyRate: numberFrom(answers, 'q3'),
    helperRate: helper === 'nessuno' ? null : numberFrom(answers, 'q4'),
    discountPct: discountPct(effectiveAnswer(answers, 'q6')) ?? DEFAULT_DISCOUNT_PCT,
    markupPct: numberFrom(answers, 'q5m') ?? 0,
    vatRate,
    uplift: { media: upliftFor(answers, 'media', uplifts), top: upliftFor(answers, 'top', uplifts) },
  }
}

/** Default IVA for a new quote from "IVA che applichi di solito" (10 when "caso per caso" or unknown). */
export function defaultVatRate(answers: Answers): 4 | 10 | 22 {
  const n = numberFrom(answers, 'q10')
  return n === 22 || n === 4 ? n : 10
}

const fmt = (n: number | null) =>
  n == null ? 'senza prezzo' : `${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

/** Italian description of how this electrician works, for the AI. */
export function methodText(answers: Answers, notes: string | null, priceItems: PriceRow[], uplifts: UpliftRow[]): string {
  const lines: string[] = ['## Come lavora questo elettricista']
  for (const q of QUESTIONS) {
    if (q.id === 'q5') continue // the price list below says it better
    if (q.id === 'q5m' && pricingMethod(answers) !== 'a_ore' && pricingMethod(answers) !== 'misto') continue
    const a = effectiveAnswer(answers, q.id)
    const origin = a.source === 'user' ? 'risposta dell’elettricista' : 'valore standard, non confermato'
    lines.push(`- ${getQuestion(q.id).title} → ${formatAnswer(q.id, a)} (${origin})`)
  }

  lines.push('', '## Serie per le tre opzioni')
  for (const t of TIERS) {
    const s = seriesForTier(answers, t.id)
    const up = 'marca' in s ? upliftFor(answers, t.id, uplifts) : null
    const extra = t.id === 'base' ? '' : up == null ? ' — sovrapprezzo per punto non disponibile' : ` — sovrapprezzo stimato dai listini ${fmt(up)} per punto (ipotesi da confermare)`
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
