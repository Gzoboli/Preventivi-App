import { Loader2 } from 'lucide-react'

export function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Caricamento">
      <Loader2 className="size-8 animate-spin text-accent" />
    </div>
  )
}
