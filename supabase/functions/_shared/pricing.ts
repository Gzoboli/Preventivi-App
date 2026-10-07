// Quote format 2 (Task 3b): types of the AI replies, pricing and the validator.
// Money is computed here, never by the AI (CLAUDE.md rule 3). Shared by the app and the edge function.
import { formatEur, formatNumber, formatQty } from './format.ts'

// ---------------------------------------------------------------- AI replies

export type Method = 'punto' | 'ore_materiali' | 'forfait'
export type LineKind = 'punto' | 'ore' | 'materiale' | 'forfait'
export type LineSource = 'detto_da_te' | 'tuo_listino' | 'catalogo' | 'mia_stima'

/** "Scheda lavoro": the facts collected so far (quotes.job_sheet). */
export type JobSheet = {
  tipo_lavoro: string | null
  metodo: { sezione: string; metodo: Method }[]
  squadra: { persone: number | null; aiutante: boolean | null; giorni: number | null; ore_giorno: number | null }
  ambienti: string[]
  punti: number | null
  frutti: 'nuovi' | 'esistenti' | 'misto' | null
  quadro: string | null
  dico: 'inclusa' | 'forfait' | 'non richiesta' | null
  altro: string[]
  mancanti: string[]
}

/** `why`: the context, in plain words, of why the AI asks (shown above the options). */
export type AiQuestion = { id: string; text: string; why: string; options: string[]; multi: boolean }
export type MethodProposal = { sections: { name: string; method: Method; why: string }[] }

export type AiQuestions = {
  type: 'questions'
  job_sheet: JobSheet
  understanding: string
  method_proposal: MethodProposal | null
  questions: AiQuestion[]
  challenges: { text: string; question_id: string | null }[]
}

export type AiReady = { type: 'ready_to_generate'; job_sheet: JobSheet; summary: string }

export type AiLine = {
  line_id: string
  kind: LineKind
  /** Only for kind "ore". */
  worker: 'titolare' | 'aiutante' | null
  price_item_code: string | null
  catalogue_code: string | null
  description: string
  qty: number
  unit: string
  /** Final price to the client when he said it; for an estimated material, the list price before discount. */
  unit_price: number | null
  source: LineSource
  why: string
  quantity_estimated: boolean
  price_missing: boolean
  /** A switch/socket whose device (frutto) is replaced: only these get the series surcharge. */
  replaces_device: boolean
  is_certificate: boolean
}

export type RoomIcon = 'kitchen' | 'bathroom' | 'bedroom' | 'living' | 'hallway' | 'outdoor' | 'panel' | 'other'
export type AiSection = { name: string; icon: RoomIcon; method: Method; method_why: string; lines: AiLine[] }
export type AiTier = { series: string; what_you_get: string[] }

export type AiQuote = {
  type: 'quote'
  job_sheet: JobSheet
  title: string
  summary: string
  sections: AiSection[]
  tiers: { base: AiTier; consigliata: AiTier; top: AiTier } | null
  build_notes: string[]
  assumptions: string[]
  exclusions: string[]
  to_check: { text: string; line_id: string | null }[]
  estimated_days: number | null
  team: { persone: number | null; giorni: number | null; ore_giorno: number | null } | null
}

export type AiChange = { action: 'aggiungo' | 'tolgo' | 'cambio'; line_id: string | null; description: string; effect_eur: number | null }
export type AiProposal = { type: 'proposal'; job_sheet: JobSheet; changes: AiChange[]; total_effect_eur: number | null; note: string }

// ---------------------------------------------------------------- pricing inputs

export type CatalogueItem = { codice: string; marca: string; descrizione: string; prezzo_listino_eur: number | null; unita: string | null }

export type PricingInputs = {
  priceItems: { code: string; price_eur: number | null }[]
  hourlyRate: number | null
  helperRate: number | null
  /** Markup on materials, %. */
  markupPct: number
  /** Discount % by brand (lower case). */
  discounts: Record<string, number>
  defaultDiscountPct: number
  /** Catalogue rows referenced by the quote, by upper-case code (looked up by the edge function). */
  catalogue: Record<string, CatalogueItem>
  /** Extra € per replaced device for Consigliata and Top; null = unknown. */
  uplift: { media: number | null; top: number | null }
  /** Usual working day (q18), used when the job sheet doesn't say. */
  hoursPerDay: number | null
  vatRate: number
}

// ---------------------------------------------------------------- output

export type PriceSource = 'listino' | 'tariffa' | 'catalogo' | 'detto' | 'stima' | 'inclusa' | 'mancante'

export type PricedLine = {
  line_id: string
  unit_price: number
  total: number
  price_source: PriceSource
  /** The numbers behind the price, in Italian ("Listino 12,00 € − 46,6% + 20%"). */
  breakdown: string
  price_missing: boolean
  quantity_estimated: boolean
  catalogue: { codice: string; marca: string; descrizione: string; list_price: number; discount_pct: number; markup_pct: number } | null
}

export type TierTotal = { imponibile: number; iva: number; totale: number; uplift_missing: boolean }

export type Flag = {
  code: 'double_count' | 'hours_mismatch'
  message: string
  line_ids: string[]
  /** One-tap fix offered to the electrician (never applied silently). */
  fix: 'remove_lines' | null
}

export type Totals = {
  format: 2
  vat_rate: number
  lines: PricedLine[]
  /** The single price, or Base when there are tiers. */
  single: TierTotal
  tiers: { base: TierTotal; media: TierTotal; top: TierTotal } | null
  device_points: number
  uplift: { media: number | null; top: number | null }
  hours_per_day: number | null
  /** Lines without a price ("N voci da completare"). */
  missing_count: number
  flags: Flag[]
}

// ---------------------------------------------------------------- helpers

/** Rounds to cents without binary-float surprises (1.005 → 1.01). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

const num = formatNumber
const eur = formatEur

export function allLines(quote: Pick<AiQuote, 'sections'>): AiLine[] {
  return quote.sections.flatMap((s) => s.lines)
}

function isCertificate(line: AiLine): boolean {
  return line.is_certificate || /^DICO/i.test(line.price_item_code ?? '')
}

// ---------------------------------------------------------------- pricing

/** Resolves the unit price of one line from the electrician's data. */
export function priceLine(line: AiLine, quote: Pick<AiQuote, 'job_sheet'>, ctx: PricingInputs): PricedLine {
  const qty = Number.isFinite(line.qty) && line.qty >= 0 ? line.qty : 0
  const base = { line_id: line.line_id, quantity_estimated: line.quantity_estimated, catalogue: null }
  const given = line.unit_price != null && Number.isFinite(line.unit_price) && line.unit_price >= 0 ? line.unit_price : null
  const said = line.source === 'detto_da_te'
  const done = (unit: number, price_source: PriceSource, breakdown: string, extra: Partial<PricedLine> = {}): PricedLine => {
    const unit_price = round2(unit)
    const missing = price_source === 'mancante'
    return { ...base, unit_price, total: round2(unit_price * qty), price_source, breakdown, price_missing: missing, ...extra }
  }

  // Certificate of conformity: included when he does the job (Task 3b).
  if (isCertificate(line) && quote.job_sheet.dico === 'inclusa') {
    return done(0, 'inclusa', 'Inclusa: l’impianto lo realizzi tu')
  }

  if (line.kind === 'ore') {
    if (given != null && said) return done(given, 'detto', `${num(qty)} h × ${eur(given)} (detto da te)`)
    const helper = line.worker === 'aiutante'
    const rate = helper ? ctx.helperRate : ctx.hourlyRate
    if (rate != null) return done(rate, 'tariffa', `${num(qty)} h × ${eur(rate)} (tariffa ${helper ? 'aiutante' : 'titolare'})`)
    return done(0, 'mancante', `Manca la tariffa oraria ${helper ? 'dell’aiutante' : 'del titolare'}`)
  }

  if (line.kind === 'materiale') {
    const item = line.catalogue_code ? ctx.catalogue[line.catalogue_code.trim().toUpperCase()] : undefined
    if (given != null && said) return done(given, 'detto', `${eur(given)} cad. (detto da te)`)
    if (item?.prezzo_listino_eur != null) {
      const discount = ctx.discounts[item.marca.toLowerCase()] ?? ctx.defaultDiscountPct
      const unit = item.prezzo_listino_eur * (1 - discount / 100) * (1 + ctx.markupPct / 100)
      return done(
        unit,
        'catalogo',
        `Listino ${item.marca} ${item.codice} ${eur(item.prezzo_listino_eur)} − ${num(discount)}% sconto + ${num(ctx.markupPct)}% ricarico`,
        {
          catalogue: {
            codice: item.codice,
            marca: item.marca,
            descrizione: item.descrizione,
            list_price: item.prezzo_listino_eur,
            discount_pct: discount,
            markup_pct: ctx.markupPct,
          },
        },
      )
    }
    if (given != null) {
      // Estimated list price (not in the catalogue): same discount and markup as catalogue items.
      const unit = given * (1 - ctx.defaultDiscountPct / 100) * (1 + ctx.markupPct / 100)
      return done(unit, 'stima', `Listino stimato ${eur(given)} − ${num(ctx.defaultDiscountPct)}% sconto + ${num(ctx.markupPct)}% ricarico`)
    }
    return done(0, 'mancante', 'Prezzo non trovato nel catalogo')
  }

  // punto / forfait: the electrician's price list
  const listed = line.price_item_code ? ctx.priceItems.find((p) => p.code === line.price_item_code && p.price_eur != null) : undefined
  if (given != null && said) return done(given, 'detto', `${eur(given)} cad. (detto da te)`)
  if (listed) return done(listed.price_eur as number, 'listino', `Tuo listino (${listed.code}): ${eur(listed.price_eur as number)}`)
  if (given != null) return done(given, 'stima', `${eur(given)} cad. (mia stima)`)
  return done(0, 'mancante', 'Voce non presente nel tuo listino')
}

/** Prices every line, then aggregates (see `aggregate`). */
export function priceQuote(quote: AiQuote, ctx: PricingInputs): Totals {
  const lines = allLines(quote).map((l) => priceLine(l, quote, ctx))
  return aggregate(quote, lines, { vatRate: ctx.vatRate, uplift: ctx.uplift, hoursPerDay: ctx.hoursPerDay })
}

function tierTotal(imponibile: number, vatRate: number, upliftMissing: boolean): TierTotal {
  const imp = round2(imponibile)
  const iva = round2((imp * vatRate) / 100)
  return { imponibile: imp, iva, totale: round2(imp + iva), uplift_missing: upliftMissing }
}

/**
 * Totals from already priced lines. Also used by the app after a manual edit:
 * line totals are recomputed from unit_price × qty, so changing qty or price is enough.
 */
export function aggregate(
  quote: AiQuote,
  priced: PricedLine[],
  opts: { vatRate: number; uplift: Totals['uplift']; hoursPerDay: number | null },
): Totals {
  const byId = new Map(priced.map((p) => [p.line_id, p]))
  const lines = allLines(quote).map((l) => {
    const p = byId.get(l.line_id)
    const qty = Number.isFinite(l.qty) && l.qty >= 0 ? l.qty : 0
    if (!p) {
      return {
        line_id: l.line_id, unit_price: 0, total: 0, price_source: 'mancante' as const, breakdown: 'Prezzo mancante',
        price_missing: true, quantity_estimated: l.quantity_estimated, catalogue: null,
      }
    }
    return { ...p, quantity_estimated: l.quantity_estimated, total: round2(p.unit_price * qty) }
  })
  const imponibile = lines.reduce((sum, l) => sum + l.total, 0)
  const device_points = allLines(quote).reduce((sum, l) => (l.replaces_device ? sum + (l.qty || 0) : sum), 0)

  // Base/Consigliata/Top only when devices are replaced; the surcharge applies to those points only.
  const withTiers = quote.tiers != null && device_points > 0
  const upper = (u: number | null) =>
    u == null ? tierTotal(imponibile, opts.vatRate, true) : tierTotal(imponibile + device_points * u, opts.vatRate, false)

  return {
    format: 2,
    vat_rate: opts.vatRate,
    lines,
    single: tierTotal(imponibile, opts.vatRate, false),
    tiers: withTiers ? { base: tierTotal(imponibile, opts.vatRate, false), media: upper(opts.uplift.media), top: upper(opts.uplift.top) } : null,
    device_points,
    uplift: opts.uplift,
    hours_per_day: opts.hoursPerDay,
    missing_count: lines.filter((l) => l.price_missing).length,
    flags: validate(quote, opts.hoursPerDay),
  }
}

// ---------------------------------------------------------------- validator

/** Problems shown to the electrician before he uses the quote. Nothing is fixed silently. */
export function validate(quote: AiQuote, hoursPerDay: number | null): Flag[] {
  const flags: Flag[] = []

  for (const s of quote.sections) {
    if (s.method !== 'ore_materiali') continue
    const points = s.lines.filter((l) => l.kind === 'punto')
    if (!points.length) continue
    flags.push({
      code: 'double_count',
      message: `Possibile doppio conteggio: «${s.name}» è a ore + materiali ma contiene anche voci a punto (${points
        .map((l) => l.description)
        .join(', ')}). Il prezzo a punto comprende già la manodopera.`,
      line_ids: points.map((l) => l.line_id),
      fix: 'remove_lines',
    })
  }

  const sq = quote.job_sheet.squadra
  const perDay = sq.ore_giorno ?? hoursPerDay
  const hours = allLines(quote).reduce((sum, l) => (l.kind === 'ore' ? sum + (l.qty || 0) : sum), 0)
  if (hours > 0 && sq.persone && sq.giorni && perDay) {
    const expected = sq.persone * sq.giorni * perDay
    if (Math.abs(hours - expected) > expected * 0.25) {
      flags.push({
        code: 'hours_mismatch',
        message: `Le ore non tornano con la squadra indicata: nel preventivo ci sono ${num(hours)} ore, ma ${num(sq.persone)} ${
          sq.persone === 1 ? 'persona' : 'persone'
        } × ${num(sq.giorni)} ${sq.giorni === 1 ? 'giorno' : 'giorni'} × ${num(perDay)} ore fanno ${num(expected)} ore.`,
        line_ids: allLines(quote).filter((l) => l.kind === 'ore').map((l) => l.line_id),
        fix: null,
      })
    }
  }
  return flags
}

/** Removes lines (e.g. the one-tap fix of a double count). */
export function removeLines(quote: AiQuote, ids: string[]): AiQuote {
  return { ...quote, sections: quote.sections.map((s) => ({ ...s, lines: s.lines.filter((l) => !ids.includes(l.line_id)) })) }
}

// ---------------------------------------------------------------- versions

export type LineChange = { kind: 'aggiunta' | 'tolta' | 'cambiata'; line_id: string; description: string; detail: string }

/** "Cosa è cambiato" between two versions, matched by line_id. */
export function diffQuotes(prev: AiQuote, next: AiQuote): LineChange[] {
  const before = new Map(allLines(prev).map((l) => [l.line_id, l]))
  const after = new Map(allLines(next).map((l) => [l.line_id, l]))
  const changes: LineChange[] = []
  for (const [id, l] of after) {
    const old = before.get(id)
    if (!old) {
      changes.push({ kind: 'aggiunta', line_id: id, description: l.description, detail: formatQty(l.qty, l.unit) })
      continue
    }
    const parts: string[] = []
    if (old.qty !== l.qty) parts.push(`quantità ${num(old.qty)} → ${num(l.qty)}`)
    if (old.unit_price !== l.unit_price && l.unit_price != null) parts.push(`prezzo ${old.unit_price == null ? '—' : eur(old.unit_price)} → ${eur(l.unit_price)}`)
    if (old.kind !== l.kind) parts.push(`tipo ${old.kind} → ${l.kind}`)
    if (old.description !== l.description) parts.push(`prima: «${old.description}»`)
    if (parts.length) changes.push({ kind: 'cambiata', line_id: id, description: l.description, detail: parts.join(', ') })
  }
  for (const [id, l] of before) {
    if (!after.has(id)) changes.push({ kind: 'tolta', line_id: id, description: l.description, detail: formatQty(l.qty, l.unit) })
  }
  return changes
}

export const EMPTY_JOB_SHEET: JobSheet = {
  tipo_lavoro: null,
  metodo: [],
  squadra: { persone: null, aiutante: null, giorni: null, ore_giorno: null },
  ambienti: [],
  punti: null,
  frutti: null,
  quadro: null,
  dico: null,
  altro: [],
  mancanti: [],
}

/** quotes.job_sheet as stored (may be {} or partial) → a complete sheet. */
export function normalizeJobSheet(raw: unknown): JobSheet {
  const j = (raw && typeof raw === 'object' ? raw : {}) as Partial<JobSheet>
  return {
    ...EMPTY_JOB_SHEET,
    ...j,
    squadra: { ...EMPTY_JOB_SHEET.squadra, ...(j.squadra ?? {}) },
    metodo: Array.isArray(j.metodo) ? j.metodo : [],
    ambienti: Array.isArray(j.ambienti) ? j.ambienti : [],
    altro: Array.isArray(j.altro) ? j.altro : [],
    mancanti: Array.isArray(j.mancanti) ? j.mancanti : [],
  }
}
