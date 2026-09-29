// Shared by the app (Vite) and Edge Functions (Deno): pure TypeScript, no imports outside _shared.
import {
  ALTRO,
  NON_SO,
  ONBOARDING_SCREEN_COUNT,
  PRICE_ANCHORS,
  SERIES,
  SERIES_DEFAULTS,
  TIERS,
  getQuestion,
  onboardingScreens,
  type PriceAnchor,
  type Question,
  type QuestionId,
  type TierId,
} from './questions.ts'

/** Same shape as the generated Supabase Json type (kept here so Deno needs no app imports). */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type AnswerSource = 'user' | 'default'

/** One answer as stored in profiles.onboarding_answers[questionId]. */
export type Answer<V extends Json = Json> = {
  value: V
  source: AnswerSource
  /** Text typed in "Altro…" (choice questions). */
  custom_text?: string
}

/** A choice with an optional "Altro…" text (per row in q5, per tier in q7). */
export type Pick = { choice: string; custom?: string }

export type PricesValue = Record<string, Pick>
export type SeriesValue = Record<TierId, Pick>

export type OnboardingMeta = {
  /** User chose "Lo faccio dopo" / "Finisco dopo": don't force the onboarding on login. */
  postponed?: boolean
  /** Last screen reached (0 = welcome, 1..4 = questions), used to resume. */
  step?: number
}

export type Answers = Partial<Record<QuestionId, Answer>> & { _meta?: OnboardingMeta }

// ---------- parsing stored JSON ----------

export function parseAnswers(raw: Json | null | undefined): Answers {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return raw as unknown as Answers
}

export function toJson(answers: Answers): Json {
  return answers as unknown as Json
}

// ---------- defaults ----------

export function defaultValue(q: Question): Json {
  switch (q.kind) {
    case 'single':
      return q.defaults[0]
    case 'multi':
      return [...q.defaults]
    case 'prices':
      return Object.fromEntries(PRICE_ANCHORS.map((a) => [a.id, { choice: NON_SO }]))
    case 'series':
      return Object.fromEntries(TIERS.map((t) => [t.id, { choice: SERIES_DEFAULTS[t.id] }]))
  }
}

export function defaultAnswer(q: Question): Answer {
  return { value: defaultValue(q), source: 'default' }
}

/** True if a stored answer has the shape this question expects (older versions may differ). */
function isValid(q: Question, a: Answer | undefined): a is Answer {
  if (!a || typeof a !== 'object') return false
  const v = a.value
  switch (q.kind) {
    case 'single':
      return typeof v === 'string'
    case 'multi':
      return Array.isArray(v)
    case 'prices':
    case 'series':
      return !!v && typeof v === 'object' && !Array.isArray(v)
  }
}

export function isAnswered(answers: Answers, id: QuestionId): boolean {
  return isValid(getQuestion(id), answers[id])
}

/** The stored answer, or the usual one when the question was never answered. */
export function effectiveAnswer(answers: Answers, id: QuestionId): Answer {
  const q = getQuestion(id)
  const a = answers[id]
  return isValid(q, a) ? a : defaultAnswer(q)
}

// ---------- onboarding progress ----------

export function screensFor(answers: Answers): QuestionId[][] {
  return onboardingScreens(effectiveAnswer(answers, 'q2').value as string)
}

export function remainingScreens(answers: Answers): number {
  return screensFor(answers).filter((ids) => !ids.every((id) => isAnswered(answers, id))).length
}

/** 1-based index of the first unanswered screen, or null when all are answered. */
export function firstUnansweredScreen(answers: Answers): number | null {
  const i = screensFor(answers).findIndex((ids) => !ids.every((id) => isAnswered(answers, id)))
  return i === -1 ? null : i + 1
}

export const SUMMARY_STEP = ONBOARDING_SCREEN_COUNT + 1

// ---------- numbers ----------

/** Round to 0,10 €. */
export function roundTo10Cents(n: number): number {
  return Math.round(n * 10) / 10
}

export function applyPercent(price: number, pct: number): number {
  return roundTo10Cents(price * (1 + pct / 100))
}

/** Parses "29,30", "29.30", "1.234,5 €" → number; null if not a valid non-negative number. */
export function parseItalianNumber(input: string): number | null {
  let s = input.trim().replace(/\s|€|%/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : null
}

const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const eurWhole = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
/** "36 €" for whole euros, "34,50 €" otherwise. */
export function formatEur(n: number | null | undefined): string {
  if (n == null) return '—'
  return Number.isInteger(n) ? eurWhole.format(n) : eur.format(n)
}

// ---------- q5: typical prices → price list ----------

/** Price chosen in a q5 row, or null for "Non so" / unparsable "Altro…". */
export function anchorPrice(pick: Pick | undefined): number | null {
  if (!pick || pick.choice === NON_SO) return null
  if (pick.choice === ALTRO) {
    const n = pick.custom ? parseItalianNumber(pick.custom) : null
    return n && n > 0 ? n : null
  }
  const n = Number(pick.choice)
  return Number.isFinite(n) && n > 0 ? n : null
}

export type StarterItem = { code: string; price_eur: number }
export type PriceChange = { code: string; price_eur: number; create?: PriceAnchor['create'] }

/**
 * Turns the q5 answers into price-list changes. Proportional items are scaled
 * from the STARTER prices, so re-answering never compounds.
 */
export function priceChanges(prices: PricesValue, starter: StarterItem[]): PriceChange[] {
  const starterPrice = new Map(starter.map((s) => [s.code, s.price_eur]))
  const out: PriceChange[] = []
  for (const anchor of PRICE_ANCHORS) {
    const chosen = anchorPrice(prices[anchor.id])
    if (chosen == null) continue
    const ratio = chosen / anchor.base
    if (anchor.code) {
      out.push({ code: anchor.code, price_eur: roundTo10Cents(chosen), create: starterPrice.has(anchor.code) ? undefined : anchor.create })
    }
    for (const code of anchor.scale ?? []) {
      const base = starterPrice.get(code)
      if (base != null) out.push({ code, price_eur: roundTo10Cents(base * ratio) })
    }
  }
  return out
}

// ---------- q6: discount ----------

/** Discount % from the q6 answer: null when unknown ("Non so" or unparsable "Altro…"). */
export function discountPct(answer: Answer): number | null {
  const v = answer.value
  if (v === ALTRO) return answer.custom_text ? parseItalianNumber(answer.custom_text) : null
  if (v === NON_SO || typeof v !== 'string') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// ---------- display (summary) ----------

function optionLabel(q: Question, id: string): string {
  if (q.kind !== 'single' && q.kind !== 'multi') return id
  return q.options.find((o) => o.id === id)?.label ?? id
}

/** Human-readable value of an answer, in Italian. */
export function formatAnswer(id: QuestionId, answer: Answer): string {
  const q = getQuestion(id)
  const custom = answer.custom_text?.trim()
  switch (q.kind) {
    case 'single': {
      const v = answer.value as string
      if (v === ALTRO) return custom || 'Altro'
      if (id === 'q6' && v === NON_SO) return 'Non so (usiamo il 46%)'
      return optionLabel(q, v)
    }
    case 'multi': {
      const v = answer.value as string[]
      const labels = v.filter((x) => x !== ALTRO).map((x) => optionLabel(q, x))
      if (v.includes(ALTRO) && custom) labels.push(custom)
      return labels.length ? labels.join(', ') : 'Nessuno'
    }
    case 'prices': {
      const v = answer.value as unknown as PricesValue
      const known = PRICE_ANCHORS.flatMap((a) => {
        const p = anchorPrice(v[a.id])
        return p == null ? [] : [`${a.label} ${formatEur(p)}`]
      })
      return known.length ? known.join(' · ') : 'Listino di partenza'
    }
    case 'series': {
      const v = seriesValue(answer)
      return TIERS.map((t) => {
        const pick = v[t.id] ?? { choice: SERIES_DEFAULTS[t.id] }
        if (pick.choice === ALTRO) return pick.custom?.trim() || 'Altro'
        return SERIES.find((s) => s.id === pick.choice)?.label ?? pick.choice
      }).join(' / ')
    }
  }
}

/** q7 value, reading answers saved before the middle tier was renamed "consigliata" → "media". */
export function seriesValue(answer: Answer): SeriesValue {
  const v = { ...(answer.value as unknown as Record<string, Pick>) }
  if (v.consigliata && !v.media) v.media = v.consigliata
  delete v.consigliata
  return v as SeriesValue
}

/** Drops a stale "Altro…" text when Altro is no longer selected. */
export function cleanAnswer(answer: Answer): Answer {
  const v = answer.value
  const altro = Array.isArray(v) ? v.includes(ALTRO) : v === ALTRO
  if (altro) return answer
  const { custom_text: _drop, ...rest } = answer
  void _drop
  return rest
}
