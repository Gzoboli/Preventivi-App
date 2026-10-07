import { useEffect, useState } from 'react'
import { AlertTriangle, Bot, Check, FileText, Loader2, Lightbulb, Minus, Pencil, Plus, RotateCcw, Sparkles } from 'lucide-react'
import { AttachBar } from './Attachments'
import { Chip, inputClass } from '../onboarding/OptionButton'
import { EMPTY_OUTGOING, isEmpty, signedUrl, updateMessageText, type ChatMessage, type Outgoing } from '../../lib/conversation'
import { METHOD_LABELS, type AnswersPayload, type ErrorPayload, type ProposalPayload, type QuoteReadyPayload, type ReadyPayload } from '../../../supabase/functions/_shared/chat.ts'
import type { AiQuestions, Method } from '../../../supabase/functions/_shared/pricing.ts'
import { formatEur } from '../../../supabase/functions/_shared/format.ts'
import type { QuoteFile } from '../../types/db'

export type QuestionAnswer = { question_id: string; question: string; selected: string[]; out: Outgoing }
export type MethodChoice = { section: string; method: Method; confirmed: boolean }

export type ChatActions = {
  sendAnswers: (message: ChatMessage, answers: QuestionAnswer[], methods: MethodChoice[]) => Promise<void>
  generate: (force: boolean) => Promise<void>
  retry: (payload: ErrorPayload) => Promise<void>
  applyProposal: (message: ChatMessage) => Promise<void>
  cancelProposal: (message: ChatMessage) => Promise<void>
  modifyProposal: () => void
  /** After a change saved directly (e.g. a corrected transcript). */
  changed: () => void
}

type Props = {
  messages: ChatMessage[]
  files: QuoteFile[]
  busy: boolean
  noReply: boolean
  /** Current total (single price or Base), for the proposal's new total. */
  currentTotal: number | null
  actions: ChatActions
}

/** The quote conversation, WhatsApp-like: electrician on the right, assistant on the left. */
export function MessageList({ messages, files, busy, noReply, currentTotal, actions }: Props) {
  const lastIndex = (pred: (m: ChatMessage) => boolean) => messages.reduce((acc, m, i) => (pred(m) ? i : acc), -1)
  const lastElectrician = lastIndex((m) => m.role === 'electrician' && m.kind !== 'note')
  const lastAssistant = lastIndex((m) => m.role !== 'electrician')
  // Only the latest AI reply is actionable, and only until he writes again.
  const actionable = (i: number) => i === lastAssistant && lastElectrician < i && !busy

  return (
    <ol className="space-y-3" aria-label="Conversazione">
      {messages.map((m, i) => (
        <li key={m.id}>
          <Message m={m} files={files} active={actionable(i)} currentTotal={currentTotal} actions={actions} />
        </li>
      ))}
      {busy && (
        <li role="status" className="flex items-center gap-2 text-muted">
          <Loader2 className="size-5 animate-spin text-accent" aria-hidden /> Sto pensando…
        </li>
      )}
      {noReply && (
        <li>
          <Problem text="Non ho ricevuto risposta. Riprova: quello che hai scritto è salvato." onRetry={() => actions.retry({ error: true, mode: '' })} />
        </li>
      )}
    </ol>
  )
}

function Message({ m, files, active, currentTotal, actions }: { m: ChatMessage; files: QuoteFile[]; active: boolean; currentTotal: number | null; actions: ChatActions }) {
  if (m.role === 'system') {
    const p = m.payload as unknown as ErrorPayload
    return <Problem text={m.text ?? 'Qualcosa non ha funzionato, riprova.'} onRetry={active && p.error ? () => actions.retry(p) : undefined} />
  }
  if (m.role === 'electrician') {
    if (m.kind === 'note') return <p className="mx-auto max-w-md text-center text-sm text-muted">📝 {m.text}</p>
    const about = (m.payload as { question?: string }).question
    return (
      <div className="ml-auto max-w-[85%] space-y-1 rounded-2xl rounded-br-sm bg-accent/10 px-4 py-3">
        {about && <p className="text-xs font-semibold text-muted">Risposta a: {about}</p>}
        {m.kind === 'voice' ? (
          <VoiceBubble m={m} files={files} onSaved={actions.changed} />
        ) : m.kind === 'file' ? (
          <FileList ids={m.file_ids} files={files} />
        ) : (m.payload as Partial<AnswersPayload>).answers ? (
          <AnswersSummary payload={m.payload as unknown as AnswersPayload} />
        ) : (
          <p className="whitespace-pre-line">{m.text}</p>
        )}
      </div>
    )
  }

  // assistant
  switch (m.kind) {
    case 'questions':
      return <QuestionsCard m={m} active={active} actions={actions} />
    case 'proposal':
      return <ProposalCard m={m} active={active} currentTotal={currentTotal} actions={actions} />
    case 'quote_ready': {
      const p = m.payload as unknown as QuoteReadyPayload
      return (
        <AssistantBox>
          <p className="flex items-center gap-2 font-semibold">
            <Sparkles className="size-5 text-accent" aria-hidden /> Preventivo pronto (versione {p.version})
          </p>
          {p.summary && <p className="mt-1 text-muted">{p.summary}</p>}
        </AssistantBox>
      )
    }
    default: {
      const p = m.payload as Partial<ReadyPayload>
      if (p.type === 'ready_to_generate') {
        return (
          <AssistantBox>
            <p className="font-semibold">Ho tutto quello che serve</p>
            <p className="mt-1 whitespace-pre-line">{p.summary}</p>
            {active && (
              <button
                type="button"
                onClick={() => void actions.generate(false)}
                className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-lg font-semibold text-white hover:bg-accent-hover"
              >
                <Sparkles className="size-5" aria-hidden /> Genera preventivo
              </button>
            )}
          </AssistantBox>
        )
      }
      return (
        <AssistantBox>
          <p className="whitespace-pre-line">{m.text}</p>
        </AssistantBox>
      )
    }
  }
}

function AssistantBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex max-w-[95%] gap-2">
      <Bot className="mt-3 size-5 shrink-0 text-accent" aria-hidden />
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-line bg-white px-4 py-3">{children}</div>
    </div>
  )
}

function Problem({ text, onRetry }: { text: string; onRetry?: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3" role="alert">
      <p className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
        {text}
      </p>
      {onRetry && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onRetry()
            } finally {
              setBusy(false)
            }
          }}
          className="mt-2 flex h-12 items-center gap-2 rounded-lg border border-amber-400 bg-white px-4 font-semibold"
        >
          <RotateCcw className="size-4" aria-hidden /> Riprova
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- electrician content

function VoiceBubble({ m, files, onSaved }: { m: ChatMessage; files: QuoteFile[]; onSaved: () => void }) {
  const file = files.find((f) => f.id === m.audio_file_id)
  const [url, setUrl] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(m.text ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (file) void signedUrl('audio', file.storage_path).then(setUrl)
  }, [file])
  useEffect(() => setText(m.text ?? ''), [m.text])

  return (
    <div className="space-y-2">
      {url ? <audio src={url} controls className="h-10 w-full max-w-72" aria-label="Vocale" /> : <p className="text-sm text-muted">🎙 Vocale</p>}
      {m.text == null ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Trascrivo il vocale…
        </p>
      ) : editing ? (
        <div className="space-y-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="Trascrizione" className={`${inputClass} h-auto py-2`} />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true)
                try {
                  await updateMessageText(m.id, text.trim())
                  setEditing(false)
                  onSaved()
                } finally {
                  setSaving(false)
                }
              }}
              className="h-12 rounded-lg bg-accent px-4 font-semibold text-white"
            >
              Salva
            </button>
            <button type="button" onClick={() => setEditing(false)} className="h-12 px-3 font-semibold text-accent">
              Annulla
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm whitespace-pre-line italic">“{m.text || '(vocale vuoto)'}”</p>
          <button type="button" onClick={() => setEditing(true)} className="mt-1 flex h-10 items-center gap-1 text-sm font-semibold text-accent">
            <Pencil className="size-4" aria-hidden /> Correggi la trascrizione
          </button>
        </div>
      )}
    </div>
  )
}

function FileList({ ids, files }: { ids: string[]; files: QuoteFile[] }) {
  return (
    <ul className="space-y-1">
      {ids.map((id) => {
        const f = files.find((x) => x.id === id)
        return (
          <li key={id}>
            <button
              type="button"
              disabled={!f}
              onClick={async () => {
                if (!f) return
                const url = await signedUrl('quote-files', f.storage_path)
                if (url) window.open(url, '_blank', 'noopener')
              }}
              className="flex min-h-10 items-center gap-2 text-left font-medium underline-offset-2 hover:underline"
            >
              <FileText className="size-4 shrink-0" aria-hidden /> {f?.file_name ?? 'File'}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function AnswersSummary({ payload }: { payload: AnswersPayload }) {
  return (
    <ul className="space-y-1">
      {payload.method_choices?.map((c) => (
        <li key={c.section}>
          <span className="text-muted">Metodo {c.section}:</span> {c.confirmed ? `confermato (${METHOD_LABELS[c.method]})` : METHOD_LABELS[c.method]}
        </li>
      ))}
      {payload.answers
        .filter((a) => a.selected.length || a.custom)
        .map((a) => (
          <li key={a.question_id}>
            <span className="text-muted">{a.question}</span> → {[...a.selected, ...(a.custom ? [a.custom] : [])].join('; ')}
          </li>
        ))}
    </ul>
  )
}

// ---------------------------------------------------------------- AI questions

type Draft = { selected: string[]; out: Outgoing }

/** "Ho capito così" + method proposal + question cards, each with chips, text, 🎙 and 📎. */
function QuestionsCard({ m, active, actions }: { m: ChatMessage; active: boolean; actions: ChatActions }) {
  const p = m.payload as unknown as AiQuestions
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(p.questions.map((q) => [q.id, { selected: [], out: EMPTY_OUTGOING }])),
  )
  const [methods, setMethods] = useState<Record<string, Method | 'conferma'>>(() =>
    Object.fromEntries((p.method_proposal?.sections ?? []).map((s) => [s.name, 'conferma'])),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const general = p.challenges.filter((c) => !c.question_id || !p.questions.some((q) => q.id === c.question_id))

  const setDraft = (id: string, d: Partial<Draft>) => setDrafts((all) => ({ ...all, [id]: { ...all[id], ...d } }))
  const answered = (d: Draft) => d.selected.length > 0 || !isEmpty(d.out)
  const anyAnswer = Object.values(drafts).some(answered) || !!p.method_proposal

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await actions.sendAnswers(
        m,
        p.questions.map((q) => ({ question_id: q.id, question: q.text, selected: drafts[q.id].selected, out: drafts[q.id].out })),
        (p.method_proposal?.sections ?? []).map((s) => {
          const c = methods[s.name]
          return { section: s.name, method: c === 'conferma' ? s.method : c, confirmed: c === 'conferma' }
        }),
      )
    } catch {
      setError('Qualcosa non ha funzionato, riprova.')
      setBusy(false)
    }
  }

  return (
    <AssistantBox>
      <p className="font-semibold">Ho capito così</p>
      <p className="mt-1 whitespace-pre-line">{p.understanding}</p>

      {p.method_proposal && p.method_proposal.sections.length > 0 && (
        <section className="mt-4 rounded-xl bg-gray-50 p-3">
          <h3 className="font-semibold">Come propongo di fare il prezzo</h3>
          <ul className="mt-2 space-y-3">
            {p.method_proposal.sections.map((s) => (
              <li key={s.name}>
                <p>
                  <span className="font-semibold">{s.name}</span> → {METHOD_LABELS[s.method]}
                </p>
                <p className="text-sm text-muted">Perché: {s.why}</p>
                {active && (
                  <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={`Metodo per ${s.name}`}>
                    {(['conferma', 'punto', 'ore_materiali', 'forfait'] as const).map((c) => (
                      <Chip key={c} selected={methods[s.name] === c} onClick={() => setMethods((x) => ({ ...x, [s.name]: c }))}>
                        {c === 'conferma' ? 'Conferma' : METHOD_LABELS[c]}
                      </Chip>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {general.map((c) => (
        <Challenge key={c.text} text={c.text} />
      ))}

      <ol className="mt-4 space-y-4">
        {p.questions.map((q, i) => {
          const d = drafts[q.id]
          return (
            <li key={q.id} className="rounded-xl border border-line p-3">
              <p className="font-semibold">
                {i + 1}. {q.text}
              </p>
              {p.challenges
                .filter((c) => c.question_id === q.id)
                .map((c) => (
                  <Challenge key={c.text} text={c.text} />
                ))}
              {active ? (
                <>
                  {q.multi && <p className="text-sm text-muted">Puoi sceglierne più di una.</p>}
                  <div className="mt-2 flex flex-wrap gap-2" role={q.multi ? 'group' : 'radiogroup'} aria-label={q.text}>
                    {q.options
                      .filter((o) => !/^\s*altro\b|scrivo io/i.test(o))
                      .map((o) => (
                        <Chip
                          key={o}
                          selected={d.selected.includes(o)}
                          onClick={() => {
                            const has = d.selected.includes(o)
                            setDraft(q.id, {
                              selected: q.multi ? (has ? d.selected.filter((x) => x !== o) : [...d.selected, o]) : has ? [] : [o],
                            })
                          }}
                        >
                          {o}
                        </Chip>
                      ))}
                  </div>
                  <textarea
                    rows={2}
                    value={d.out.text}
                    onChange={(e) => setDraft(q.id, { out: { ...d.out, text: e.target.value } })}
                    placeholder="Altro o dettagli: scrivi qui"
                    aria-label={`${q.text}: altro o dettagli`}
                    className={`${inputClass} mt-3 h-auto min-h-12 py-3`}
                  />
                  <div className="mt-2">
                    <AttachBar value={d.out} onChange={(out) => setDraft(q.id, { out })} onError={setError} label={q.text} disabled={busy} />
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted">{q.options.filter((o) => !/^\s*altro\b|scrivo io/i.test(o)).join(' · ')}</p>
              )}
            </li>
          )
        })}
      </ol>

      {active && (
        <>
          {error && (
            <p className="mt-3 text-red-700" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={busy || !anyAnswer}
            onClick={() => void submit()}
            className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-lg font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {busy && <Loader2 className="size-5 animate-spin" aria-hidden />}
            Invia risposte
          </button>
          <p className="mt-2 text-center text-sm text-muted">Puoi lasciare vuote le domande a cui non sai rispondere.</p>
        </>
      )}
    </AssistantBox>
  )
}

function Challenge({ text }: { text: string }) {
  return (
    <p className="mt-2 flex items-start gap-2 rounded-lg border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
      {text}
    </p>
  )
}

// ---------------------------------------------------------------- proposal

function ProposalCard({ m, active, currentTotal, actions }: { m: ChatMessage; active: boolean; currentTotal: number | null; actions: ChatActions }) {
  const p = m.payload as unknown as ProposalPayload
  const [busy, setBusy] = useState<'apply' | 'cancel' | null>(null)
  const icon = { aggiungo: Plus, tolgo: Minus, cambio: Pencil }
  const open = active && !p.status

  async function act(kind: 'apply' | 'cancel') {
    setBusy(kind)
    try {
      await (kind === 'apply' ? actions.applyProposal(m) : actions.cancelProposal(m))
    } finally {
      setBusy(null)
    }
  }

  return (
    <AssistantBox>
      <p className="font-semibold">Ecco cosa cambierei</p>
      {p.note && <p className="mt-1 whitespace-pre-line">{p.note}</p>}
      <ul className="mt-3 divide-y divide-line border-y border-line">
        {p.changes.map((c, i) => {
          const Icon = icon[c.action]
          return (
            <li key={i} className="flex items-start gap-2 py-2">
              <Icon className="mt-0.5 size-4 shrink-0 text-accent" aria-label={c.action} />
              <span className="flex-1">
                <span className="font-medium capitalize">{c.action}</span> {c.description}
              </span>
              {c.effect_eur != null && (
                <span className="text-sm whitespace-nowrap tabular-nums">
                  {c.effect_eur > 0 ? '+' : ''}
                  {formatEur(c.effect_eur)}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {p.total_effect_eur != null && currentTotal != null && (
        <p className="mt-2 text-sm">
          Nuovo totale indicativo (IVA esclusa): <span className="font-semibold">{formatEur(currentTotal + p.total_effect_eur)}</span>
          <span className="text-muted"> · il totale esatto lo calcolo quando applichi</span>
        </p>
      )}
      {p.status === 'applied' && (
        <p className="mt-2 flex items-center gap-1 text-sm font-semibold text-green-700">
          <Check className="size-4" aria-hidden /> Applicata
        </p>
      )}
      {p.status === 'cancelled' && <p className="mt-2 text-sm text-muted">Annullata</p>}
      {open && (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void act('apply')}
            className="flex h-12 items-center justify-center gap-2 rounded-lg bg-accent font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {busy === 'apply' && <Loader2 className="size-4 animate-spin" aria-hidden />} Applica
          </button>
          <button type="button" onClick={actions.modifyProposal} className="h-12 rounded-lg border border-line font-semibold">
            Modifica
          </button>
          <button type="button" disabled={!!busy} onClick={() => void act('cancel')} className="h-12 rounded-lg font-semibold text-muted">
            Annulla
          </button>
        </div>
      )}
    </AssistantBox>
  )
}
