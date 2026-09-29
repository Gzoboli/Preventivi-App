import { ChevronRight } from 'lucide-react'
import { effectiveAnswer, formatAnswer, type Answers } from '../lib/onboarding/answers'
import type { QuestionId } from '../lib/onboarding/questions'

type Row = { label: string; hint?: string; ids: (a: Answers) => QuestionId[]; format?: (a: Answers) => string }

const one = (id: QuestionId) => () => [id]

/** The 4 onboarding topics. */
export const MAIN_ROWS: Row[] = [
  { label: 'Prezzo', ids: one('q2') },
  {
    label: 'Tariffa',
    ids: () => ['q3', 'q4'],
    format: (a) => {
      const rate = formatAnswer('q3', effectiveAnswer(a, 'q3'))
      const helper = effectiveAnswer(a, 'q4')
      return helper.value === 'nessuno' ? `${rate} (senza aiutante)` : `${rate} (+ aiutante ${formatAnswer('q4', helper)})`
    },
  },
  {
    label: 'I tuoi prezzi',
    ids: (a) => [effectiveAnswer(a, 'q2').value === 'a_ore' ? 'q5m' : 'q5'],
    format: (a) =>
      effectiveAnswer(a, 'q2').value === 'a_ore'
        ? `Ricarico sul materiale: ${formatAnswer('q5m', effectiveAnswer(a, 'q5m'))}`
        : formatAnswer('q5', effectiveAnswer(a, 'q5')),
  },
  { label: 'Sconto', ids: one('q6') },
]

/** Not asked at sign-up: usual values, editable here. */
export const OTHER_ROWS: Row[] = [
  { label: 'IVA', ids: one('q10') },
  { label: 'Validità', ids: one('q11') },
  { label: 'Pagamenti', ids: one('q12') },
  { label: 'Esclusi', ids: one('q13') },
  { label: 'Serie', hint: 'Base / Consigliata / Top', ids: one('q7') },
  { label: 'Linee', ids: one('q8') },
  { label: 'Livello', ids: one('q9') },
  { label: 'Lavori', ids: one('q1') },
]

type Props = { answers: Answers; rows: Row[]; onEdit?: (ids: QuestionId[]) => void }

/** One line per topic; tappable when `onEdit` is given. */
export function MethodSummary({ answers, rows, onEdit }: Props) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {rows.map((row) => {
        const ids = row.ids(answers)
        const text = row.format ? row.format(answers) : formatAnswer(ids[0], effectiveAnswer(answers, ids[0]))
        const content = (
          <>
            <span className="w-24 shrink-0 font-semibold sm:w-28">
              {row.label}
              {row.hint && <span className="block text-xs font-normal text-muted">{row.hint}</span>}
            </span>
            <span className="flex-1">{text}</span>
          </>
        )
        return (
          <li key={row.label}>
            {onEdit ? (
              <button
                type="button"
                onClick={() => onEdit(ids)}
                className="flex min-h-14 w-full items-center gap-3 py-3 text-left hover:bg-gray-50"
                aria-label={`Modifica ${row.label}`}
              >
                {content}
                <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
              </button>
            ) : (
              <div className="flex min-h-12 items-start gap-3 py-3">{content}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
