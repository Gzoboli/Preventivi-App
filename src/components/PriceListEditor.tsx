import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ensurePriceItems } from '../lib/onboarding/persist'
import { applyPercent, parseItalianNumber } from '../lib/onboarding/answers'
import type { PriceItem } from '../types/db'
import { inputClass } from './onboarding/OptionButton'

const PERCENT_CHIPS = [-5, 5, 10]
const OTHER_CATEGORY = 'Altre voci'

const priceText = (n: number | null) =>
  n == null ? '' : n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Status = 'loading' | 'ready' | 'error'

/** Editable table of the user's price_items (onboarding q5 and "Il mio metodo"). */
export function PriceListEditor() {
  const [items, setItems] = useState<PriceItem[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      await ensurePriceItems()
      const { data, error } = await supabase
        .from('price_items')
        .select('*')
        .order('sort_order')
        .order('created_at')
      if (error) throw error
      setItems(data)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function saveRow(id: string, patch: Partial<Pick<PriceItem, 'name' | 'unit' | 'price_eur'>>) {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)))
    const { error } = await supabase.from('price_items').update(patch).eq('id', id)
    setSaveError(!!error)
  }

  async function applyToAll(pct: number) {
    setBusy(true)
    const updated = items.map((it) => (it.price_eur == null ? it : { ...it, price_eur: applyPercent(it.price_eur, pct) }))
    setItems(updated)
    const results = await Promise.all(
      updated
        .filter((it) => it.price_eur != null)
        .map((it) => supabase.from('price_items').update({ price_eur: it.price_eur }).eq('id', it.id)),
    )
    setSaveError(results.some((r) => r.error))
    setBusy(false)
  }

  async function removeRow(item: PriceItem) {
    if (!window.confirm(`Eliminare "${item.name}" dal listino?`)) return
    const { error } = await supabase.from('price_items').delete().eq('id', item.id)
    if (error) return setSaveError(true)
    setItems((list) => list.filter((it) => it.id !== item.id))
  }

  async function addRow(row: { name: string; unit: string; price_eur: number }) {
    const sort_order = Math.max(0, ...items.map((i) => i.sort_order)) + 1
    const { data, error } = await supabase
      .from('price_items')
      .insert({ ...row, code: `custom_${Date.now()}`, category: OTHER_CATEGORY, sort_order })
      .select()
      .single()
    if (error) {
      setSaveError(true)
      return false
    }
    setItems((list) => [...list, data])
    return true
  }

  if (status === 'loading') {
    return (
      <div className="flex justify-center py-10" role="status" aria-label="Caricamento listino">
        <Loader2 className="size-7 animate-spin text-accent" />
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="py-6" role="alert">
        <p className="text-red-700">Qualcosa non ha funzionato, riprova.</p>
        <button type="button" onClick={() => void load()} className="mt-2 h-12 font-semibold text-accent">
          Riprova
        </button>
      </div>
    )
  }

  const groups = new Map<string, PriceItem[]>()
  for (const it of items) {
    const key = it.category || OTHER_CATEGORY
    groups.set(key, [...(groups.get(key) ?? []), it])
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-muted">Tutti i prezzi:</span>
        {PERCENT_CHIPS.map((pct) => (
          <button
            key={pct}
            type="button"
            disabled={busy}
            onClick={() => void applyToAll(pct)}
            className="h-12 min-w-16 rounded-lg border border-line px-3 font-semibold hover:border-accent hover:text-accent disabled:opacity-60"
          >
            {pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`}
          </button>
        ))}
        {busy && <Loader2 className="size-5 animate-spin text-accent" aria-label="Salvataggio" />}
      </div>

      {[...groups.entries()].map(([category, rows]) => (
        <section key={category} className="mb-5">
          <h3 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">{category}</h3>
          <div className="hidden grid-cols-[1fr_7.5rem_6rem_3rem] gap-2 px-1 pb-1 text-xs font-medium text-muted sm:grid">
            <span>Voce</span>
            <span>Prezzo €</span>
            <span>Unità</span>
          </div>
          <ul className="divide-y divide-line border-y border-line">
            {rows.map((it) => (
              <PriceRow key={it.id} item={it} onSave={saveRow} onRemove={removeRow} />
            ))}
          </ul>
        </section>
      ))}

      {saveError && (
        <p className="mb-3 text-red-700" role="alert">
          Qualcosa non ha funzionato, riprova.
        </p>
      )}

      {adding ? (
        <AddRowForm
          onCancel={() => setAdding(false)}
          onAdd={async (row) => {
            if (await addRow(row)) setAdding(false)
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex h-12 items-center gap-2 rounded-lg px-1 font-semibold text-accent"
        >
          <Plus className="size-5" aria-hidden />
          Aggiungi voce
        </button>
      )}

      <p className="mt-3 text-sm text-muted">
        Prezzi IVA esclusa. Materiale e manodopera inclusi, se non indicato diversamente.
      </p>
    </div>
  )
}

function PriceRow({
  item,
  onSave,
  onRemove,
}: {
  item: PriceItem
  onSave: (id: string, patch: Partial<Pick<PriceItem, 'name' | 'unit' | 'price_eur'>>) => void
  onRemove: (item: PriceItem) => void
}) {
  const [name, setName] = useState(item.name)
  const [price, setPrice] = useState(priceText(item.price_eur))
  const [unit, setUnit] = useState(item.unit)
  const [priceInvalid, setPriceInvalid] = useState(false)

  // Keep in sync when prices change from outside (±% chips).
  useEffect(() => setPrice(priceText(item.price_eur)), [item.price_eur])

  function commitPrice() {
    const n = parseItalianNumber(price)
    if (n == null) {
      setPriceInvalid(true)
      return
    }
    setPriceInvalid(false)
    const rounded = Math.round(n * 100) / 100
    setPrice(priceText(rounded))
    if (rounded !== item.price_eur) onSave(item.id, { price_eur: rounded })
  }

  const cell = 'h-12 rounded-lg border border-transparent bg-transparent px-2 text-base outline-none hover:border-line focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/20'

  return (
    <li className="grid grid-cols-[1fr_7.5rem_3rem] gap-x-2 py-1 sm:grid-cols-[1fr_7.5rem_6rem_3rem]">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== item.name && onSave(item.id, { name: name.trim() })}
        aria-label="Voce"
        className={`${cell} col-span-3 font-medium sm:col-span-1`}
      />
      <div className="flex items-center">
        <input
          value={price}
          inputMode="decimal"
          onChange={(e) => setPrice(e.target.value)}
          onBlur={commitPrice}
          aria-label={`Prezzo ${item.name}`}
          aria-invalid={priceInvalid}
          className={`${cell} w-full text-right tabular-nums ${priceInvalid ? 'border-red-500' : ''}`}
        />
        <span className="pl-1 text-muted">€</span>
      </div>
      <input
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        onBlur={() => unit.trim() && unit !== item.unit && onSave(item.id, { unit: unit.trim() })}
        aria-label={`Unità ${item.name}`}
        className={`${cell} text-muted`}
      />
      <button
        type="button"
        onClick={() => onRemove(item)}
        aria-label={`Elimina ${item.name}`}
        className="flex size-12 items-center justify-center rounded-lg text-muted hover:bg-gray-100 hover:text-red-700"
      >
        <Trash2 className="size-5" aria-hidden />
      </button>
    </li>
  )
}

function AddRowForm({
  onAdd,
  onCancel,
}: {
  onAdd: (row: { name: string; unit: string; price_eur: number }) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('punto')
  const [price, setPrice] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const n = parseItalianNumber(price)
    if (!name.trim()) return setError('Scrivi il nome della voce.')
    if (n == null) return setError('Scrivi un prezzo valido, es. 32,50.')
    setError(null)
    setSaving(true)
    await onAdd({ name: name.trim(), unit: unit.trim() || 'punto', price_eur: n })
    setSaving(false)
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-line p-4">
      <p className="font-semibold">Nuova voce</p>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Punto presa USB" aria-label="Nome voce" className={inputClass} autoFocus />
      <div className="grid grid-cols-2 gap-3">
        <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="Prezzo €" aria-label="Prezzo" className={inputClass} />
        <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unità" aria-label="Unità" className={inputClass} />
      </div>
      {error && <p className="text-red-700" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="flex h-12 items-center gap-2 rounded-lg bg-accent px-5 font-semibold text-white hover:bg-accent-hover disabled:opacity-70">
          {saving && <Loader2 className="size-5 animate-spin" aria-hidden />}
          Aggiungi
        </button>
        <button type="button" onClick={onCancel} className="h-12 rounded-lg px-4 font-semibold text-muted hover:bg-gray-100">
          Annulla
        </button>
      </div>
    </form>
  )
}
