import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, FileText, Loader2, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { OnboardingBanner } from '../components/OnboardingBanner'
import { supabase } from '../lib/supabase'
import { deleteQuote, quoteNumber, updateQuote } from '../lib/quotes'
import { inputClass } from '../components/onboarding/OptionButton'
import { LEASE_MS } from '../lib/useConversation'
import type { Quote } from '../types/db'

type Item = Quote & { quote_versions: { version: number; status: string }[]; quote_messages: { count: number }[] }

const CHIPS: Record<string, { label: string; className: string }> = {
  // conversation (Task 3b): quotes.phase
  raccolta: { label: 'Ti servono risposte', className: 'bg-amber-100 text-amber-800' },
  pronto_da_generare: { label: 'Da generare', className: 'bg-accent/10 text-accent' },
  generato: { label: 'Pronto', className: 'bg-green-100 text-green-800' },
  in_revisione: { label: 'In revisione', className: 'bg-amber-100 text-amber-800' },
  // the client PDF was sent (Task 5): quotes.status
  inviato: { label: 'Inviato', className: 'bg-green-100 text-green-800' },
  // quotes made before Task 3b: status of the latest version
  processing: { label: 'In preparazione…', className: 'bg-accent/10 text-accent' },
  needs_answers: { label: 'Ti servono risposte', className: 'bg-amber-100 text-amber-800' },
  ready: { label: 'Pronto', className: 'bg-green-100 text-green-800' },
  error: { label: 'Da riprovare', className: 'bg-red-100 text-red-800' },
  draft: { label: 'Bozza', className: 'bg-gray-100 text-muted' },
}

const dateFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' })

export function HomePage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    void supabase
      .from('quotes')
      .select('*, quote_versions(version, status), quote_messages(count)')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (!alive) return
        setError(!!error)
        setItems((data as Item[] | null) ?? [])
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-semibold md:text-3xl">Ciao!</h1>
      {session?.user.email && <p className="mt-1 text-muted">{session.user.email}</p>}

      <div className="mt-6">
        <OnboardingBanner />
      </div>

      <button
        type="button"
        onClick={() => navigate('/preventivi/nuovo')}
        className="mt-6 flex h-16 w-full items-center justify-center gap-2 rounded-xl bg-accent text-lg font-semibold text-white hover:bg-accent-hover md:w-auto md:px-8"
      >
        <Plus className="size-6" aria-hidden />
        Nuovo preventivo
      </button>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">I tuoi preventivi</h2>
        {items === null ? (
          <div className="flex justify-center py-10" role="status" aria-label="Caricamento">
            <Loader2 className="size-7 animate-spin text-accent" />
          </div>
        ) : error ? (
          <p className="mt-4 text-red-700" role="alert">
            Qualcosa non ha funzionato, riprova.
          </p>
        ) : items.length === 0 ? (
          <div className="mt-4 flex flex-col items-center rounded-xl border border-dashed border-line px-6 py-12 text-center">
            <FileText className="size-10 text-muted" aria-hidden />
            <p className="mt-3 font-medium">Nessun preventivo ancora</p>
            <p className="mt-1 text-muted">Tocca “Nuovo preventivo” per iniziare.</p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {items.map((q) => (
              <QuoteRow
                key={q.id}
                q={q}
                onRenamed={(job_title) => setItems((list) => list && list.map((x) => (x.id === q.id ? { ...x, job_title } : x)))}
                onDeleted={() => setItems((list) => list && list.filter((x) => x.id !== q.id))}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

const quoteName = (q: Quote) => q.job_title || q.client_name || `Preventivo ${quoteNumber(q)}`

/** One quote in the list: opens it; the ⋮ button renames or deletes it. */
function QuoteRow({ q, onRenamed, onDeleted }: { q: Item; onRenamed: (title: string | null) => void; onDeleted: () => void }) {
  const [mode, setMode] = useState<'menu' | 'rename' | 'delete' | null>(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const latest = [...q.quote_versions].sort((a, b) => b.version - a.version)[0]
  const conversation = (q.quote_messages[0]?.count ?? 0) > 0
  const working = q.ai_run_started_at && Date.now() - new Date(q.ai_run_started_at).getTime() < LEASE_MS
  const key = working ? 'processing' : q.status === 'inviato' ? 'inviato' : conversation ? q.phase : (latest?.status ?? 'draft')
  const chip = CHIPS[key] ?? CHIPS.draft

  const close = () => {
    setMode(null)
    setError(false)
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(false)
    try {
      await fn()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  const rename = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const next = title.trim() || null
      await updateQuote(q.id, { job_title: next })
      onRenamed(next)
      close()
    })
  }

  return (
    <li>
      <div className="flex items-center">
        <Link to={`/preventivi/${q.id}`} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 hover:bg-gray-50">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{quoteName(q)}</span>
            <span className="text-sm text-muted">
              {quoteNumber(q)} · {dateFmt.format(new Date(q.created_at))}
              {q.client_name && q.job_title ? ` · ${q.client_name}` : ''}
            </span>
          </span>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${chip.className}`}>{chip.label}</span>
          <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
        </Link>
        <button
          type="button"
          onClick={() => (mode ? close() : setMode('menu'))}
          aria-label={`Altre azioni per ${quoteName(q)}`}
          aria-expanded={mode !== null}
          className="flex size-12 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-gray-100"
        >
          <MoreVertical className="size-5" aria-hidden />
        </button>
      </div>

      {mode === 'menu' && (
        <div className="flex flex-wrap gap-2 pb-3">
          <button
            type="button"
            onClick={() => {
              setTitle(q.job_title || q.client_name || '')
              setMode('rename')
            }}
            className="flex h-12 items-center gap-2 rounded-lg border border-line px-4 font-semibold"
          >
            <Pencil className="size-4" aria-hidden /> Rinomina
          </button>
          <button
            type="button"
            onClick={() => setMode('delete')}
            className="flex h-12 items-center gap-2 rounded-lg border border-red-200 px-4 font-semibold text-red-700"
          >
            <Trash2 className="size-4" aria-hidden /> Elimina
          </button>
        </div>
      )}

      {mode === 'rename' && (
        <form onSubmit={rename} className="pb-3">
          <label htmlFor={`title-${q.id}`} className="mb-1 block text-sm font-medium">
            Nome del preventivo
          </label>
          <input
            id={`title-${q.id}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            placeholder="Es. Rifacimento impianto Rossi"
            className={inputClass}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="flex h-12 items-center gap-2 rounded-lg bg-accent px-5 font-semibold text-white disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Salva
            </button>
            <button type="button" onClick={close} className="h-12 px-3 font-semibold text-accent">
              Annulla
            </button>
          </div>
        </form>
      )}

      {mode === 'delete' && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3">
          <p>
            Eliminare <span className="font-semibold">«{quoteName(q)}»</span>? Verranno cancellati anche la chat, i vocali e gli allegati. Non si può
            annullare.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await deleteQuote(q.id)
                  onDeleted()
                })
              }
              className="flex h-12 items-center gap-2 rounded-lg bg-red-700 px-5 font-semibold text-white disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Elimina
            </button>
            <button type="button" onClick={close} className="h-12 px-3 font-semibold text-accent">
              Annulla
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="pb-3 text-red-700" role="alert">
          Qualcosa non ha funzionato, riprova.
        </p>
      )}
    </li>
  )
}
