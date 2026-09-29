import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useProfile } from '../profile/ProfileProvider'
import { useQuote } from '../lib/useQuote'
import { createQuote, quoteNumber } from '../lib/quotes'
import type { Quote } from '../types/db'
import { defaultVatRate } from '../../supabase/functions/_shared/method.ts'
import { DraftForm } from '../components/quote/DraftForm'
import { ClarifyView, ErrorView, GeneratingView } from '../components/quote/StatusViews'
import { ResultView } from '../components/quote/ResultView'

/**
 * /preventivi/nuovo and /preventivi/:id — one screen that follows the latest version:
 * no version → the form; processing → progress; needs_answers → questions; ready → result; error → retry.
 * The quote row is created at the first input (text, recording or file), so no empty drafts.
 */
export function QuotePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { answers } = useProfile()
  const quoteId = id && id !== 'nuovo' ? id : null
  const loaded = useQuote(quoteId)
  const { version, files, reload, setFiles } = loaded
  // The quote created from this screen is known before the reload finishes: keep the form mounted.
  const [created, setCreated] = useState<Quote | null>(null)
  const quote = loaded.quote ?? (created && created.id === quoteId ? created : null)
  const [correcting, setCorrecting] = useState(false)

  const ensureQuote = useCallback(async () => {
    const q = await createQuote(defaultVatRate(answers))
    setCreated(q)
    navigate(`/preventivi/${q.id}`, { replace: true })
    return q
  }, [answers, navigate])

  if (quoteId && !quote) {
    return loaded.loading || !loaded.error ? (
      <div className="flex justify-center py-16" role="status" aria-label="Caricamento">
        <Loader2 className="size-8 animate-spin text-accent" />
      </div>
    ) : (
      <p className="py-10 text-center" role="alert">Qualcosa non ha funzionato, riprova.</p>
    )
  }

  const showForm = !version || correcting
  const header = (
    <div className="mb-6 flex items-center gap-3">
      <Link to="/" aria-label="Torna alla Home" className="flex size-12 items-center justify-center rounded-lg hover:bg-gray-100">
        <ArrowLeft className="size-5" aria-hidden />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{quote ? `Preventivo ${quoteNumber(quote)}` : 'Nuovo preventivo'}</p>
        {quote && showForm && (
          <p className="flex items-center gap-1 text-sm text-green-700">
            <Check className="size-4" aria-hidden /> Bozza salvata
          </p>
        )}
      </div>
    </div>
  )

  return (
    <div>
      {header}
      {showForm ? (
        <DraftForm
          key={correcting ? 'correct' : 'new'}
          quote={quote}
          files={files}
          existing={correcting ? (version ?? undefined) : undefined}
          ensureQuote={ensureQuote}
          onFiles={setFiles}
          onStarted={() => {
            setCorrecting(false)
            void reload()
          }}
        />
      ) : version!.status === 'processing' ? (
        <GeneratingView version={version!} files={files} />
      ) : version!.status === 'needs_answers' ? (
        <ClarifyView version={version!} onCorrect={() => setCorrecting(true)} />
      ) : version!.status === 'ready' ? (
        <ResultView quote={quote!} version={version!} />
      ) : (
        <ErrorView version={version!} />
      )}
    </div>
  )
}
