// What the client PDF shows (Task 5), built only from the fields meant for the client.
// Internal information (sources, "why", build notes, things to check, flags, catalogue codes,
// discounts, markup, hours and rates) never reaches this model, except hours and rates in the
// price table when the electrician switches it on.
import { ALTRO, getQuestion, type TierId } from '../../../supabase/functions/_shared/questions.ts'
import { effectiveAnswer, variationClause, type Answers } from '../../../supabase/functions/_shared/answers.ts'
import { formatEur, formatNumber, formatQty } from '../../../supabase/functions/_shared/format.ts'
import { round2, type AiLine, type AiQuote, type AiSection, type PricedLine, type Totals } from '../../../supabase/functions/_shared/pricing.ts'
import { palette } from './colors'

export type SectionIcon = 'cable' | 'board' | 'line' | 'switch' | 'light' | 'intercom' | 'cert' | 'generic'
export type PlateStyle = 'flat_white' | 'colored_round' | 'glass_dark'

export type ClientTier = {
  id: TierId
  label: string
  color: string
  plate: PlateStyle
  series: string
  points: string[]
  totale: number
  recommended: boolean
}

export type ClientSection = {
  icon: SectionIcon
  name: string
  /** Subtotal of the priced part (IVA esclusa); null when nothing in it has a price. */
  amount: number | null
  /** Certificate given for free ("inclusa"). */
  included: boolean
  /** Some or all of it is "da definire in sopralluogo". */
  pending: boolean
  summary: string
  points: string[]
}

export type PriceRow = { label: string; qty: string; price: string; total: string }

export type ClientQuote = {
  accent: string
  soft: string
  company: { name: string; initials: string; lines: string[]; logo: string | null }
  number: string
  date: string
  client: string | null
  address: string | null
  title: string
  summary: string
  /** Lines the summary may take on page 1 (fewer when page 1 is full). */
  summaryLines: number
  /** IVA %, 0 = IVA esclusa ("Senza IVA"). */
  vatRate: number
  single: { totale: number; imponibile: number } | null
  tiers: ClientTier[] | null
  tiles: { icon: SectionIcon; name: string; summary: string }[]
  exclusions: string[]
  clause: { text: string; bold: boolean }[]
  info: { label: string; value: string }[]
  upgrade: { text: string; detail: string; price: number } | null
  sections: ClientSection[]
  totals: { imponibile: number; iva: number; totale: number }
  pendingNote: boolean
  notes: string[]
  payment: string[]
  priceTable: { name: string; rows: PriceRow[] }[] | null
  fileName: string
}

export type ClientQuoteInput = {
  quote: {
    quote_year: number
    quote_number: number
    client_name: string | null
    client_address: string | null
    job_title: string | null
    estimated_days: number | null
  }
  ai: AiQuote
  totals: Totals
  profile: {
    company_name: string | null
    legal_form: string | null
    vat_number: string | null
    address: string | null
    phone: string | null
    email: string | null
    accent_color: string | null
  }
  logo: string | null
  answers: Answers
  /** IVA chosen for this PDF (0 = senza IVA). */
  vatRate: number
  /** Option detailed on page 2 when there are tiers. */
  tier: TierId
  showPrices: boolean
  date: Date
}

const TIER_STYLE: Record<TierId, { label: string; plate: PlateStyle; color: string | null }> = {
  base: { label: 'Base', plate: 'flat_white', color: '#64748B' },
  media: { label: 'Consigliata', plate: 'colored_round', color: null },
  top: { label: 'Top', plate: 'glass_dark', color: '#A07C2C' },
}

const MAX_TILES = 8
const MAX_BULLETS = 4

const ICON_RULES: [SectionIcon, RegExp][] = [
  ['cert', /dichiaraz|conformit|certific|\bdico\b/i],
  ['intercom', /citofon/i],
  ['board', /quadr|centralin|salvavit|differenzial|magnetoterm/i],
  ['line', /linea|montant|colonn|piani|contator/i],
  ['switch', /interrutt|prese\b|presa|frutt|placch|comand|deviat/i],
  ['light', /luc[ei]|illumin|lampad|faretti|led\b/i],
  ['cable', /cav[io]|fili|ricabl|cablagg/i],
]

/** Icon for a section, from its name first, then its lines. */
export function sectionIcon(s: Pick<AiSection, 'name' | 'icon' | 'lines'>): SectionIcon {
  const match = (text: string) => ICON_RULES.find(([, re]) => re.test(text))?.[0]
  return match(s.name) ?? (s.icon === 'panel' ? 'board' : undefined) ?? match(s.lines.map((l) => l.description).join(' ')) ?? 'generic'
}

const isCertificate = (l: AiLine) => l.is_certificate || /^DICO/i.test(l.price_item_code ?? '')

function initials(name: string): string {
  const words = name
    .replace(/\b(s\.?r\.?l|s\.?n\.?c|s\.?a\.?s|di|e|&)\b\.?/gi, ' ')
    .split(/\s+/)
    .filter((w) => /[a-zà-ú]/i.test(w))
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase()
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

/** "Testo **grassetto** testo" → segments. */
export function boldSegments(text: string): { text: string; bold: boolean }[] {
  return text
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((t) => (t.startsWith('**') && t.endsWith('**') ? { text: t.slice(2, -2), bold: true } : { text: t, bold: false }))
}

function choiceLabel(answers: Answers, id: 'q11' | 'q12' | 'q13'): string[] {
  const a = effectiveAnswer(answers, id)
  const q = getQuestion(id)
  const values = Array.isArray(a.value) ? (a.value as string[]) : [a.value as string]
  return values.flatMap((v) => {
    if (v === ALTRO) return a.custom_text?.trim() ? [a.custom_text.trim()] : []
    const opt = q.kind === 'single' || q.kind === 'multi' ? q.options.find((o) => o.id === v) : undefined
    return [opt?.label ?? v]
  })
}

function payment(answers: Answers, withCertificate: boolean): { short: string; full: string[] } {
  const a = effectiveAnswer(answers, 'q12')
  const end = withCertificate ? 'Saldo a fine lavori, con la consegna della dichiarazione di conformità' : 'Saldo a fine lavori'
  switch (a.value) {
    case 'fine_lavori':
      return {
        short: 'Tutto a fine lavori',
        full: [withCertificate ? 'Tutto a fine lavori, con la consegna della dichiarazione di conformità' : 'Tutto a fine lavori'],
      }
    case 'acconto_30':
      return { short: '30% inizio, saldo a fine', full: ['30% all’inizio dei lavori', end] }
    case 'sal_20_20':
      return { short: '20% + 20% in corso, saldo a fine', full: ['20% a fine tubazioni', '20% a fine cavi', end] }
    default: {
      const text = choiceLabel(answers, 'q12')[0] ?? 'Da concordare'
      return { short: clip(text, 40), full: [text] }
    }
  }
}

export function fileName(clientName: string | null, year: number, number: number): string {
  const client =
    (clientName ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'Cliente'
  return `Preventivo_${client}_${year}-${String(number).padStart(3, '0')}.pdf`
}

export function buildClientQuote(input: ClientQuoteInput): ClientQuote {
  const { quote, ai, totals, profile, answers, vatRate, tier, showPrices } = input
  const { accent, soft } = palette(profile.accent_color)
  const priced = new Map<string, PricedLine>(totals.lines.map((l) => [l.line_id, l]))
  const withVat = (imp: number) => round2(imp + round2((imp * vatRate) / 100))
  const tierId: TierId = totals.tiers ? tier : 'base'
  const uplift = tierId === 'base' ? 0 : (totals.uplift[tierId] ?? 0)

  // ---------- sections (page 2), priced for the detailed option
  const sections: ClientSection[] = ai.sections.map((s) => {
    let amount = 0
    let pricedCount = 0
    let pending = false
    for (const l of s.lines) {
      const p = priced.get(l.line_id)
      if (!p || p.price_missing) {
        pending = true
        continue
      }
      pricedCount += 1
      amount += p.total + (l.replaces_device ? (l.qty || 0) * uplift : 0)
    }
    const included =
      s.lines.some(isCertificate) &&
      s.lines.every((l) => priced.get(l.line_id)?.price_source === 'inclusa' || (priced.get(l.line_id)?.total ?? 0) === 0) &&
      !pending
    const fallback = s.lines.filter((l) => l.kind !== 'ore' && !isCertificate(l)).map((l) => l.description)
    const points = (s.client_points?.length ? s.client_points : fallback).slice(0, 3)
    return {
      icon: sectionIcon(s),
      name: s.name,
      amount: pricedCount ? round2(amount) : null,
      included,
      pending,
      summary: clip(s.client_summary?.trim() || points[0] || '', 60),
      points,
    }
  })

  // ---------- "Cosa comprende" tiles: one per section (the free certificate stays on page 2), max 8
  let tileSections = sections.filter((s) => !s.included)
  if (tileSections.length > MAX_TILES) {
    const keep = [...tileSections].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)).slice(0, MAX_TILES - 1)
    const rest = tileSections.filter((s) => !keep.includes(s))
    tileSections = [
      ...tileSections.filter((s) => keep.includes(s)),
      {
        icon: 'generic',
        name: 'Altro',
        amount: null,
        included: false,
        pending: false,
        summary: clip(rest.map((s) => s.name).join(', '), 60),
        points: [],
      },
    ]
  }
  const tiles = tileSections.map((s) => ({ icon: s.icon, name: s.name, summary: s.summary }))

  // ---------- prices
  const recommended: TierId = 'media'
  const tiers: ClientTier[] | null =
    totals.tiers && ai.tiers
      ? (['base', 'media', 'top'] as const).map((id) => {
          const info = ai.tiers![id === 'media' ? 'consigliata' : id]
          const style = TIER_STYLE[id]
          return {
            id,
            label: style.label,
            color: style.color ?? accent,
            plate: style.plate,
            series: info?.series ?? '',
            points: (info?.what_you_get ?? []).slice(0, 3),
            totale: withVat(totals.tiers![id].imponibile),
            recommended: id === recommended,
          }
        })
      : null
  const imponibile = totals.tiers ? totals.tiers[tierId].imponibile : totals.single.imponibile
  const iva = round2((imponibile * vatRate) / 100)

  // ---------- texts
  const hasCertificate = ai.sections.some((s) => s.lines.some(isCertificate))
  const pay = payment(answers, hasCertificate)
  const days = quote.estimated_days ?? ai.estimated_days
  const exclusions = (ai.client_exclusions?.length ? ai.client_exclusions : choiceLabel(answers, 'q13')).slice(0, MAX_BULLETS)
  const notes = (ai.client_notes?.length ? ai.client_notes : ai.assumptions).slice(0, MAX_BULLETS)
  const baseName = profile.company_name?.trim() || 'Il tuo elettricista'
  const form = profile.legal_form?.trim()
  const companyName = form && form !== 'Altro' && !baseName.toLowerCase().includes(form.toLowerCase()) ? `${baseName} ${form}` : baseName
  const companyLines = [
    [profile.address, profile.vat_number ? `P.IVA ${profile.vat_number}` : ''].filter(Boolean).join(' · '),
    [profile.phone, profile.email].filter(Boolean).join(' · '),
  ].filter(Boolean)

  const upgrade =
    ai.client_upgrade && totals.upgrade
      ? { text: clip(ai.client_upgrade.text, 90), detail: clip(ai.client_upgrade.detail, 110), price: withVat(totals.upgrade.imponibile) }
      : null

  return fitPageOne({
    accent,
    soft,
    company: { name: companyName, initials: initials(baseName), lines: companyLines, logo: input.logo },
    number: `${quote.quote_year}/${String(quote.quote_number).padStart(3, '0')}`,
    date: new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(input.date),
    client: quote.client_name?.trim() ? clip(quote.client_name.trim(), 60) : null,
    address: quote.client_address?.trim() ? clip(quote.client_address.trim(), 70) : null,
    title: ai.title?.trim() || quote.job_title?.trim() || 'Preventivo',
    summary: ai.summary?.trim() ?? '',
    summaryLines: 3,
    vatRate,
    single: tiers ? null : { totale: withVat(imponibile), imponibile },
    tiers,
    tiles,
    exclusions,
    clause: boldSegments(variationClause(answers)),
    info: [
      { label: 'Tempi', value: days ? `circa ${formatNumber(days)} ${days === 1 ? 'giorno' : 'giorni'}` : 'da concordare' },
      { label: 'Validità', value: choiceLabel(answers, 'q11')[0] ?? '60 giorni' },
      { label: 'Pagamento', value: pay.short },
    ],
    upgrade,
    sections,
    totals: { imponibile, iva, totale: round2(imponibile + iva) },
    pendingNote: sections.some((s) => s.pending),
    notes,
    payment: pay.full,
    priceTable: showPrices ? priceTable(ai, priced, tierId, uplift, tiers) : null,
    fileName: fileName(quote.client_name, quote.quote_year, quote.quote_number),
  })
}

// ---------------------------------------------------------------- page 1 must fit on one page

/** Rough heights (pt) of the page-1 blocks, after the layout of ClientQuotePdf (checked on the job 2 samples). */
const lines = (text: string, charsPerLine: number) => Math.max(1, Math.ceil(text.length / charsPerLine))
const PAGE1_HEIGHT = 752 // A4 842 pt − top and bottom margins

export function pageOneHeight(q: ClientQuote): number {
  const header = 64 + Math.max(0, (q.client ? lines(`Per: ${q.client}`, 45) : 0) + (q.address ? lines(q.address, 45) : 0) - 2) * 12
  const title = 30 + Math.min(2, lines(q.title, 38)) * 28 + Math.min(q.summaryLines, q.summary ? lines(q.summary, 75) : 0) * 15.5
  const price = q.tiers ? 175 : 105
  const tiles = q.tiles.length ? 35 + Math.ceil(q.tiles.length / 4) * 94 : 0
  const bullets = q.exclusions.reduce((h, e) => h + lines(e, 40) * 13.3 + 1.5, 0)
  const clause = q.clause.reduce((n, c) => n + c.text.length, 0)
  const boxes = 14 + 44 + Math.max(bullets, Math.ceil(clause / 52) * 13.3)
  const info = 14 + 52
  const upgrade = q.upgrade ? 14 + 26 + lines(q.upgrade.text, 85) * 12 + (q.upgrade.detail ? lines(q.upgrade.detail, 100) * 12 : 0) : 0
  return header + title + price + tiles + boxes + info + upgrade
}

/** Shortens page 1 so it never spills: fewer tiles, fewer and shorter exclusions, a shorter summary. */
export function fitPageOne(q: ClientQuote): ClientQuote {
  const steps: ((q: ClientQuote) => ClientQuote)[] = [
    (q) => ({ ...q, tiles: mergeTiles(q.tiles, 4) }),
    (q) => ({ ...q, exclusions: q.exclusions.slice(0, 3) }),
    (q) => ({ ...q, exclusions: q.exclusions.map((e) => clip(e, 80)) }),
    (q) => ({ ...q, summaryLines: 2 }),
    (q) => ({ ...q, exclusions: q.exclusions.slice(0, 2) }),
    (q) => ({ ...q, exclusions: q.exclusions.map((e) => clip(e, 40)) }),
    (q) => ({ ...q, client: q.client && clip(q.client, 40), address: q.address && clip(q.address, 45) }),
    (q) => ({ ...q, upgrade: q.upgrade && { ...q.upgrade, text: clip(q.upgrade.text, 80), detail: clip(q.upgrade.detail, 95) } }),
    (q) => ({ ...q, summaryLines: 1 }),
  ]
  let fitted = q
  for (const step of steps) {
    if (pageOneHeight(fitted) <= PAGE1_HEIGHT) break
    fitted = step(fitted)
  }
  return fitted
}

function mergeTiles(tiles: ClientQuote['tiles'], max: number): ClientQuote['tiles'] {
  if (tiles.length <= max) return tiles
  const merged = tiles.slice(max - 1).flatMap((t) => (t.name === 'Altro' ? [t.summary] : [t.name]))
  return [...tiles.slice(0, max - 1), { icon: 'generic', name: 'Altro', summary: clip(merged.join(', '), 60) }]
}

/** Page 3 ("Mostra il dettaglio dei prezzi"): the lines with quantities and unit prices, IVA esclusa. */
function priceTable(ai: AiQuote, priced: Map<string, PricedLine>, tierId: TierId, uplift: number, tiers: ClientTier[] | null) {
  return ai.sections.map((s) => {
    const rows: PriceRow[] = s.lines.map((l) => {
      const p = priced.get(l.line_id)
      if (p?.price_source === 'inclusa') return { label: l.description, qty: formatQty(l.qty, l.unit), price: '', total: 'inclusa' }
      const missing = !p || p.price_missing
      const label = l.kind === 'ore' ? `Manodopera ${l.worker === 'aiutante' ? 'aiutante' : 'titolare'}` : l.description
      const qty = l.kind === 'ore' ? formatQty(l.qty, 'ore') : formatQty(l.qty, l.unit)
      return { label, qty, price: missing ? '—' : formatEur(p.unit_price), total: missing ? 'da definire' : formatEur(p.total) }
    })
    const devices = s.lines.reduce((n, l) => (l.replaces_device ? n + (l.qty || 0) : n), 0)
    if (uplift > 0 && devices > 0) {
      const series = tiers?.find((t) => t.id === tierId)?.series
      rows.push({
        label: `Frutti e placche${series ? ` ${series}` : ''} (opzione ${TIER_STYLE[tierId].label})`,
        qty: formatQty(devices, 'pezzi'),
        price: formatEur(uplift),
        total: formatEur(round2(devices * uplift)),
      })
    }
    return { name: s.name, rows }
  })
}
