import { FileText, Plus } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'

export function HomePage() {
  const { session } = useAuth()
  const email = session?.user.email

  return (
    <div>
      <h1 className="text-2xl font-semibold md:text-3xl">Ciao!</h1>
      {email && <p className="mt-1 text-muted">{email}</p>}

      {/* Not wired up yet: quote creation comes in a later task. */}
      <button
        type="button"
        className="mt-6 flex h-16 w-full items-center justify-center gap-2 rounded-xl bg-accent text-lg font-semibold text-white hover:bg-accent-hover md:w-auto md:px-8"
      >
        <Plus className="size-6" aria-hidden />
        Nuovo preventivo
      </button>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">I tuoi preventivi</h2>
        <div className="mt-4 flex flex-col items-center rounded-xl border border-dashed border-line px-6 py-12 text-center">
          <FileText className="size-10 text-muted" aria-hidden />
          <p className="mt-3 font-medium">Nessun preventivo ancora</p>
          <p className="mt-1 text-muted">Tocca “Nuovo preventivo” per iniziare.</p>
        </div>
      </section>
    </div>
  )
}
