import type { Json } from '../../types/db'
import {
  ALTRO,
  DISCOUNT_BRANDS,
  DISCOUNT_OPTIONS,
  DISCOUNT_RECOMMENDED,
  DEFAULT_DISCOUNT_PCT,
  QUESTIONS,
  SERIES,
  SERIES_RECOMMENDED,
  TIERS,
  getQuestion,
  type DiscountBrand,
  type Question,
  type QuestionId,
  type TierId,
} from './questions'

export type AnswerSource = 'user' | 'default'

/** One answer as stored in profiles.onboarding_answers[questionId]. */
export type Answer<V extends Json = Json> = {
  value: V
  source: AnswerSource
  /** Text typed in "Altro…" (choice questions). */
  custom_text?: string
}

/** A choice with an optional "Altro…" text (used per brand in q6, per tier in q7). */
export type Pick = { choice: string; custom?: string }

export type DiscountsValue = { brands: Record<DiscountBrand, Pick> }
export type SeriesValue = Record<TierId, Pick>

export type OnboardingMeta = {
  /** User chose "Lo faccio dopo" / "Finisco dopo": don't force the onboarding on login. */
  postponed?: boolean
  /** Last screen reached (0 = welcome, 1..14 = questions), used to resume. */
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
      return q.recommended[0]
    case 'multi':
      return [...q.recommended]
    case 'discounts': {
      const brands = Object.fromEntries(
        DISCOUNT_BRANDS.map((b) => [b, { choice: DISCOUNT_RECOMMENDED }]),
      ) as Record<DiscountBrand, Pick>
      return { brands } satisfies DiscountsValue as unknown as Json
    }
    case 'series': {
      const tiers = Object.fromEntries(
        TIERS.map((t) => [t.id, { choice: SERIES_RECOMMENDED[t.id] }]),
      ) as SeriesValue
      return tiers as unknown as Json
    }
    case 'prices':
    case 'company':
      return 'ok'
  }
}

export function defaultAnswer(q: Question): Answer {
  return { value: defaultValue(q), source: 'default' }
}

/** The stored answer, or the recommended one when the question was never answered. */
export function effectiveAnswer(answers: Answers, id: QuestionId): Answer {
  return answers[id] ?? defaultAnswer(getQuestion(id))
}

export function isAnswered(answers: Answers, id: QuestionId): boolean {
  return answers[id] !== undefined
}

export function remainingCount(answers: Answers): number {
  return QUESTIONS.filter((q) => !isAnswered(answers, q.id)).length
}

/** Index of the first unanswered question (1-based step), or null if all answered. */
export function firstUnansweredStep(answers: Answers): number | null {
  const i = QUESTIONS.findIndex((q) => !isAnswered(answers, q.id))
  return i === -1 ? null : i + 1
}

/**
 * "Salta blocco": fill the unanswered questions of the block, from `fromId` on,
 * with recommended values. Returns the new answers and the ids that were filled.
 */
export function skipBlock(answers: Answers, fromId: QuestionId): { answers: Answers; filled: QuestionId[] } {
  const from = QUESTIONS.findIndex((q) => q.id === fromId)
  const block = QUESTIONS[from].block
  const next: Answers = { ...answers }
  const filled: QuestionId[] = []
  for (const q of QUESTIONS.slice(from)) {
    if (q.block !== block) break
    if (!isAnswered(next, q.id)) {
      next[q.id] = defaultAnswer(q)
      filled.push(q.id)
    }
  }
  return { answers: next, filled }
}

/** 1-based step of the first question after the block of `id`, or TOTAL+1 when it was the last block. */
export function stepAfterBlock(id: QuestionId): number {
  const block = getQuestion(id).block
  const i = QUESTIONS.findIndex((q) => q.block > block)
  return i === -1 ? QUESTIONS.length + 1 : i + 1
}

// ---------- prices ----------

/** Round to 0,10 €. */
export function roundTo10Cents(n: number): number {
  return Math.round(n * 10) / 10
}

export function applyPercent(price: number, pct: number): number {
  return roundTo10Cents(price * (1 + pct / 100))
}

/** Parses "29,30", "29.30", "1.234,5" → number; null if not a valid non-negative number. */
export function parseItalianNumber(input: string): number | null {
  let s = input.trim().replace(/\s|€|%/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : null
}

const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
export function formatEur(n: number | null | undefined): string {
  return n == null ? '—' : eur.format(n)
}

// ---------- discounts (q6) ----------

/** Discount % to store for a brand pick: null when unknown ("Non so" or unparsable "Altro…"). */
export function discountPct(pick: Pick): number | null {
  if (pick.choice === ALTRO) return pick.custom ? parseItalianNumber(pick.custom) : null
  if (pick.choice === DISCOUNT_RECOMMENDED) return null
  return Number(pick.choice)
}

// ---------- display (summary) ----------

function optionLabel(q: Question, id: string): string {
  if (q.kind !== 'single' && q.kind !== 'multi') return id
  return q.options.find((o) => o.id === id)?.label ?? id
}

function pickLabel(pick: Pick, labelOf: (id: string) => string): string {
  if (pick.choice === ALTRO) return pick.custom?.trim() || 'Altro'
  return labelOf(pick.choice)
}

/** Human-readable value of an answer, in Italian. */
export function formatAnswer(id: QuestionId, answer: Answer): string {
  const q = getQuestion(id)
  const custom = answer.custom_text?.trim()
  switch (q.kind) {
    case 'single': {
      const v = answer.value as string
      return v === ALTRO ? custom || 'Altro' : optionLabel(q, v)
    }
    case 'multi': {
      const v = (answer.value as string[]) ?? []
      const labels = v.filter((x) => x !== ALTRO).map((x) => optionLabel(q, x))
      if (v.includes(ALTRO) && custom) labels.push(custom)
      return labels.length ? labels.join(', ') : 'Nessuno'
    }
    case 'discounts': {
      const v = answer.value as unknown as DiscountsValue
      return DISCOUNT_BRANDS.map((b) => {
        const pick = v?.brands?.[b] ?? { choice: DISCOUNT_RECOMMENDED }
        const pct = discountPct(pick)
        if (pct != null) return `${b} ${pct.toLocaleString('it-IT')}%`
        if (pick.choice === ALTRO && pick.custom) return `${b} ${pick.custom}`
        return `${b} ${DEFAULT_DISCOUNT_PCT}% (medio)`
      }).join(' · ')
    }
    case 'series': {
      const v = answer.value as unknown as SeriesValue
      return TIERS.map((t) => {
        const pick = v?.[t.id] ?? { choice: SERIES_RECOMMENDED[t.id] }
        return pickLabel(pick, (sid) => SERIES.find((s) => s.id === sid)?.label ?? sid)
      }).join(' / ')
    }
    case 'prices':
    case 'company':
      return ''
  }
}

export function discountOptionLabel(id: string): string {
  return DISCOUNT_OPTIONS.find((o) => o.id === id)?.label ?? id
}
