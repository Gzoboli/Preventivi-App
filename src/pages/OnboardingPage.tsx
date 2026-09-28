import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Loader2, Lock, PartyPopper, Zap } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useProfile } from '../profile/ProfileProvider'
import { BLOCKS, QUESTIONS, TOTAL_QUESTIONS, type Question } from '../lib/onboarding/questions'
import { defaultAnswer, stepAfterBlock, type Answer } from '../lib/onboarding/answers'
import { useOnboardingActions } from '../lib/onboarding/useOnboardingActions'
import { QuestionBody, validateDraft } from '../components/onboarding/QuestionBody'
import { MethodSummary } from '../components/MethodSummary'

const WELCOME = 0
const SUMMARY = TOTAL_QUESTIONS + 1

/** Full-screen onboarding: welcome (step 0), questions (1..14), summary (15). */
export function OnboardingPage() {
  const { profile, answers } = useProfile()
  const [step, setStep] = useState(() => Math.min(answers._meta?.step ?? WELCOME, TOTAL_QUESTIONS))
  // Checked once on entry, so finishing here still shows the summary.
  const [alreadyCompleted] = useState(() => !!profile?.onboarding_completed)

  if (!profile) return null
  if (alreadyCompleted) return <Navigate to="/metodo" replace />

  return (
    <div className="min-h-dvh bg-white">
      {step === WELCOME && <Welcome onStart={() => setStep(1)} />}
      {step >= 1 && step <= TOTAL_QUESTIONS && (
        <QuestionScreen key={step} step={step} question={QUESTIONS[step - 1]} onStep={setStep} />
      )}
      {step === SUMMARY && <Summary />}
    </div>
  )
}

function Welcome({ onStart }: { onStart: () => void }) {
  const { session } = useAuth()
  const { setMeta } = useOnboardingActions()
  const navigate = useNavigate()
  const meta = session?.user.user_metadata as { full_name?: string; name?: string } | undefined
  const name = (meta?.full_name || meta?.name)?.split(' ')[0]

  return (
    <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col px-4 py-8">
      <div className="mb-8 flex items-center gap-2 text-lg font-semibold">
        <Zap className="size-6 text-accent" aria-hidden />
        Preventivi
      </div>
      <h1 className="text-2xl font-semibold md:text-3xl">
        Ciao{name ? `, ${name}` : ''}! Prima di iniziare, 8 minuti per conoscerti.
      </h1>
      <p className="mt-4 text-lg">
        Ogni elettricista lavora a modo suo. Queste domande servono solo a far uscire i preventivi{' '}
        <strong>come li faresti tu</strong>, con i tuoi prezzi e il tuo modo di lavorare.
      </p>

      <div className="mt-6 flex gap-3 rounded-xl bg-green-50 p-4 text-green-900">
        <Lock className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p>
          <strong>Le tue risposte sono tue.</strong> Non le vede nessun altro: né altri elettricisti, né i tuoi
          clienti. Puoi cambiarle quando vuoi da "Il mio metodo".
        </p>
      </div>
      <div className="mt-3 rounded-xl bg-gray-100 p-4">
        <p>
          <strong>Cosa sa già l'app?</strong> Conosce i listini Vimar e BTicino 2026, le regole base di un impianto
          a norma e come si struttura un preventivo per un appartamento. Quello che non sa è{' '}
          <strong>come lavori tu</strong>: per questo ti facciamo qualche domanda.
        </p>
      </div>

      <div className="mt-auto pt-8">
        <button
          type="button"
          onClick={() => {
            void setMeta({ step: 1 })
            onStart()
          }}
          className="flex h-14 w-full items-center justify-center rounded-xl bg-accent text-lg font-semibold text-white hover:bg-accent-hover"
        >
          Iniziamo
        </button>
        <button
          type="button"
          onClick={() => {
            void setMeta({ postponed: true })
            navigate('/')
          }}
          className="mt-2 h-12 w-full font-semibold text-muted"
        >
          Lo faccio dopo
        </button>
      </div>
    </div>
  )
}

function QuestionScreen({ step, question, onStep }: { step: number; question: Question; onStep: (s: number) => void }) {
  const { answers } = useProfile()
  const { commit, skip, setMeta, finish } = useOnboardingActions()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Answer>(() => answers[question.id] ?? defaultAnswer(question))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function goTo(next: number, save: () => Promise<void>) {
    setSaving(true)
    setError(null)
    try {
      await save()
      if (next === SUMMARY) await finish()
      onStep(next)
      window.scrollTo(0, 0)
    } catch {
      setError('Qualcosa non ha funzionato, riprova.')
    } finally {
      setSaving(false)
    }
  }

  function next() {
    const invalid = validateDraft(question, draft)
    if (invalid) return setError(invalid)
    const answer: Answer = { ...draft, source: 'user' }
    // Drop stale "Altro…" text if Altro is no longer selected.
    const v = answer.value
    if (!(Array.isArray(v) ? v.includes('altro') : v === 'altro')) delete answer.custom_text
    void goTo(step + 1, () => commit(question.id, answer, { step: Math.min(step + 1, TOTAL_QUESTIONS) }))
  }

  function skipCurrentBlock() {
    const target = stepAfterBlock(question.id)
    void goTo(target, () => skip(question.id, { step: Math.min(target, TOTAL_QUESTIONS) }))
  }

  async function later() {
    setSaving(true)
    try {
      await setMeta({ postponed: true, step })
    } finally {
      setSaving(false)
      navigate('/')
    }
  }

  const progress = Math.round(((step - 1) / TOTAL_QUESTIONS) * 100)

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-white">
        <div className="mx-auto max-w-[560px] px-4 pt-3 pb-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-accent">
              Blocco {question.block} · {BLOCKS[question.block - 1]}
            </p>
            <button type="button" onClick={() => void later()} className="h-10 px-1 text-sm font-semibold text-muted">
              Finisco dopo
            </button>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <div
              className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100"
              role="progressbar"
              aria-valuenow={step}
              aria-valuemin={1}
              aria-valuemax={TOTAL_QUESTIONS}
              aria-label="Avanzamento"
            >
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="shrink-0 text-sm text-muted tabular-nums">
              {step} di {TOTAL_QUESTIONS}
            </span>
          </div>
          <button
            type="button"
            onClick={skipCurrentBlock}
            disabled={saving}
            className="mt-1 h-9 text-sm font-semibold text-accent disabled:opacity-60"
          >
            Salta blocco
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[560px] flex-1 px-4 pt-6 pb-8">
        <QuestionBody question={question} draft={draft} onChange={setDraft} />
        {error && (
          <p className="mt-4 text-red-700" role="alert">
            {error}
          </p>
        )}
      </main>

      <footer className="sticky bottom-0 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-[560px] gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => onStep(step - 1)}
            disabled={saving}
            className="flex h-14 items-center gap-2 rounded-xl border border-line px-5 font-semibold disabled:opacity-60"
          >
            <ArrowLeft className="size-5" aria-hidden />
            Indietro
          </button>
          <button
            type="button"
            onClick={next}
            disabled={saving}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-lg font-semibold text-white hover:bg-accent-hover disabled:opacity-70"
          >
            {saving && <Loader2 className="size-5 animate-spin" aria-hidden />}
            {question.kind === 'prices' ? 'Va bene così' : 'Avanti'}
            {!saving && question.kind !== 'prices' && <ArrowRight className="size-5" aria-hidden />}
          </button>
        </div>
      </footer>
    </div>
  )
}

function Summary() {
  const { answers } = useProfile()
  const navigate = useNavigate()
  return (
    <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col px-4 py-8">
      <PartyPopper className="size-10 text-accent" aria-hidden />
      <h1 className="mt-3 text-2xl font-semibold md:text-3xl">Fatto! Ecco il tuo metodo.</h1>
      <div className="mt-6">
        <MethodSummary answers={answers} />
      </div>
      <p className="mt-4 text-muted">
        Puoi cambiare tutto da "Il mio metodo". L'app impara anche dalle correzioni che fai nei preventivi.
      </p>
      <div className="mt-auto pt-8">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex h-14 w-full items-center justify-center rounded-xl bg-accent text-lg font-semibold text-white hover:bg-accent-hover"
        >
          Crea il primo preventivo
        </button>
      </div>
    </div>
  )
}
