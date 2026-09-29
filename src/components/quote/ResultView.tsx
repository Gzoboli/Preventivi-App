import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { updateQuote, type AiQuote, type Totals } from '../../lib/quotes'
import { round2 } from '../../../supabase/functions/_shared/totals.ts'
import { TIERS } from '../../lib/onboarding/questions'
import type { Quote, QuoteVersion, VatRate } from '../../types/db'

const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const num = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 })

/** Simple read-only result (Task 4 builds the full review screen). */
export function ResultView({ quote, version }: { quote: Quote; version: QuoteVersion }) {
  const ai = version.ai_output as unknown as AiQuote
  const totals = version.totals as unknown as Totals
  const [vat, setVat] = useState<VatRate>((quote.vat_rate as VatRate) ?? totals.vat_rate)

  // IVA can be changed after generation: the taxable amount doesn't depend on it.
  const withVat = (imponibile: number) => {
    const iva = round2((imponibile * vat) / 100)
    return { iva, totale: round2(imponibile + iva) }
  }
  const priced = (r: number, l: number) => totals.lines.find((x) => x.room === r && x.line === l)

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold md:text-3xl">{quote.job_title || ai.title}</h1>
      <p className="mt-2 text-muted">{ai.summary}</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {TIERS.map((t) => {
          const tier = totals[t.id]
          const { totale } = withVat(tier.imponibile)
          const unsure = tier.uplift_missing || tier.to_confirm_count > 0
          return (
            <section key={t.id} className={`rounded-xl border p-4 ${t.id === 'media' ? 'border-accent' : 'border-line'}`}>
              <h2 className="font-semibold">{t.label}</h2>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{eur.format(totale)}</p>
              <p className="text-sm text-muted">IVA {vat}% inclusa · imponibile {eur.format(tier.imponibile)}</p>
              {unsure && (
                <p className="mt-2 flex items-start gap-1 text-sm text-amber-700">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {tier.uplift_missing ? 'Sovrapprezzo della serie da confermare' : `${tier.to_confirm_count} voci da confermare`}
                </p>
              )}
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                {ai.tiers[t.id].what_you_get.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      <div className="mt-4 flex items-center gap-2" role="radiogroup" aria-label="IVA">
        <span className="mr-1 text-sm text-muted">IVA:</span>
        {([10, 22, 4] as VatRate[]).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={vat === v}
            onClick={() => {
              setVat(v)
              void updateQuote(quote.id, { vat_rate: v })
            }}
            className={`h-12 min-w-16 rounded-lg border px-3 font-semibold ${vat === v ? 'border-accent bg-accent text-white' : 'border-line'}`}
          >
            {v}%
          </button>
        ))}
      </div>

      <h2 className="mt-8 text-lg font-semibold">Voci (opzione Base)</h2>
      <div className="mt-2 space-y-5">
        {ai.rooms.map((room, r) => (
          <section key={r}>
            <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">{room.name}</h3>
            <ul className="mt-1 divide-y divide-line border-y border-line">
              {room.lines.map((line, l) => {
                const p = priced(r, l)
                return (
                  <li key={l} className="flex flex-wrap items-baseline gap-x-3 py-2">
                    <span className="min-w-0 flex-1">
                      {line.description}
                      {p?.to_confirm && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">da confermare</span>
                      )}
                      {line.note && <span className="block text-sm text-muted">{line.note}</span>}
                    </span>
                    <span className="text-sm text-muted tabular-nums">
                      {num.format(line.qty)} {line.unit} × {eur.format(p?.unit_price ?? 0)}
                    </span>
                    <span className="w-24 text-right font-medium tabular-nums">{eur.format(p?.total ?? 0)}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      {ai.assumptions.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Ipotesi</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">{ai.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
        </section>
      )}
      {ai.exclusions.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">Esclusioni</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">{ai.exclusions.map((a) => <li key={a}>{a}</li>)}</ul>
        </section>
      )}
      {(quote.estimated_days ?? ai.estimated_days) != null && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">Tempi stimati</h2>
          <p className="mt-1">{num.format((quote.estimated_days ?? ai.estimated_days) as number)} giorni lavorativi</p>
        </section>
      )}
    </div>
  )
}
