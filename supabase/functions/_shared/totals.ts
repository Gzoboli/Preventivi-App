// Money is computed here, never by the AI (CLAUDE.md rule 3).
// Shared by the app (Vite) and the generate-quote Edge Function (Deno): pure TypeScript.

// ---------- AI output (validated by the JSON schema in aiSchema.ts) ----------

export type LineKind = 'punto' | 'ore' | 'materiale' | 'forfait'
export type Worker = 'titolare' | 'aiutante'

export type AiLine = {
  /** Code from the electrician's price list, or null when the item isn't in it. */
  price_item_code: string | null
  description: string
  qty: number
  unit: string
  kind: LineKind
  /** Only for kind "ore". */
  worker: Worker | null
  /** AI estimate, used only when the item isn't in the price list (always "da confermare"). For materials: list price before discount. */
  unit_price: number | null
  /** A switch/socket point whose price changes with the series (for lines without a price-list code). */
  counts_as_point: boolean
  to_confirm: boolean
  note: string | null
}

export type RoomIcon = 'kitchen' | 'bathroom' | 'bedroom' | 'living' | 'hallway' | 'outdoor' | 'panel' | 'other'
export type AiRoom = { name: string; icon: RoomIcon; lines: AiLine[] }
export type TierId = 'base' | 'media' | 'top'

export type AiQuote = {
  type: 'quote'
  title: string
  summary: string
  job_type: string
  rooms: AiRoom[]
  tiers: Record<TierId, { what_you_get: string[] }>
  assumptions: string[]
  exclusions: string[]
  estimated_days: number | null
}

export type AiQuestion = { id: string; text: string; options: string[]; multi: boolean }
export type AiClarify = { type: 'clarify'; understanding: string; questions: AiQuestion[] }
export type AiOutput = AiQuote | AiClarify

// ---------- pricing inputs ----------

export type PricingContext = {
  priceItems: { code: string; price_eur: number | null }[]
  hourlyRate: number | null
  helperRate: number | null
  /** Wholesaler discount on list prices, % (already defaulted, e.g. 46 when unknown). */
  discountPct: number
  /** Markup on materials, %. */
  markupPct: number
  vatRate: number
  /** Extra € per switch/socket point for the Media and Top series; null = unknown ("da confermare"). */
  uplift: { media: number | null; top: number | null }
}

/** Price-list codes that count as switch/socket points (their price changes with the series). */
export const POINT_CODES = ['INT', 'INT2P', 'PULS', 'PRESA10', 'PRESAUNI', 'PRESATV', 'PRESADATI']

// ---------- output ----------

export type LineSource = 'listino' | 'tariffa' | 'stima' | 'mancante'

export type PricedLine = {
  room: number
  line: number
  unit_price: number
  total: number
  to_confirm: boolean
  source: LineSource
  is_point: boolean
}

export type TierTotal = {
  imponibile: number
  iva: number
  totale: number
  /** Lines marked "da confermare" in this tier. */
  to_confirm_count: number
  /** Media/Top: the series uplift is unknown, so the total is only the Base part. */
  uplift_missing: boolean
}

export type Totals = {
  vat_rate: number
  points: number
  lines: PricedLine[]
  base: TierTotal
  media: TierTotal
  top: TierTotal
}

/** Rounds to cents without binary-float surprises (1.005 → 1.01). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function priceLine(line: AiLine, ctx: PricingContext): Omit<PricedLine, 'room' | 'line'> {
  const qtyOk = Number.isFinite(line.qty) && line.qty >= 0
  const qty = qtyOk ? line.qty : 0
  const code = line.price_item_code?.trim() || null
  const is_point = code ? POINT_CODES.includes(code) : line.counts_as_point

  let unit = 0
  let source: LineSource = 'mancante'
  let toConfirm = line.to_confirm || !qtyOk

  if (line.kind === 'ore') {
    const rate = line.worker === 'aiutante' ? ctx.helperRate : ctx.hourlyRate
    if (rate != null) {
      unit = rate
      source = 'tariffa'
    } else {
      toConfirm = true
    }
  } else {
    const listed = code ? ctx.priceItems.find((p) => p.code === code && p.price_eur != null) : undefined
    if (listed) {
      unit = listed.price_eur as number
      source = 'listino'
    } else if (line.unit_price != null && Number.isFinite(line.unit_price) && line.unit_price > 0) {
      // Not in the price list: AI estimate, always to be confirmed.
      unit =
        line.kind === 'materiale'
          ? line.unit_price * (1 - ctx.discountPct / 100) * (1 + ctx.markupPct / 100)
          : line.unit_price
      source = 'stima'
      toConfirm = true
    } else {
      toConfirm = true
    }
  }

  const unit_price = round2(unit)
  return { unit_price, total: round2(unit_price * qty), to_confirm: toConfirm, source, is_point }
}

function tier(imponibile: number, vatRate: number, toConfirm: number, upliftMissing: boolean): TierTotal {
  const imp = round2(imponibile)
  const iva = round2((imp * vatRate) / 100)
  return { imponibile: imp, iva, totale: round2(imp + iva), to_confirm_count: toConfirm, uplift_missing: upliftMissing }
}

export function computeTotals(quote: Pick<AiQuote, 'rooms'>, ctx: PricingContext): Totals {
  const lines: PricedLine[] = []
  quote.rooms.forEach((room, r) =>
    room.lines.forEach((line, l) => lines.push({ room: r, line: l, ...priceLine(line, ctx) })),
  )
  const base = lines.reduce((sum, l) => sum + l.total, 0)
  const toConfirm = lines.filter((l) => l.to_confirm).length
  const points = lines.reduce(
    (sum, l) => (l.is_point ? sum + (quote.rooms[l.room].lines[l.line].qty || 0) : sum),
    0,
  )

  const upper = (uplift: number | null) =>
    uplift == null ? tier(base, ctx.vatRate, toConfirm, true) : tier(base + points * uplift, ctx.vatRate, toConfirm, false)

  return {
    vat_rate: ctx.vatRate,
    points,
    lines,
    base: tier(base, ctx.vatRate, toConfirm, false),
    media: upper(ctx.uplift.media),
    top: upper(ctx.uplift.top),
  }
}
