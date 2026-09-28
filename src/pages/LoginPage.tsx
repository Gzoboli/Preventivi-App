import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Loader2, MailCheck, Zap } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { FullPageSpinner } from '../components/FullPageSpinner'

type Status = 'idle' | 'sending' | 'sent'

export function LoginPage() {
  const { session, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  if (loading) return <FullPageSpinner />
  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setStatus('sending')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
    })
    if (error) {
      setStatus('idle')
      setError(
        error.status === 429
          ? 'Troppi tentativi. Aspetta qualche minuto e riprova.'
          : 'Qualcosa non ha funzionato, riprova.',
      )
      return
    }
    setStatus('sent')
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2 text-2xl font-semibold">
          <Zap className="size-7 text-accent" aria-hidden />
          Preventivi
        </div>

        {status === 'sent' ? (
          <div>
            <MailCheck className="mb-4 size-10 text-accent" aria-hidden />
            <h1 className="text-2xl font-semibold">Controlla la tua email</h1>
            <p className="mt-2 text-muted">
              Ti abbiamo mandato un link di accesso a <strong className="text-ink">{email.trim()}</strong>.
              Aprilo da questo dispositivo per entrare.
            </p>
            <button
              type="button"
              onClick={() => setStatus('idle')}
              className="mt-6 h-12 font-medium text-accent"
            >
              Usa un’altra email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h1 className="text-2xl font-semibold">Accedi</h1>
            <p className="mt-2 text-muted">Ti mandiamo un link via email, niente password.</p>

            <label htmlFor="email" className="mt-6 block font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@esempio.it"
              className="mt-2 h-12 w-full rounded-lg border border-line px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />

            {error && (
              <p role="alert" className="mt-3 text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={status === 'sending'}
              className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-accent text-lg font-semibold text-white hover:bg-accent-hover disabled:opacity-70"
            >
              {status === 'sending' && <Loader2 className="size-5 animate-spin" aria-hidden />}
              Inviami il link di accesso
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
