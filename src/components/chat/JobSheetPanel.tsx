import { useState } from 'react'
import { Check, ChevronDown, ClipboardList } from 'lucide-react'
import { METHOD_LABELS } from '../../../supabase/functions/_shared/chat.ts'
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

/**
 * "Cosa ho capito finora": the facts collected so far (quotes.job_sheet), read-only and collapsed.
 * Only the known facts are listed; the missing ones are asked by the AI one at a time in the chat,
 * and anything wrong is corrected by writing or speaking in the chat.
 */
export function JobSheetPanel({ sheet }: { sheet: JobSheet }) {
  const [open, setOpen] = useState(false)
  const known = FIELDS.filter((f) => done(sheet, f))
  if (!known.length) return null

  return (
    <section className="rounded-xl border border-line bg-white" aria-label="Cosa ho capito finora">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-14 w-full items-center justify-between gap-2 px-4 text-left">
        <span className="flex items-center gap-2">
          <ClipboardList className="size-5 text-accent" aria-hidden />
          <span className="font-semibold">Cosa ho capito finora</span>
          <span className="text-muted">
            · {known.length} di {FIELDS.length}
          </span>
        </span>
        <ChevronDown className={`size-5 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div className="border-t border-line px-4 pb-4">
          <ul className="divide-y divide-line">
            {known.map((f) => (
              <li key={f} className="flex items-start gap-3 py-2">
                <Check className="mt-0.5 size-5 shrink-0 text-green-700" aria-hidden />
                <span>
                  <span className="block text-sm text-muted">{LABELS[f]}</span>
                  {display(sheet, f)}
                </span>
              </li>
            ))}
          </ul>
          {sheet.altro.length > 0 && (
            <div className="mt-2">
              <p className="text-sm text-muted">Altro</p>
              <ul className="list-disc pl-5">{sheet.altro.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          )}
          <p className="mt-3 text-sm text-muted">Se qualcosa non è giusto, scrivilo o dillo a voce nella chat.</p>
        </div>
      )}
    </section>
  )
}
