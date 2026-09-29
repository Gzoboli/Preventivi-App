import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { useProfile } from '../profile/ProfileProvider'
import { MAIN_ROWS, MethodSummary, OTHER_ROWS } from '../components/MethodSummary'
import { PriceListEditor } from '../components/PriceListEditor'
import { CompanyForm } from '../components/CompanyForm'
import { OnboardingBanner } from '../components/OnboardingBanner'
import { MethodDocuments } from '../components/MethodDocuments'
import { QuestionBody, validateDraft } from '../components/onboarding/QuestionBody'
import { useOnboardingActions } from '../lib/onboarding/useOnboardingActions'
import { cleanAnswer, effectiveAnswer, type Answer } from '../lib/onboarding/answers'
import { getQuestion, type QuestionId } from '../lib/onboarding/questions'

export function MetodoPage() {
  const { answers } = useProfile()
  const [editing, setEditing] = useState<QuestionId[] | null>(null)
  // Bumped after an edit that may change the price list (q5), to reload the table.
  const [listVersion, setListVersion] = useState(0)

  return (
    <div>
      <h1 className="text-2xl font-semibold md:text-3xl">Il mio metodo</h1>
      <p className="mt-1 text-muted">Tocca una riga per cambiarla. Le modifiche valgono per i prossimi preventivi.</p>
      <div className="mt-4">
        <OnboardingBanner />
      </div>

      <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:gap-12">
        <div className="space-y-10">
          <section>
            <h2 className="mb-3 text-lg font-semibold">Come lavori</h2>
            <MethodSummary answers={answers} rows={MAIN_ROWS} onEdit={setEditing} />
          </section>
          <section>
            <h2 className="text-lg font-semibold">Altre impostazioni</h2>
            <p className="mt-1 mb-3 text-muted">Già impostate con i valori più comuni. Cambiale se lavori diversamente.</p>
            <MethodSummary answers={answers} rows={OTHER_ROWS} onEdit={setEditing} />
          </section>
          <NotesSection />
          <MethodDocuments />
        </div>
        <div className="space-y-10">
          <section>
            <h2 className="mb-3 text-lg font-semibold">Il mio listino</h2>
            <PriceListEditor key={listVersion} />
          </section>
          <section>
            <h2 className="text-lg font-semibold">Dati per il preventivo</h2>
            <p className="mt-1 mb-4 text-muted">Servono solo per il PDF.</p>
            <CompanyForm />
          </section>
        </div>
      </div>

      {editing && (
        <EditDialog
          ids={editing}
          onClose={() => setEditing(null)}
          onSaved={(ids) => ids.includes('q5') && setListVersion((v) => v + 1)}
        />
      )}
    </div>
  )
}

function NotesSection() {
  const { profile, updateProfile } = useProfile()
  const [text, setText] = useState(profile?.method_notes ?? '')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const timer = useRef<number | undefined>(undefined)
  const lastSaved = useRef(profile?.method_notes ?? '')

  function onChange(v: string) {
    setText(v)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void save(v), 800)
  }

  async function save(v: string) {
    if (v === lastSaved.current) return
    setStatus('saving')
    try {
      await updateProfile({ method_notes: v.trim() ? v : null })
      lastSaved.current = v
      setStatus('saved')
    } catch {
      setStatus('error')
    }
  }

  // Flush pending text when leaving the page.
  const saveRef = useRef(save)
  saveRef.current = save
  const textRef = useRef(text)
  textRef.current = text
  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      void saveRef.current(textRef.current)
    },
    [],
  )

  return (
    <section>
      <label htmlFor="method_notes" className="mb-3 block text-lg font-semibold">
        Altro che dovremmo sapere su come lavori
      </label>
      <textarea
        id="method_notes"
        rows={5}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          window.clearTimeout(timer.current)
          void save(text)
        }}
        placeholder="Es. uso sempre tubo corrugato da 25, nei bagni metto almeno due prese…"
        className="w-full rounded-lg border border-line px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <p className="mt-1 h-5 text-sm text-muted" role="status">
        {status === 'saving' && 'Salvataggio…'}
        {status === 'saved' && (
          <span className="inline-flex items-center gap-1 text-green-700">
            <Check className="size-4" aria-hidden /> Salvato
          </span>
        )}
        {status === 'error' && <span className="text-red-700">Qualcosa non ha funzionato, riprova.</span>}
      </p>
    </section>
  )
}

/** Edits one or more questions (e.g. "Tariffa" = q3 + q4) with the same components as the onboarding. */
function EditDialog({
  ids,
  onClose,
  onSaved,
}: {
  ids: QuestionId[]
  onClose: () => void
  onSaved: (ids: QuestionId[]) => void
}) {
  const { answers } = useProfile()
  const { commit } = useOnboardingActions()
  const [drafts, setDrafts] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(ids.map((id) => [id, effectiveAnswer(answers, id)])),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  async function save() {
    for (const id of ids) {
      const invalid = validateDraft(getQuestion(id), drafts[id])
      if (invalid) return setError(invalid)
    }
    setSaving(true)
    setError(null)
    try {
      await commit(ids.map((id) => [id, cleanAnswer({ ...drafts[id], source: 'user' })]))
      onSaved(ids)
      onClose()
    } catch {
      setError('Qualcosa non ha funzionato, riprova.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 md:items-center md:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-dvh w-full max-w-[560px] flex-col bg-white md:max-h-[90vh] md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end px-2 pt-2">
          <button type="button" onClick={onClose} aria-label="Chiudi" className="flex size-12 items-center justify-center rounded-lg text-muted hover:bg-gray-100">
            <X className="size-6" />
          </button>
        </div>
        <div className="flex-1 space-y-10 overflow-y-auto px-4 pb-6 md:px-6">
          {ids.map((id) => (
            <QuestionBody
              key={id}
              compact={ids.length > 1}
              question={getQuestion(id)}
              draft={drafts[id]}
              onChange={(a) => setDrafts((d) => ({ ...d, [id]: a }))}
            />
          ))}
        </div>
        {error && (
          <p className="border-t border-line px-4 pt-3 text-red-700 md:px-6" role="alert">
            {error}
          </p>
        )}
        <div className="flex gap-3 border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6">
          <button type="button" onClick={onClose} className="h-14 rounded-xl border border-line px-5 font-semibold">
            Annulla
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-lg font-semibold text-white hover:bg-accent-hover disabled:opacity-70"
          >
            {saving && <Loader2 className="size-5 animate-spin" aria-hidden />}
            Salva
          </button>
        </div>
      </div>
    </div>
  )
}
