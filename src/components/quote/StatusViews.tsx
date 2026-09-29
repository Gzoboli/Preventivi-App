import { useState } from 'react'
import { AlertTriangle, Check, Loader2, RotateCcw } from 'lucide-react'
import { answerClarify, retryGeneration, type AiClarify, type ClarifyAnswer } from '../../lib/quotes'
import type { QuoteFile, QuoteVersion } from '../../types/db'
import { Chip, inputClass } from '../onboarding/OptionButton'

/** A processing run that hasn't moved for this long is considered stuck (the function's limit is 150 s per step). */
const STUCK_AFTER_MS = 6 * 60 * 1000

// ---------------------------------------------------------------- processing

export function GeneratingView({ version, files, onChanged }: { version: QuoteVersion; files: QuoteFile[]; onChanged: () => void }) {
  const audio = files.filter((f) => f.kind === 'audio').length
  const docs = files.length - audio
  const transcribed = Array.isArray(version.transcripts) ? version.transcripts.length : 0
  const transcriptionDone = transcribed >= audio
  const stuck = Date.now() - new Date(version.updated_at).getTime() > STUCK_AFTER_MS

  type Step = { label: string; state: 'done' | 'active' | 'todo' }
  const steps: Step[] = []
  if (audio) steps.push({ label: `Trascrivo ${audio} ${audio === 1 ? 'vocale' : 'vocali'}`, state: transcriptionDone ? 'done' : 'active' })
  if (docs) steps.push({ label: 'Leggo i documenti', state: transcriptionDone ? 'active' : 'todo' })
  steps.push({ label: 'Preparo le voci con i tuoi prezzi', state: transcriptionDone ? 'active' : 'todo' })
  steps.push({ label: 'Calcolo le tre opzioni', state: 'todo' })

  if (stuck) return <StuckView version={version} onChanged={onChanged} />

  return (
    <div className="mx-auto max-w-lg py-6" role="status" aria-live="polite">
      <Loader2 className="size-10 animate-spin text-accent" aria-hidden />
      <h1 className="mt-4 text-2xl font-semibold">Sto preparando il preventivo</h1>
      <ol className="mt-6 space-y-3">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-3">
            {s.state === 'done' ? (
              <Check className="size-5 text-green-700" aria-label="fatto" />
            ) : s.state === 'active' ? (
              <Loader2 className="size-5 animate-spin text-accent" aria-label="in corso" />
            ) : (
              <span className="size-5 rounded-full border-2 border-gray-300" aria-hidden />
            )}
            <span className={s.state === 'todo' ? 'text-muted' : 'font-medium'}>{s.label}</span>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-muted">
        Può volerci qualche minuto. Puoi chiudere l'app: la bozza è salvata e il preventivo ti aspetta nella Home.
      </p>
    </div>
  )
}

function StuckView({ version, onChanged }: { version: QuoteVersion; onChanged: () => void }) {
  return (
    <ProblemView
      version={version}
      onChanged={onChanged}
      title="Sembra che si sia bloccato"
      message="La preparazione non va avanti da qualche minuto. Riprova: non perdi nulla di quello che hai scritto."
    />
  )
}

// ---------------------------------------------------------------- error

export function ErrorView({ version, onChanged }: { version: QuoteVersion; onChanged: () => void }) {
  return (
    <ProblemView
      version={version}
      onChanged={onChanged}
      title="Non sono riuscito a preparare il preventivo"
      message={version.error_message || 'Qualcosa non ha funzionato, riprova.'}
    />
  )
}

function ProblemView({ version, title, message, onChanged }: { version: QuoteVersion; title: string; message: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <div className="mx-auto max-w-lg py-6">
      <AlertTriangle className="size-10 text-amber-600" aria-hidden />
      <h1 className="mt-4 text-2xl font-semibold">{title}</h1>
      <p className="mt-2" role="alert">
        {message}
      </p>
      {failed && <p className="mt-2 text-red-700">Qualcosa non ha funzionato, riprova.</p>}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setFailed(false)
          try {
            await retryGeneration(version)
            onChanged()
          } catch {
            setFailed(true)
          } finally {
            setBusy(false)
          }
        }}
        className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-lg font-semibold text-white hover:bg-accent-hover disabled:opacity-70"
      >
        {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <RotateCcw className="size-5" aria-hidden />}
        Riprova
      </button>
    </div>
  )
}

// ---------------------------------------------------------------- questions

type Draft = Record<string, { selected: string[]; custom: string; altro: boolean }>

export function ClarifyView({ version, onCorrect, onChanged }: { version: QuoteVersion; onCorrect: () => void; onChanged: () => void }) {
  const clarify = version.ai_output as unknown as AiClarify
  const [draft, setDraft] = useState<Draft>(() =>
    Object.fromEntries(clarify.questions.map((q) => [q.id, { selected: [], custom: '', altro: false }])),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const answered = (id: string) => draft[id].selected.length > 0 || (draft[id].altro && !!draft[id].custom.trim())
  const complete = clarify.questions.every((q) => answered(q.id))

  function toggle(qid: string, option: string, multi: boolean) {
    setDraft((d) => {
      const cur = d[qid]
      const has = cur.selected.includes(option)
      const selected = multi ? (has ? cur.selected.filter((o) => o !== option) : [...cur.selected, option]) : has ? [] : [option]
      return { ...d, [qid]: { ...cur, selected, altro: multi ? cur.altro : false } }
    })
  }

  function toggleAltro(qid: string, multi: boolean) {
    setDraft((d) => {
      const cur = d[qid]
      return { ...d, [qid]: { ...cur, altro: !cur.altro, selected: multi ? cur.selected : [] } }
    })
  }

  async function submit() {
    if (!complete) return setError('Rispondi a tutte le domande (anche con "Altro…").')
    setBusy(true)
    setError(null)
    const answers: ClarifyAnswer[] = clarify.questions.map((q) => ({
      id: q.id,
      selected: draft[q.id].selected,
      custom: draft[q.id].altro ? draft[q.id].custom.trim() || null : null,
    }))
    try {
      await answerClarify(version, clarify, answers)
      onChanged()
    } catch {
      setError('Qualcosa non ha funzionato, riprova.')
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Prima di preparare il preventivo</h1>
      <section className="mt-4 rounded-xl bg-gray-100 p-4">
        <h2 className="font-semibold">Ho capito così</h2>
        <p className="mt-1 whitespace-pre-line">{clarify.understanding}</p>
      </section>

      <div className="mt-6 space-y-4">
        {clarify.questions.map((q, i) => (
          <fieldset key={q.id} className="rounded-xl border border-line p-4">
            <legend className="sr-only">{q.text}</legend>
            <p className="font-semibold">
              {i + 1}. {q.text}
            </p>
            {q.multi && <p className="text-sm text-muted">Puoi sceglierne più di una.</p>}
            <div className="mt-3 flex flex-wrap gap-2" role={q.multi ? 'group' : 'radiogroup'} aria-label={q.text}>
              {q.options.map((o) => (
                <Chip key={o} selected={draft[q.id].selected.includes(o)} onClick={() => toggle(q.id, o, q.multi)}>
                  {o}
                </Chip>
              ))}
              <Chip selected={draft[q.id].altro} onClick={() => toggleAltro(q.id, q.multi)}>
                Altro…
              </Chip>
            </div>
            {draft[q.id].altro && (
              <input
                autoFocus
                value={draft[q.id].custom}
                onChange={(e) => setDraft((d) => ({ ...d, [q.id]: { ...d[q.id], custom: e.target.value } }))}
                placeholder="Scrivi la tua risposta"
                aria-label={`${q.text} — altra risposta`}
                className={`${inputClass} mt-3`}
              />
            )}
          </fieldset>
        ))}
      </div>

      {error && (
        <p className="mt-4 text-red-700" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-lg font-semibold text-white hover:bg-accent-hover disabled:opacity-70"
      >
        {busy && <Loader2 className="size-5 animate-spin" aria-hidden />}
        Continua
      </button>
      <button type="button" onClick={onCorrect} className="mt-2 h-12 w-full font-semibold text-accent">
        Correggi la descrizione
      </button>
    </div>
  )
}
