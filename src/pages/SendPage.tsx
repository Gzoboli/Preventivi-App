import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Check, Download, ExternalLink, Loader2, Mail, MessageCircle } from 'lucide-react'
import { useProfile } from '../profile/ProfileProvider'
import { useConversation } from '../lib/useConversation'
import { markSent, quoteNumber, undoSent, updateQuote } from '../lib/quotes'
import { buildClientQuote, type ClientQuote } from '../lib/pdf/clientQuote'
import { logoDataUrl } from '../lib/pdf/logo'
import { canShareFile, downloadBlob, mailtoUrl, shareFile, whatsappText, whatsappUrl } from '../lib/pdf/share'
import { CompanyForm } from '../components/CompanyForm'
import { VatPicker } from '../components/quote/VatPicker'
import { Plate, TIER_PLATES } from '../components/quote/Plate'
import { TIERS, type TierId } from '../lib/onboarding/questions'
import type { AiQuote, Totals } from '../../supabase/functions/_shared/pricing.ts'

type Made = { model: ClientQuote; blob: Blob; file: File; url: string }

/**
 * /preventivi/:id/pdf — "Pronto da inviare?" (IVA, company data, open problems, options) and then
 * "Invia il preventivo" (preview, WhatsApp, email, download). The PDF is made in the browser.
 */
export function SendPage() {
  const { id } = useParams()
  const c = useConversation(id ?? null)
  const { profile, answers } = useProfile()
  const [made, setMade] = useState<Made | null>(null)

  if (!c.quote || !profile) {
    return c.error ? (
      <p className="py-10 text-center" role="alert">
        Qualcosa non ha funzionato, riprova.
      </p>
    ) : (
      <div className="flex justify-center py-16" role="status" aria-label="Caricamento">
        <Loader2 className="size-8 animate-spin text-accent" />
      </div>
    )
  }
  const out = c.version?.ai_output as unknown as AiQuote | null
  if (!c.version || !out?.sections) {
    return (
      <Shell back={`/preventivi/${c.quote.id}`} title="PDF per il cliente">
        <p className="rounded-xl bg-gray-100 p-4">Prima genera il preventivo: il PDF si crea dal preventivo pronto.</p>
      </Shell>
    )
  }

  return made ? (
    <SendStep quote={c.quote} version={c.version.version} made={made} onBack={() => setMade(null)} />
  ) : (
    <CheckStep
      quote={c.quote}
      ai={out}
      totals={c.version.totals as unknown as Totals}
      onMade={setMade}
      build={async (vatRate, tier, showPrices) =>
        buildClientQuote({
          quote: c.quote!,
          ai: out,
          totals: c.version!.totals as unknown as Totals,
          profile,
          logo: await logoDataUrl(profile.logo_path),
          answers,
          vatRate,
          tier,
          showPrices,
          date: new Date(),
        })
      }
    />
  )
}

function Shell({ back, title, children }: { back: string; title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Link to={back} aria-label="Torna al preventivo" className="flex size-12 items-center justify-center rounded-lg hover:bg-gray-100">
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <h1 className="text-2xl font-semibold">{title}</h1>
      </div>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------- 1. Pronto da inviare?

function CheckStep({
  quote,
  ai,
  totals,
  build,
  onMade,
}: {
  quote: NonNullable<ReturnType<typeof useConversation>['quote']>
  ai: AiQuote
  totals: Totals
  build: (vatRate: number, tier: TierId, showPrices: boolean) => Promise<ClientQuote>
  onMade: (m: Made) => void
}) {
  const { profile } = useProfile()
  const [vat, setVat] = useState<number | null>(quote.vat_rate == null ? null : Number(quote.vat_rate))
  const [tier, setTier] = useState<TierId>((quote.selected_tier as TierId | null) ?? 'media')
  const [showPrices, setShowPrices] = useState(quote.show_unit_prices)
  const [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const missingCompany = [
    !profile?.company_name?.trim() && 'ragione sociale',
    !profile?.vat_number?.trim() && 'P.IVA',
    !profile?.phone?.trim() && 'telefono',
  ].filter(Boolean) as string[]

  const problems = useMemo(() => {
    const list: string[] = []
    const lines = new Map(ai.sections.flatMap((s) => s.lines).map((l) => [l.line_id, l]))
    for (const l of totals.lines) {
      if (l.price_missing)
        list.push(`Manca il prezzo di «${lines.get(l.line_id)?.description ?? 'una voce'}»: nel PDF sarà «da definire in sopralluogo».`)
    }
    for (const f of totals.flags) list.push(f.message)
    if (totals.tiers) {
      for (const t of TIERS)
        if (totals.tiers[t.id].uplift_missing) list.push(`Il prezzo dell’opzione ${t.label} è da confermare (manca il sovrapprezzo della serie).`)
    }
    return list
  }, [ai, totals])

  const blocker =
    vat == null
      ? 'Scegli l’IVA per continuare.'
      : missingCompany.length
        ? `Completa i dati della tua azienda: ${missingCompany.join(', ')}.`
        : problems.length && !accepted
          ? 'Completa le voci segnalate oppure tocca «Continua lo stesso».'
          : null

  async function create() {
    if (vat == null) return
    setBusy(true)
    setError(null)
    try {
      await updateQuote(quote.id, { vat_rate: vat, selected_tier: tier, show_unit_prices: showPrices })
      const model = await build(vat, tier, showPrices)
      const { renderClientPdf } = await import('../components/pdf/render')
      const blob = await renderClientPdf(model)
      const file = new File([blob], model.fileName, { type: 'application/pdf' })
      onMade({ model, blob, file, url: URL.createObjectURL(blob) })
    } catch {
      setError('Qualcosa non ha funzionato, riprova.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell back={`/preventivi/${quote.id}`} title="Pronto da inviare?">
      <div className="space-y-8">
        <section>
          <h2 className="text-lg font-semibold">IVA del preventivo</h2>
          <p className="mt-1 mb-3 text-muted">Decidi tu: senza IVA, 4%, 10%, 22% o un’altra percentuale.</p>
          <VatPicker value={vat} onChange={setVat} label="" />
        </section>

        {missingCompany.length > 0 && (
          <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <AlertTriangle className="size-5 text-amber-600" aria-hidden /> Mancano i dati della tua azienda
            </h2>
            <p className="mt-1 mb-4">Il cliente li vede in alto nel PDF. Mancano: {missingCompany.join(', ')}.</p>
            <div className="rounded-lg bg-white p-4">
              <CompanyForm />
            </div>
          </section>
        )}

        {problems.length > 0 && (
          <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <AlertTriangle className="size-5 text-amber-600" aria-hidden /> Da controllare
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {problems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to={`/preventivi/${quote.id}`} className="flex h-12 items-center rounded-lg border border-amber-400 bg-white px-4 font-semibold">
                Completa
              </Link>
              <button
                type="button"
                onClick={() => setAccepted(true)}
                aria-pressed={accepted}
                className={`flex h-12 items-center gap-2 rounded-lg px-4 font-semibold ${accepted ? 'bg-amber-600 text-white' : 'text-amber-800'}`}
              >
                {accepted && <Check className="size-4" aria-hidden />} Continua lo stesso
              </button>
            </div>
          </section>
        )}

        {totals.tiers && (
          <section>
            <h2 className="text-lg font-semibold">Quale opzione dettagliare?</h2>
            <p className="mt-1 mb-3 text-muted">Nella prima pagina il cliente vede tutte e tre; nella seconda il dettaglio di quella scelta.</p>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Opzione da dettagliare">
              {TIERS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={tier === t.id}
                  onClick={() => setTier(t.id)}
                  className={`flex min-h-14 items-center gap-3 rounded-xl border px-3 text-left font-semibold ${tier === t.id ? 'border-accent ring-2 ring-accent/30' : 'border-line'}`}
                >
                  <Plate style={TIER_PLATES[t.id].style} color={TIER_PLATES[t.id].color} size={32} />
                  <span>
                    {t.label}
                    <span className="block text-sm font-normal text-muted">{ai.tiers?.[t.id === 'media' ? 'consigliata' : t.id]?.series}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-xl border border-line px-4">
            <span>
              <span className="block font-semibold">Mostra il dettaglio dei prezzi</span>
              <span className="text-sm text-muted">Aggiunge una pagina con quantità e prezzi di ogni voce (anche ore e tariffe).</span>
            </span>
            <input type="checkbox" checked={showPrices} onChange={(e) => setShowPrices(e.target.checked)} className="size-6 shrink-0 accent-accent" />
          </label>
        </section>

        <div>
          <button
            type="button"
            disabled={!!blocker || busy}
            onClick={() => void create()}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-lg font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy && <Loader2 className="size-5 animate-spin" aria-hidden />}
            {busy ? 'Preparo il PDF…' : 'Crea il PDF'}
          </button>
          {blocker && <p className="mt-2 text-center text-muted">{blocker}</p>}
          {error && (
            <p className="mt-2 text-center text-red-700" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </Shell>
  )
}

// ---------------------------------------------------------------- 2. Invia il preventivo

function SendStep({
  quote,
  version,
  made,
  onBack,
}: {
  quote: NonNullable<ReturnType<typeof useConversation>['quote']>
  version: number
  made: Made
  onBack: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<'loading' | 'ready' | 'error'>('loading')
  const [toast, setToast] = useState<{ undo: Awaited<ReturnType<typeof markSent>> } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { model, blob, file, url } = made
  const mobileShare = canShareFile(file)
  const text = whatsappText(model.title, model.company.name)

  useEffect(() => {
    let alive = true
    void import('../lib/pdf/preview')
      .then(({ renderFirstPage }) => renderFirstPage(blob, canvas.current!, Math.min(box.current?.clientWidth ?? 360, 560)))
      .then(() => alive && setPreview('ready'))
      .catch(() => alive && setPreview('error'))
    return () => {
      alive = false
    }
  }, [blob])

  useEffect(() => () => URL.revokeObjectURL(url), [url])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 10_000)
    return () => clearTimeout(t)
  }, [toast])

  async function sent() {
    try {
      setToast({ undo: await markSent(quote, version) })
    } catch {
      setError('Il PDF è pronto, ma non sono riuscito a segnarlo come inviato.')
    }
  }

  async function whatsapp() {
    const r = await shareFile(file, { title: `Preventivo ${model.title}`, text })
    if (r === 'shared') return void sent()
    if (r === 'cancelled') return
    downloadBlob(blob, file.name)
    window.open(whatsappUrl(text), '_blank', 'noopener')
    void sent()
  }

  async function email() {
    const subject = `Preventivo ${model.title}`
    const r = await shareFile(file, { title: subject, text })
    if (r === 'shared') return void sent()
    if (r === 'cancelled') return
    downloadBlob(blob, file.name)
    window.location.href = mailtoUrl(subject, `${text}\n\n(Allego il PDF del preventivo.)`)
    void sent()
  }

  function download() {
    downloadBlob(blob, file.name)
    void sent()
  }

  const action = 'flex h-14 w-full items-center justify-center gap-2 rounded-xl text-lg font-semibold'
  return (
    <Shell back={`/preventivi/${quote.id}`} title="Invia il preventivo">
      <p className="-mt-3 mb-4 text-muted">
        Preventivo {quoteNumber(quote)}
        {model.client ? ` · ${model.client}` : ''} · {file.name}
      </p>

      <div className="md:grid md:grid-cols-[minmax(0,1fr)_16rem] md:gap-6">
        <div ref={box}>
          <div className="relative overflow-hidden rounded-lg border border-line bg-white">
            {preview === 'loading' && (
              <div className="flex aspect-[210/297] items-center justify-center" role="status" aria-label="Preparo l’anteprima">
                <Loader2 className="size-7 animate-spin text-accent" />
              </div>
            )}
            {preview === 'error' && <p className="p-4 text-muted">Anteprima non disponibile: apri il PDF per vederlo.</p>}
            <canvas ref={canvas} className={preview === 'ready' ? 'block' : 'hidden'} aria-label="Anteprima della prima pagina" />
          </div>
          <a href={url} target="_blank" rel="noopener" className="mt-2 flex h-12 items-center justify-center gap-2 font-semibold text-accent">
            <ExternalLink className="size-4" aria-hidden /> Apri anteprima (tutte le pagine)
          </a>
        </div>

        <div className="mt-4 space-y-3 md:mt-0">
          <button type="button" onClick={() => void whatsapp()} className={`${action} bg-accent text-white hover:bg-accent-hover`}>
            <MessageCircle className="size-5" aria-hidden /> Condividi su WhatsApp
          </button>
          <button type="button" onClick={() => void email()} className={`${action} border border-line`}>
            <Mail className="size-5" aria-hidden /> Invia per email
          </button>
          <button type="button" onClick={download} className={`${action} border border-line`}>
            <Download className="size-5" aria-hidden /> Scarica PDF
          </button>
          {!mobileShare && <p className="text-sm text-muted">Da computer: scarico il PDF e apro WhatsApp o la posta; allega il file scaricato.</p>}
          <button type="button" onClick={onBack} className="h-12 w-full font-semibold text-accent">
            Cambia IVA o opzioni
          </button>
          {error && (
            <p className="text-red-700" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>

      {toast && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-20 z-20 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl bg-ink px-4 py-3 text-white md:bottom-6"
        >
          <span className="flex items-center gap-2">
            <Check className="size-5" aria-hidden /> Segnato come inviato
          </span>
          <button
            type="button"
            onClick={() => {
              const u = toast.undo
              setToast(null)
              void undoSent(quote.id, u).catch(() => setError('Qualcosa non ha funzionato, riprova.'))
            }}
            className="h-12 px-2 font-semibold underline"
          >
            Annulla
          </button>
        </div>
      )}
    </Shell>
  )
}
