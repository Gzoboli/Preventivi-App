import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronDown, ClipboardCheck, FileText, Lightbulb, Loader2, MessageSquare, Package, Wrench } from 'lucide-react'
import { updateQuote } from '../../lib/quotes'
import { deleteLines } from '../../lib/conversation'
import { LineSheet } from './LineSheet'
import { VatPicker, vatNote } from './VatPicker'
import { Plate, TIER_PLATES } from './Plate'
import { TIERS } from '../../lib/onboarding/questions'
import { METHOD_LABELS } from '../../../supabase/functions/_shared/chat.ts'
import { formatEur, formatQty } from '../../../supabase/functions/_shared/format.ts'
import { diffQuotes, round2, type AiLine, type AiQuote, type PricedLine, type Totals } from '../../../supabase/functions/_shared/pricing.ts'
import type { Quote, QuoteVersion } from '../../types/db'

/** Where a price comes from, as a small tag on each line. */
export function sourceTag(line: AiLine, p: PricedLine | undefined): { icon: string; label: string } {
  if (!p || p.price_source === 'mancante') return { icon: '⚠️', label: 'Prezzo mancante' }
  if (p.price_source === 'inclusa') return { icon: '✅', label: 'Inclusa' }
  if (p.price_source === 'detto' || line.source === 'detto_da_te') return { icon: '🗣', label: 'Detto da te' }
  if (p.price_source === 'listino' || p.price_source === 'tariffa') return { icon: '📋', label: 'Tuo listino' }
  if (p.price_source === 'catalogo' && p.catalogue) {
    return {
      icon: '📦',
      label: `Catalogo (−${p.catalogue.discount_pct.toLocaleString('it-IT')}% sconto, +${p.catalogue.markup_pct.toLocaleString('it-IT')}% ricarico)`,
    }
  }
  return { icon: '💡', label: 'Mia stima' }
}

const builtKey = (versionId: string) => `come-costruito-${versionId}`

/** A generated quote (format 2): prices, how it was built, what to check, editable lines. */
export function QuoteResult({
  quote,
  version,
  previous,
  onChanged,
}: {
  quote: Quote
  version: QuoteVersion
  previous: QuoteVersion | null
  onChanged: () => void
}) {
  const ai = version.ai_output as unknown as AiQuote
  const totals = version.totals as unknown as Totals
  const [vat, setVat] = useState<number | null>(quote.vat_rate == null ? null : Number(quote.vat_rate))
  const [openLine, setOpenLine] = useState<string | null>(null)
  const [fixing, setFixing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // "Come l'ho costruito" is open the first time a version is seen on this device.
  const [builtOpen] = useState(() => {
    try {
      const seen = localStorage.getItem(builtKey(version.id))
      localStorage.setItem(builtKey(version.id), '1')
      return !seen
    } catch {
      return true
    }
  })

  useEffect(() => setVat(quote.vat_rate == null ? null : Number(quote.vat_rate)), [quote.vat_rate])

  const priced = useMemo(() => new Map(totals.lines.map((l) => [l.line_id, l])), [totals.lines])
  const prevAi = previous?.ai_output as unknown as AiQuote | undefined
  const changes = useMemo(() => (prevAi?.sections ? diffQuotes(prevAi, ai) : []), [prevAi, ai])
  const changedIds = new Set(changes.filter((c) => c.kind !== 'tolta').map((c) => c.line_id))
  const withVat = (imponibile: number) => {
    const iva = round2((imponibile * (vat ?? 0)) / 100)
    return { iva, totale: round2(imponibile + iva) }
  }
  const allLines = ai.sections.flatMap((s) => s.lines)
  const line = openLine ? allLines.find((l) => l.line_id === openLine) : undefined

  async function fix(ids: string[], key: string) {
    setFixing(key)
    setError(null)
    try {
      await deleteLines(version, ids, 'Ho tolto le voci a punto per evitare il doppio conteggio')
      onChanged()
    } catch {
      setError('Qualcosa non ha funzionato, riprova.')
    } finally {
      setFixing(null)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold md:text-3xl">{quote.job_title || ai.title}</h1>
      <p className="mt-2 text-muted">{ai.summary}</p>

      {totals.flags.length > 0 && (
        <section className="mt-4 space-y-2" aria-label="Da sistemare">
          {totals.flags.map((f, i) => (
            <div key={i} className="rounded-xl border border-amber-300 bg-amber-50 p-3" role="alert">
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
                {f.message}
              </p>
              {f.fix === 'remove_lines' && (
                <button
                  type="button"
                  disabled={!!fixing}
                  onClick={() => void fix(f.line_ids, String(i))}
                  className="mt-2 flex h-12 items-center gap-2 rounded-lg border border-amber-400 bg-white px-4 font-semibold"
                >
                  {fixing === String(i) && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  Togli le voci a punto
                </button>
              )}
            </div>
          ))}
          {error && <p className="text-red-700">{error}</p>}
        </section>
      )}

      {/* Prices */}
      {totals.tiers ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {TIERS.map((t) => {
            const tier = totals.tiers![t.id]
            const info = ai.tiers?.[t.id === 'media' ? 'consigliata' : t.id]
            const { totale } = withVat(tier.imponibile)
            return (
              <section key={t.id} className={`rounded-xl border p-4 ${t.id === 'media' ? 'border-accent' : 'border-line'}`}>
                <div className="flex items-center gap-3">
                  <Plate style={TIER_PLATES[t.id].style} color={TIER_PLATES[t.id].color} />
                  <div>
                    <h2 className="font-semibold">{t.label}</h2>
                    {info?.series && <p className="text-sm text-muted">{info.series}</p>}
                  </div>
                </div>
                <p className={`mt-1 text-2xl font-semibold tabular-nums ${tier.uplift_missing ? 'text-amber-700' : ''}`}>
                  {tier.uplift_missing ? `da ${formatEur(totale)}` : formatEur(totale)}
                </p>
                <p className="text-sm text-muted">{vatNote(vat, tier.imponibile)}</p>
                {t.id !== 'base' && (
                  <p className="mt-2 text-sm text-muted">
                    {tier.uplift_missing
                      ? 'Sovrapprezzo della serie da confermare'
                      : `Sovrapprezzo stimato dai listini su ${formatQty(totals.device_points, 'punti')} con frutto nuovo`}
                  </p>
                )}
                {info && (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                    {info.what_you_get.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      ) : (
        <section className="mt-6 rounded-xl border border-accent p-4">
          <h2 className="font-semibold">Totale</h2>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{formatEur(withVat(totals.single.imponibile).totale)}</p>
          <p className="text-sm text-muted">{vatNote(vat, totals.single.imponibile)}</p>
        </section>
      )}
      {totals.missing_count > 0 && (
        <p className="mt-3 flex items-center gap-2 font-semibold text-amber-700">
          <AlertTriangle className="size-5" aria-hidden />
          {totals.missing_count} {totals.missing_count === 1 ? 'voce da completare' : 'voci da completare'}: tocca la voce per inserire il prezzo
        </p>
      )}

      <div className="mt-4">
        <VatPicker
          value={vat}
          onChange={(v) => {
            setVat(v)
            void updateQuote(quote.id, { vat_rate: v })
          }}
        />
      </div>

      <Link
        to={`/preventivi/${quote.id}/pdf`}
        className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-lg font-semibold text-white hover:bg-accent-hover"
      >
        <FileText className="size-5" aria-hidden /> PDF per il cliente
      </Link>

      {changes.length > 0 && (
        <section className="mt-6 rounded-xl border border-accent/40 bg-accent/5 p-4">
          <h2 className="font-semibold">Cosa è cambiato rispetto alla versione {previous?.version}</h2>
          <ul className="mt-2 space-y-1">
            {changes.map((c) => (
              <li key={`${c.kind}-${c.line_id}`}>
                <span className="font-medium">{c.kind === 'aggiunta' ? 'Aggiunta' : c.kind === 'tolta' ? 'Tolta' : 'Cambiata'}:</span> {c.description}{' '}
                <span className="text-muted">({c.detail})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details open={builtOpen} className="group mt-6 rounded-xl border border-line">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 font-semibold">
          <span className="flex items-center gap-2">
            <Wrench className="size-5 text-accent" aria-hidden /> Come l’ho costruito
          </span>
          <ChevronDown className="size-5 text-muted transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-3 border-t border-line px-4 py-3">
          {ai.build_notes.length > 0 && (
            <ul className="list-disc space-y-1 pl-5">
              {ai.build_notes.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          <ul className="space-y-1">
            {ai.sections.map((s) => (
              <li key={s.name}>
                <span className="font-semibold">{s.name}</span> — Metodo: {METHOD_LABELS[s.method]}
                {s.method_why && <span className="text-muted"> — perché: {s.method_why}</span>}
              </li>
            ))}
          </ul>
        </div>
      </details>

      {ai.to_check.length > 0 && (
        <section className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <ClipboardCheck className="size-5 text-amber-700" aria-hidden /> Da controllare
          </h2>
          <ul className="mt-2 space-y-1">
            {ai.to_check.map((c) => (
              <li key={c.text}>
                {c.line_id && allLines.some((l) => l.line_id === c.line_id) ? (
                  <button
                    type="button"
                    onClick={() => {
                      document.getElementById(`line-${c.line_id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      setOpenLine(c.line_id)
                    }}
                    className="min-h-10 text-left underline decoration-amber-400 underline-offset-2"
                  >
                    {c.text}
                  </button>
                ) : (
                  c.text
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mt-8 text-lg font-semibold">Voci{totals.tiers ? ' (opzione Base)' : ''}</h2>
      <p className="text-sm text-muted">Tocca una voce per vedere da dove viene il prezzo e modificarla.</p>
      <div className="mt-2 space-y-5">
        {ai.sections.map((s) => (
          <section key={s.name}>
            <h3 className="flex flex-wrap items-baseline gap-2 text-sm font-semibold tracking-wide text-muted uppercase">
              {s.name}
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium tracking-normal normal-case">{METHOD_LABELS[s.method]}</span>
            </h3>
            <ul className="mt-1 divide-y divide-line border-y border-line">
              {s.lines.map((l) => {
                const p = priced.get(l.line_id)
                const tag = sourceTag(l, p)
                return (
                  <li key={l.line_id} id={`line-${l.line_id}`}>
                    <button
                      type="button"
                      onClick={() => setOpenLine(l.line_id)}
                      className={`flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 py-3 text-left hover:bg-gray-50 ${
                        changedIds.has(l.line_id) ? 'border-l-4 border-accent pl-2' : ''
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{l.description}</span>
                        <span className="mt-0.5 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-gray-100 px-2 py-0.5">
                            {tag.icon} {tag.label}
                          </span>
                          {l.quantity_estimated && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-muted">quantità stimata</span>}
                          {p?.price_missing && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">prezzo mancante</span>
                          )}
                        </span>
                      </span>
                      <span className="text-sm text-muted tabular-nums">
                        {formatQty(l.qty, l.unit)} × {p?.price_source === 'inclusa' ? 'inclusa' : formatEur(p?.unit_price ?? 0)}
                      </span>
                      <span className="w-28 text-right font-semibold tabular-nums">{formatEur(p?.total ?? 0)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      {ai.assumptions.length > 0 && (
        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Lightbulb className="size-5 text-muted" aria-hidden /> Ipotesi
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {ai.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}
      {ai.exclusions.length > 0 && (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Package className="size-5 text-muted" aria-hidden /> Esclusioni
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {ai.exclusions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}
      {(ai.estimated_days != null || ai.team) && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">Tempi stimati</h2>
          <p className="mt-1">
            {ai.estimated_days != null && formatQty(ai.estimated_days, 'giorni')} lavorativi
            {ai.team?.persone ? ` · ${ai.team.persone} ${ai.team.persone === 1 ? 'persona' : 'persone'}` : ''}
            {ai.team?.ore_giorno ? ` · giornata da ${ai.team.ore_giorno} ore` : ''}
          </p>
        </section>
      )}
      <p className="mt-8 flex items-center gap-2 text-sm text-muted">
        <MessageSquare className="size-4" aria-hidden /> Vuoi cambiare qualcosa? Scrivilo o dillo a voce nella chat.
      </p>

      {line && <LineSheet version={version} line={line} priced={priced.get(line.line_id)} onClose={() => setOpenLine(null)} onSaved={onChanged} />}
    </div>
  )
}
