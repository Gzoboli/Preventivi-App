import { useEffect, useState } from 'react'
import { Loader2, Trash2, X } from 'lucide-react'
import { deleteLines, editLine } from '../../lib/conversation'
import { sourceTag } from './QuoteResult'
import { inputClass } from '../onboarding/OptionButton'
import { parseItalianNumber } from '../../../supabase/functions/_shared/answers.ts'
import { formatAmount, formatEur, formatQty } from '../../../supabase/functions/_shared/format.ts'
import type { AiLine, LineKind, PricedLine } from '../../../supabase/functions/_shared/pricing.ts'
import type { QuoteVersion } from '../../types/db'

const KINDS: { id: LineKind; label: string }[] = [
  { id: 'punto', label: 'A punto' },
  { id: 'ore', label: 'Ore' },
  { id: 'materiale', label: 'Materiale' },
  { id: 'forfait', label: 'Forfait' },
]

/** Bottom sheet (phone) / dialog (desktop): why this line, the numbers behind the price, edit or delete. */
export function LineSheet({ version, line, priced, onClose, onSaved }: { version: QuoteVersion; line: AiLine; priced: PricedLine | undefined; onClose: () => void; onSaved: () => void }) {
  const [description, setDescription] = useState(line.description)
  const [qty, setQty] = useState(formatAmount(line.qty).replace(/,00$/, ''))
  const [price, setPrice] = useState(priced && !priced.price_missing ? formatAmount(priced.unit_price) : '')
  const [kind, setKind] = useState<LineKind>(line.kind)
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const tag = sourceTag(line, priced)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save() {
    const q = parseItalianNumber(qty)
    const p = price.trim() ? parseItalianNumber(price) : null
    if (q == null) return setError('Scrivi una quantità valida.')
    if (price.trim() && p == null) return setError('Scrivi un prezzo valido.')
    setBusy('save')
    setError(null)
    try {
      const samePrice = p != null && priced && p === priced.unit_price
      await editLine(version, line, { description: description.trim() || line.description, qty: q, unit_price: samePrice ? null : p, kind })
      onSaved()
      onClose()
    } catch {
      setError('Qualcosa non ha funzionato, riprova.')
      setBusy(null)
    }
  }

  async function remove() {
    setBusy('delete')
    setError(null)
    try {
      await deleteLines(version, [line.line_id], 'Ho eliminato a mano')
      onSaved()
      onClose()
    } catch {
      setError('Qualcosa non ha funzionato, riprova.')
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" role="dialog" aria-modal="true" aria-label={line.description} onClick={onClose}>
      <div
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <h2 className="flex-1 text-lg font-semibold">{line.description}</h2>
          <button type="button" onClick={onClose} aria-label="Chiudi" className="-mt-2 -mr-2 flex size-12 items-center justify-center rounded-lg hover:bg-gray-100">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <dl className="mt-3 space-y-3 rounded-xl bg-gray-50 p-3">
          <div>
            <dt className="text-sm text-muted">Da dove viene il prezzo</dt>
            <dd>
              {tag.icon} {tag.label}
            </dd>
          </div>
          {priced && (
            <div>
              <dt className="text-sm text-muted">I numeri</dt>
              <dd>
                {priced.breakdown}
                <span className="block font-semibold">
                  {formatQty(line.qty, line.unit)} × {formatEur(priced.unit_price)} = {formatEur(priced.total)}
                </span>
              </dd>
            </div>
          )}
          {line.why && (
            <div>
              <dt className="text-sm text-muted">Perché</dt>
              <dd>{line.why}</dd>
            </div>
          )}
          {line.quantity_estimated && <p className="text-sm text-muted">La quantità è una mia stima: controllala.</p>}
        </dl>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-sm font-semibold">Descrizione</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-semibold">Quantità ({line.unit})</span>
              <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" className={`${inputClass} mt-1`} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Prezzo unitario €</span>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                placeholder={priced?.price_missing ? 'Da inserire' : undefined}
                className={`${inputClass} mt-1`}
              />
            </label>
          </div>
          <fieldset>
            <legend className="text-sm font-semibold">Tipo</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  role="radio"
                  aria-checked={kind === k.id}
                  onClick={() => setKind(k.id)}
                  className={`h-12 rounded-lg border px-3 font-medium ${kind === k.id ? 'border-accent bg-accent text-white' : 'border-line'}`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        {error && (
          <p className="mt-3 text-red-700" role="alert">
            {error}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void save()}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-lg font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {busy === 'save' && <Loader2 className="size-5 animate-spin" aria-hidden />} Salva
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void remove()}
            className="flex h-14 items-center gap-2 rounded-xl border border-line px-4 font-semibold text-red-700 disabled:opacity-60"
          >
            {busy === 'delete' ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Trash2 className="size-5" aria-hidden />}
            Elimina
          </button>
        </div>
      </div>
    </div>
  )
}
