import { Check } from 'lucide-react'
import type { ReactNode } from 'react'

type Props = {
  selected: boolean
  multi?: boolean
  recommended?: boolean
  onClick: () => void
  children: ReactNode
}

/** Big tappable option row (≥ 56px) used by every onboarding question. */
export function OptionButton({ selected, multi, recommended, onClick, children }: Props) {
  return (
    <button
      type="button"
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={selected}
      onClick={onClick}
      className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-base transition-colors ${
        selected ? 'border-accent bg-accent/5' : 'border-line bg-white hover:border-gray-300'
      }`}
    >
      <span
        aria-hidden
        className={`flex size-6 shrink-0 items-center justify-center border-2 ${multi ? 'rounded-md' : 'rounded-full'} ${
          selected ? 'border-accent bg-accent text-white' : 'border-gray-300'
        }`}
      >
        {selected && <Check className="size-4" strokeWidth={3} />}
      </span>
      <span className="flex-1 font-medium">{children}</span>
      {recommended && (
        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-muted">Consigliato</span>
      )}
    </button>
  )
}

/** Small pill option (used inside rows, e.g. discounts per brand). */
export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`h-12 min-w-16 rounded-lg border px-3 font-medium ${
        selected ? 'border-accent bg-accent text-white' : 'border-line bg-white text-ink hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  )
}

export const inputClass =
  'h-12 w-full rounded-lg border border-line bg-white px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'
