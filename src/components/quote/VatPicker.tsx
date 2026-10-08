import { useEffect, useState } from 'react'
import { formatEur, formatNumber } from '../../../supabase/functions/_shared/format.ts'
import { parseItalianNumber } from '../../../supabase/functions/_shared/answers.ts'

/** The usual rates; any other one is typed in "Altro". 0 = "Senza IVA". */
export const VAT_OPTIONS = [0, 4, 10, 22]

export const vatLabel = (v: number) => (v === 0 ? 'Senza IVA' : `${formatNumber(v)}%`)

/** Line under a total: "IVA da scegliere", "IVA esclusa" or "IVA 10% inclusa · imponibile 1.234,00 €". */
export const vatNote = (v: number | null, imponibile: number) =>
  v == null ? 'IVA da scegliere' : v === 0 ? 'IVA esclusa' : `IVA ${formatNumber(v)}% inclusa · imponibile ${formatEur(imponibile)}`

/** A typed rate, as a number between 0 and 100 (null if not valid). */
export function parseVat(input: string): number | null {
  const n = parseItalianNumber(input)
  return n != null && n <= 100 ? Math.round(n * 100) / 100 : null
}

/** Senza IVA · 4% · 10% · 22% · Altro (typed). `value` null = not chosen yet. */
export function VatPicker({ value, onChange, label = 'IVA:' }: { value: number | null; onChange: (v: number) => void; label?: string }) {
  const custom = value != null && !VAT_OPTIONS.includes(value)
  const [other, setOther] = useState(custom)
  const [text, setText] = useState(custom ? formatNumber(value) : '')
  const [invalid, setInvalid] = useState(false)
  useEffect(() => {
    if (value != null && !VAT_OPTIONS.includes(value)) {
      setOther(true)
      setText(formatNumber(value))
    }
  }, [value])

  const chip = (selected: boolean) =>
    `h-12 min-w-16 rounded-lg border px-3 font-semibold ${selected ? 'border-accent bg-accent text-white' : 'border-line'}`
  const commit = () => {
    const v = parseVat(text)
    setInvalid(v == null)
    if (v != null) onChange(v)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="IVA">
        {label && <span className="mr-1 text-sm text-muted">{label}</span>}
        {VAT_OPTIONS.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={!other && value === v}
            onClick={() => {
              setOther(false)
              setInvalid(false)
              onChange(v)
            }}
            className={chip(!other && value === v)}
          >
            {vatLabel(v)}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={other} onClick={() => setOther(true)} className={chip(other)}>
          Altro
        </button>
      </div>
      {other && (
        <div className="mt-2 flex items-center gap-2">
          <label htmlFor="vat-other" className="text-sm text-muted">
            IVA
          </label>
          <input
            id="vat-other"
            inputMode="decimal"
            value={text}
            autoFocus={!custom}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            placeholder="es. 5"
            aria-invalid={invalid}
            className="h-12 w-24 rounded-lg border border-line px-3 text-right text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <span>%</span>
        </div>
      )}
      {invalid && <p className="mt-1 text-sm text-red-700">Scrivi una percentuale tra 0 e 100.</p>}
    </div>
  )
}
