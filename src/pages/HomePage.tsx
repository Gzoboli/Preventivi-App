import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, FileText, Loader2, Plus } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { OnboardingBanner } from '../components/OnboardingBanner'
import { supabase } from '../lib/supabase'
import { quoteNumber } from '../lib/quotes'
import type { Quote } from '../types/db'

type Item = Quote & { quote_versions: { version: number; status: string }[] }

const CHIPS: Record<string, { label: string; className: string }> = {
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
      .select('*, quote_versions(version, status)')
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
          <p className="mt-4 text-red-700" role="alert">Qualcosa non ha funzionato, riprova.</p>
        ) : items.length === 0 ? (
          <div className="mt-4 flex flex-col items-center rounded-xl border border-dashed border-line px-6 py-12 text-center">
            <FileText className="size-10 text-muted" aria-hidden />
            <p className="mt-3 font-medium">Nessun preventivo ancora</p>
            <p className="mt-1 text-muted">Tocca “Nuovo preventivo” per iniziare.</p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {items.map((q) => {
              const latest = [...q.quote_versions].sort((a, b) => b.version - a.version)[0]
              const chip = CHIPS[latest?.status ?? 'draft'] ?? CHIPS.draft
              return (
                <li key={q.id}>
                  <Link to={`/preventivi/${q.id}`} className="flex min-h-16 items-center gap-3 py-3 hover:bg-gray-50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{q.job_title || q.client_name || `Preventivo ${quoteNumber(q)}`}</span>
                      <span className="text-sm text-muted">
                        {quoteNumber(q)} · {dateFmt.format(new Date(q.created_at))}
                        {q.client_name && q.job_title ? ` · ${q.client_name}` : ''}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${chip.className}`}>{chip.label}</span>
                    <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
