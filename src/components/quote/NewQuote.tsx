import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { useProfile } from '../../profile/ProfileProvider'
import { createQuote, updateQuote } from '../../lib/quotes'
import { postOutgoing, runAi, type Outgoing } from '../../lib/conversation'
import { Composer } from '../chat/Composer'
import { inputClass } from '../onboarding/OptionButton'
import type { Quote } from '../../types/db'

/**
 * Start of a quote: optional client data and the first message (text, voice, files).
 * Quotes start without IVA: it is added on the quote, if needed.
 * The quote row is created only when the first message is sent (no empty drafts).
 */
export function NewQuote({ quote, onStarted }: { quote: Quote | null; onStarted: (q: Quote) => void }) {
  const { session } = useAuth()
  const { profile } = useProfile()
  const [showClient, setShowClient] = useState(false)
  // Kept across a failed attempt, so "Inizia" again doesn't create a second quote.
  const created = useRef<Quote | null>(quote)
  const [client, setClient] = useState({ client_name: quote?.client_name ?? '', client_address: quote?.client_address ?? '', job_title: quote?.job_title ?? '' })

  async function start(out: Outgoing) {
    if (!session) throw new Error('no session')
    const q = (created.current ??= await createQuote())
    await updateQuote(q.id, {
      client_name: client.client_name.trim() || null,
      client_address: client.client_address.trim() || null,
      job_title: client.job_title.trim() || null,
    })
    await postOutgoing(session.user.id, q.id, out)
    await runAi(q.id, 'conversation')
    onStarted(q)
  }

  return (
    <div className="mx-auto max-w-2xl">
      {profile && !profile.onboarding_completed && (
        <p className="mb-4 rounded-xl bg-gray-100 p-3 text-sm">
          Stiamo usando i valori più comuni per le domande che hai saltato.{' '}
          <Link to="/onboarding" className="font-semibold text-accent">
            Completa il tuo metodo
          </Link>
        </p>
      )}

      <button
        type="button"
        onClick={() => setShowClient((v) => !v)}
        aria-expanded={showClient}
        className="flex min-h-12 w-full items-center justify-between rounded-xl border border-line px-4 text-left"
      >
        <span className={client.client_name ? 'font-medium' : 'text-muted'}>
          {client.client_name || 'Cliente e indirizzo'}
          {!client.client_name && <span className="text-sm"> (facoltativo)</span>}
        </span>
        <ChevronDown className={`size-5 text-muted transition-transform ${showClient ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {showClient && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input value={client.client_name} onChange={(e) => setClient({ ...client, client_name: e.target.value })} placeholder="Nome del cliente" aria-label="Cliente" className={inputClass} />
          <input value={client.client_address} onChange={(e) => setClient({ ...client, client_address: e.target.value })} placeholder="Indirizzo del lavoro" aria-label="Indirizzo" className={inputClass} />
          <input
            value={client.job_title}
            onChange={(e) => setClient({ ...client, job_title: e.target.value })}
            placeholder="Titolo (es. Rifacimento impianto)"
            aria-label="Titolo"
            className={`${inputClass} sm:col-span-2`}
          />
        </div>
      )}

      <h1 className="mt-6 text-2xl font-semibold">Descrivi il lavoro</h1>
      <p className="mt-1 text-muted">
        Scrivi, registra un vocale o allega foto, planimetrie e visure. Ti farò qualche domanda prima di preparare il preventivo.
      </p>
      <div className="mt-4">
        <Composer onSend={start} placeholder="Es. Rifacimento impianto appartamento 80 m², 3 camere, cucina, bagno…" sendLabel="Inizia" />
      </div>
    </div>
  )
}
