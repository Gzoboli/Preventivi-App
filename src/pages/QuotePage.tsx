import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useConversation } from '../lib/useConversation'
import { quoteNumber } from '../lib/quotes'
import { cancelProposal, postOutgoing, runAi, sendAnswers, type ChatMessage, type Outgoing } from '../lib/conversation'
import { NewQuote } from '../components/quote/NewQuote'
import { QuoteResult } from '../components/quote/QuoteResult'
import { ResultView } from '../components/quote/ResultView'
import { Composer, type ComposerHandle } from '../components/chat/Composer'
import { MessageList, type ChatActions } from '../components/chat/Messages'
import { JobSheetPanel } from '../components/chat/JobSheetPanel'
import { normalizeJobSheet, type Totals } from '../../supabase/functions/_shared/pricing.ts'
import type { Mode } from '../../supabase/functions/_shared/aiSchema.ts'
import type { Quote } from '../types/db'

/**
 * /preventivi/nuovo and /preventivi/:id.
 * Before the quote exists: the conversation with the AI + "Scheda lavoro".
 * After: the quote ("Come l'ho costruito", lines, what to check) with the conversation next to it.
 */
export function QuotePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const quoteId = id && id !== 'nuovo' ? id : null
  const c = useConversation(quoteId)
  const { markSent } = c

  // Coming from "Inizia": the AI is already working on the first message.
  const justStarted = (location.state as { started?: boolean } | null)?.started
  useEffect(() => {
    if (justStarted) markSent()
  }, [quoteId, justStarted, markSent])

  const started = (q: Quote) =>
    navigate(`/preventivi/${q.id}`, {
      replace: true,
      state: { started: true },
    })

  if (!quoteId) {
    return (
      <Page title="Nuovo preventivo">
        <NewQuote quote={null} onStarted={started} />
      </Page>
    )
  }
  if (!c.quote) {
    return c.loading || !c.error ? (
      <div className="flex justify-center py-16" role="status" aria-label="Caricamento">
        <Loader2 className="size-8 animate-spin text-accent" />
      </div>
    ) : (
      <p className="py-10 text-center" role="alert">
        Qualcosa non ha funzionato, riprova.
      </p>
    )
  }

  const title = `Preventivo ${quoteNumber(c.quote)}`
  if (c.legacy) {
    const out = c.version?.ai_output as Record<string, unknown> | null
    return (
      <Page title={title} subtitle={c.quote.client_name}>
        {c.version?.status === 'ready' && out && 'rooms' in out ? (
          <ResultView quote={c.quote} version={c.version} />
        ) : (
          <p className="mx-auto max-w-lg rounded-xl bg-gray-100 p-4">
            Questo preventivo è stato iniziato con la versione precedente dell’app e non si può continuare. Creane uno nuovo dalla Home.
          </p>
        )}
      </Page>
    )
  }
  if (!c.messages.length && !c.version) {
    return (
      <Page title={title}>
        <NewQuote quote={c.quote} onStarted={started} />
      </Page>
    )
  }
  return (
    <Page title={title} subtitle={c.quote.client_name} wide>
      <Conversation c={c} />
    </Page>
  )
}

function Page({ title, subtitle, wide, children }: { title: string; subtitle?: string | null; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? '' : 'mx-auto max-w-3xl'}>
      <div className="mb-6 flex items-center gap-3">
        <Link to="/" aria-label="Torna alla Home" className="flex size-12 items-center justify-center rounded-lg hover:bg-gray-100">
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{title}</p>
          {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

function Conversation({ c }: { c: ReturnType<typeof useConversation> }) {
  const { session } = useAuth()
  const composer = useRef<ComposerHandle>(null)
  const end = useRef<HTMLDivElement>(null)
  const aside = useRef<HTMLElement>(null)
  const [confirmNow, setConfirmNow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const quote = c.quote!
  const out = c.version?.ai_output as Record<string, unknown> | null | undefined
  const generated = !!c.version && !!out && 'sections' in out
  const sheet = normalizeJobSheet(quote.job_sheet)
  const totals = c.version?.totals as unknown as Totals | undefined
  const currentTotal = generated && totals ? (totals.tiers?.base ?? totals.single).imponibile : null

  // Keep the latest message in view while collecting facts.
  const count = c.messages.length
  useEffect(() => {
    if (!generated) end.current?.scrollIntoView({ block: 'end' })
    // Desktop: the chat column scrolls on its own; show its latest messages.
    else if (aside.current) aside.current.scrollTop = aside.current.scrollHeight
  }, [count, generated])

  /** Starts an AI run; the reply arrives in the chat. */
  async function ask(fn: () => Promise<void>) {
    setError(null)
    c.markSent()
    try {
      await fn()
    } catch {
      setError('Qualcosa non ha funzionato, riprova.')
    }
    void c.reload()
  }

  async function send(o: Outgoing) {
    if (!session) throw new Error('no session')
    await postOutgoing(session.user.id, quote.id, o)
    await ask(() => runAi(quote.id, generated ? 'revise' : 'conversation'))
  }

  const actions: ChatActions = {
    sendAnswers: async (_message: ChatMessage, answers, methods) => {
      if (!session) throw new Error('no session')
      await sendAnswers(
        session.user.id,
        quote.id,
        {
          answers: answers.map((a) => ({
            question_id: a.question_id,
            question: a.question,
            selected: a.selected,
            custom: a.out.text.trim() || null,
          })),
          method_choices: methods,
        },
        answers
          .filter((a) => a.out.audio || a.out.files.length)
          .map((a) => ({
            question_id: a.question_id,
            question: a.question,
            out: a.out,
          })),
      )
      await ask(() => runAi(quote.id, generated ? 'revise' : 'conversation'))
    },
    generate: (force) => ask(() => runAi(quote.id, 'generate', { force })),
    // No mode (no reply at all): the usual one for this phase.
    retry: (p) =>
      ask(() =>
        runAi(quote.id, (p.mode || (generated ? 'revise' : 'conversation')) as Mode, { proposalMessageId: p.proposal_message_id ?? undefined }),
      ),
    applyProposal: (m) => ask(() => runAi(quote.id, 'apply', { proposalMessageId: m.id })),
    cancelProposal: async (m) => {
      await cancelProposal(quote.id, m)
      void c.reload()
    },
    modifyProposal: () => composer.current?.focus('Modifica la proposta: '),
    changed: () => void c.reload(),
  }

  // While the AI's questions wait for an answer, they have their own text and voice inputs.
  const lastReply = [...c.messages].reverse().find((m) => m.role !== 'electrician' || m.kind !== 'note')
  const questionsOpen = !c.busy && lastReply?.role === 'assistant' && lastReply.kind === 'questions'

  const chat = (
    <div className="space-y-4">
      <MessageList messages={c.messages} files={c.files} busy={c.busy} noReply={c.noReply} currentTotal={currentTotal} actions={actions} />
      {error && (
        <p className="text-red-700" role="alert">
          {error}
        </p>
      )}
      {!generated && (
        <div className="space-y-2">
          {quote.phase === 'pronto_da_generare' && (
            <button
              type="button"
              disabled={c.busy}
              onClick={() => void actions.generate(false)}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-lg font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
            >
              <Sparkles className="size-5" aria-hidden /> Genera preventivo
            </button>
          )}
          {confirmNow ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p>Alcune cose mancano: le metto tra le ipotesi, così puoi controllarle nel preventivo.</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmNow(false)
                    void actions.generate(true)
                  }}
                  className="h-12 rounded-lg bg-accent px-4 font-semibold text-white"
                >
                  Genera comunque
                </button>
                <button type="button" onClick={() => setConfirmNow(false)} className="h-12 px-3 font-semibold text-accent">
                  Annulla
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={c.busy}
              onClick={() => (quote.phase === 'pronto_da_generare' ? void actions.generate(true) : setConfirmNow(true))}
              className="h-12 w-full rounded-xl border border-line font-semibold disabled:opacity-60"
            >
              Genera ora
            </button>
          )}
        </div>
      )}
      {!questionsOpen && (
        <Composer
          ref={composer}
          onSend={send}
          disabled={c.busy}
          placeholder={generated ? 'Cosa vuoi cambiare? Es. «il cavo è 400 metri»' : 'Scrivi un messaggio…'}
        />
      )}
      <div ref={end} />
    </div>
  )

  if (generated) {
    return (
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start lg:gap-8">
        <QuoteResult quote={quote} version={c.version!} previous={c.previous} onChanged={() => void c.reload()} />
        <aside ref={aside} className="mt-10 space-y-4 lg:sticky lg:top-4 lg:mt-0 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto" aria-label="Chat">
          <h2 className="text-lg font-semibold">Chat</h2>
          <JobSheetPanel sheet={sheet} />
          {chat}
        </aside>
      </div>
    )
  }
  // Collecting facts: one centred column (summary of what is known, then the conversation).
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <JobSheetPanel sheet={sheet} />
      {chat}
    </div>
  )
}
