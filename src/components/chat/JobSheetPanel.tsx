import { useState } from 'react'
import { Check, ChevronDown, ClipboardList, Loader2, Minus, Pencil } from 'lucide-react'
import { Chip, inputClass } from '../onboarding/OptionButton'
import { updateJobSheet } from '../../lib/conversation'
import { METHOD_LABELS } from '../../../supabase/functions/_shared/chat.ts'
import { parseItalianNumber } from '../../../supabase/functions/_shared/answers.ts'
import type { JobSheet } from '../../../supabase/functions/_shared/pricing.ts'

type FieldId = 'tipo_lavoro' | 'metodo' | 'squadra' | 'ambienti' | 'punti' | 'frutti' | 'quadro' | 'dico'

const LABELS: Record<FieldId, string> = {
  tipo_lavoro: 'Tipo di lavoro',
  metodo: 'Metodo di prezzo',
  squadra: 'Squadra e tempi',
  ambienti: 'Ambienti',
  punti: 'Punti',
  frutti: 'Frutti e placche',
  quadro: 'Quadro',
  dico: 'Dichiarazione di conformità',
}
const FIELDS = Object.keys(LABELS) as FieldId[]
const DICO_LABELS = { inclusa: 'Inclusa (la faccio io)', forfait: 'A forfait (impianto di altri)', 'non richiesta': 'Non richiesta' } as const
const FRUTTI_LABELS = { nuovi: 'Nuovi', esistenti: 'Si tengono quelli esistenti', misto: 'In parte nuovi' } as const

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString('it-IT')} ${n === 1 ? one : many}`
}

function display(sheet: JobSheet, f: FieldId): string | null {
  switch (f) {
    case 'metodo':
      return sheet.metodo.length ? sheet.metodo.map((m) => `${m.sezione}: ${METHOD_LABELS[m.metodo]}`).join(' · ') : null
    case 'squadra': {
      const s = sheet.squadra
      if (!s.persone && !s.giorni) return null
      const parts = [
        s.persone ? plural(s.persone, 'persona', 'persone') : 'persone da definire',
        s.giorni ? plural(s.giorni, 'giorno', 'giorni') : 'giorni da definire',
      ]
      if (s.ore_giorno) parts.push(`giornata di ${s.ore_giorno} ore`)
      return parts.join(' × ')
    }
    case 'ambienti':
      return sheet.ambienti.length ? sheet.ambienti.join(', ') : null
    case 'punti':
      return sheet.punti != null ? String(sheet.punti) : null
    case 'frutti':
      return sheet.frutti ? FRUTTI_LABELS[sheet.frutti] : null
    case 'dico':
      return sheet.dico ? DICO_LABELS[sheet.dico] : null
    default:
      return sheet[f]
  }
}

/** A field counts as done when it has a value (for squadra: people and days). */
function done(sheet: JobSheet, f: FieldId): boolean {
  return f === 'squadra' ? !!(sheet.squadra.persone && sheet.squadra.giorni) : display(sheet, f) != null
}

/** "Scheda lavoro": the facts collected so far. Each field can be corrected by hand (the AI is told). */
export function JobSheetPanel({ quoteId, sheet, collapsible, onChanged }: { quoteId: string; sheet: JobSheet; collapsible: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(!collapsible)
  const [editing, setEditing] = useState<FieldId | null>(null)
  const count = FIELDS.filter((f) => done(sheet, f)).length

  const header = (
    <span className="flex items-center gap-2">
      <ClipboardList className="size-5 text-accent" aria-hidden />
      <span className="font-semibold">Scheda lavoro</span>
      <span className="text-muted">
        · {count} di {FIELDS.length} completati
      </span>
    </span>
  )

  return (
    <section className="rounded-xl border border-line bg-white" aria-label="Scheda lavoro">
      {collapsible ? (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-14 w-full items-center justify-between px-4 text-left">
          {header}
          <ChevronDown className={`size-5 text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      ) : (
        <div className="flex min-h-14 items-center px-4">{header}</div>
      )}
      {open && (
        <div className="border-t border-line px-4 pb-4">
          <ul className="divide-y divide-line">
            {FIELDS.map((f) => (
              <li key={f} className="py-2">
                {editing === f ? (
                  <FieldEditor quoteId={quoteId} sheet={sheet} field={f} onClose={() => setEditing(null)} onSaved={onChanged} />
                ) : (
                  <button
                    type="button"
                    disabled={f === 'metodo'}
                    onClick={() => setEditing(f)}
                    className="flex min-h-12 w-full items-start gap-3 text-left disabled:cursor-default"
                    aria-label={f === 'metodo' ? undefined : `Modifica ${LABELS[f]}`}
                  >
                    {done(sheet, f) ? (
                      <Check className="mt-0.5 size-5 shrink-0 text-green-700" aria-label="confermato" />
                    ) : (
                      <Minus className="mt-0.5 size-5 shrink-0 text-gray-400" aria-label="mancante" />
                    )}
                    <span className="flex-1">
                      <span className="block text-sm text-muted">{LABELS[f]}</span>
                      <span className={display(sheet, f) ? '' : 'text-muted'}>{display(sheet, f) ?? '—'}</span>
                    </span>
                    {f !== 'metodo' && <Pencil className="mt-1 size-4 shrink-0 text-muted" aria-hidden />}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {sheet.altro.length > 0 && (
            <div className="mt-2">
              <p className="text-sm text-muted">Altro</p>
              <ul className="list-disc pl-5">{sheet.altro.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          )}
          {sheet.mancanti.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-800">Mancano ancora</p>
              <ul className="list-disc pl-5 text-sm">{sheet.mancanti.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function FieldEditor({ quoteId, sheet, field, onClose, onSaved }: { quoteId: string; sheet: JobSheet; field: FieldId; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(() =>
    field === 'ambienti' ? sheet.ambienti.join(', ') : field === 'punti' ? (sheet.punti?.toString() ?? '') : field === 'tipo_lavoro' || field === 'quadro' ? (sheet[field] ?? '') : '',
  )
  const [squadra, setSquadra] = useState({
    persone: sheet.squadra.persone?.toString() ?? '',
    giorni: sheet.squadra.giorni?.toString().replace('.', ',') ?? '',
    ore_giorno: sheet.squadra.ore_giorno?.toString() ?? '',
  })
  const [choice, setChoice] = useState<string | null>(field === 'frutti' ? sheet.frutti : field === 'dico' ? sheet.dico : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    let next: JobSheet = sheet
    if (field === 'squadra') {
      const num = (s: string) => (s.trim() ? parseItalianNumber(s) : null)
      next = { ...sheet, squadra: { ...sheet.squadra, persone: num(squadra.persone), giorni: num(squadra.giorni), ore_giorno: num(squadra.ore_giorno) } }
      next.squadra.aiutante = (next.squadra.persone ?? 0) > 1 ? true : sheet.squadra.aiutante
    } else if (field === 'ambienti') {
      next = { ...sheet, ambienti: text.split(',').map((s) => s.trim()).filter(Boolean) }
    } else if (field === 'punti') {
      const n = text.trim() ? parseItalianNumber(text) : null
      if (text.trim() && n == null) return setError('Scrivi un numero.')
      next = { ...sheet, punti: n }
    } else if (field === 'frutti' || field === 'dico') {
      next = { ...sheet, [field]: choice } as JobSheet
    } else if (field === 'tipo_lavoro' || field === 'quadro') {
      next = { ...sheet, [field]: text.trim() || null }
    }
    setBusy(true)
    setError(null)
    try {
      await updateJobSheet(quoteId, next, `Ho corretto la scheda lavoro: ${LABELS[field]} → ${display(next, field) ?? 'vuoto'}.`)
      onSaved()
      onClose()
    } catch {
      setError('Qualcosa non ha funzionato, riprova.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 py-1">
      <p className="text-sm font-semibold">{LABELS[field]}</p>
      {field === 'squadra' ? (
        <div className="grid grid-cols-3 gap-2">
          {(['persone', 'giorni', 'ore_giorno'] as const).map((k) => (
            <label key={k} className="text-sm">
              {k === 'ore_giorno' ? 'Ore al giorno' : k === 'persone' ? 'Persone' : 'Giorni'}
              <input inputMode="decimal" value={squadra[k]} onChange={(e) => setSquadra({ ...squadra, [k]: e.target.value })} className={`${inputClass} mt-1`} />
            </label>
          ))}
        </div>
      ) : field === 'frutti' || field === 'dico' ? (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={LABELS[field]}>
          {Object.entries(field === 'frutti' ? FRUTTI_LABELS : DICO_LABELS).map(([k, label]) => (
            <Chip key={k} selected={choice === k} onClick={() => setChoice(k)}>
              {label}
            </Chip>
          ))}
        </div>
      ) : (
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          inputMode={field === 'punti' ? 'numeric' : undefined}
          placeholder={field === 'ambienti' ? 'Cucina, bagno, camera…' : undefined}
          aria-label={LABELS[field]}
          className={inputClass}
        />
      )}
      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => void save()} className="flex h-12 items-center gap-2 rounded-lg bg-accent px-4 font-semibold text-white">
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Salva
        </button>
        <button type="button" onClick={onClose} className="h-12 px-3 font-semibold text-accent">
          Annulla
        </button>
      </div>
    </div>
  )
}
