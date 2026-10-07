import { formatEur } from '../../../supabase/functions/_shared/format.ts'
import type { VatRate } from '../../types/db'

/** "Senza IVA" first: quotes start without IVA and the electrician adds it if needed. */
export const VAT_OPTIONS: VatRate[] = [0, 10, 22, 4]

export const vatLabel = (v: VatRate) => (v === 0 ? 'Senza IVA' : `${v}%`)

/** Line under a total: "IVA esclusa" or "IVA 10% inclusa · imponibile 1.234,00 €". */
export const vatNote = (v: VatRate, imponibile: number) => (v === 0 ? 'IVA esclusa' : `IVA ${v}% inclusa · imponibile ${formatEur(imponibile)}`)

export function VatPicker({ value, onChange }: { value: VatRate; onChange: (v: VatRate) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="IVA">
      <span className="mr-1 text-sm text-muted">IVA:</span>
      {VAT_OPTIONS.map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`h-12 min-w-16 rounded-lg border px-3 font-semibold ${value === v ? 'border-accent bg-accent text-white' : 'border-line'}`}
        >
          {vatLabel(v)}
        </button>
      ))}
    </div>
  )
}
