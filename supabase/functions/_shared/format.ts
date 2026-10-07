// Italian number formatting, shared by the app and the edge function.
// it-IT does not group 4-digit numbers by default (1590,16): useGrouping 'always' gives 1.590,16.

const eurFmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' })
const eurWholeFmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always', maximumFractionDigits: 0 })
const numFmt = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2, useGrouping: 'always' })
const amountFmt = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })

/** "1.590,16 €" */
export function formatEur(n: number): string {
  return eurFmt.format(n)
}

/** "36 €" for whole euros, "34,50 €" otherwise. */
export function formatEurShort(n: number): string {
  return Number.isInteger(n) ? eurWholeFmt.format(n) : eurFmt.format(n)
}

/** "1.234,5" */
export function formatNumber(n: number): string {
  return numFmt.format(n)
}

/** "1.234,50" (no currency sign, for inputs) */
export function formatAmount(n: number): string {
  return amountFmt.format(n)
}

/** [singular, plural] for the units the AI uses; unknown units are left as they are. */
const UNITS: [RegExp, string, string][] = [
  [/^(punt[oi]|pt)\.?$/i, 'punto', 'punti'],
  [/^(or[ae]|h)\.?$/i, 'ora', 'ore'],
  [/^(metr[oi]|m|ml|mt)\.?$/i, 'metro', 'm'],
  [/^(pezz[oi]|pz|n|nr)\.?$/i, 'pezzo', 'pezzi'],
  [/^(giorn[oi]|gg)\.?$/i, 'giorno', 'giorni'],
  [/^(line[ae])$/i, 'linea', 'linee'],
  [/^(cad|cadauno|a corpo|corpo|forfait)\.?$/i, 'a corpo', 'a corpo'],
]

/** "1 punto", "4 punti", "1 ora", "12 ore", "1 metro", "550 m". */
export function formatQty(qty: number, unit: string): string {
  const u = unit.trim()
  const known = UNITS.find(([re]) => re.test(u))
  const label = known ? (qty === 1 ? known[1] : known[2]) : u
  return `${formatNumber(qty)} ${label}`.trim()
}
