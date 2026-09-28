import { ChevronRight } from 'lucide-react'
import { effectiveAnswer, formatAnswer, type Answers } from '../lib/onboarding/answers'
import type { QuestionId } from '../lib/onboarding/questions'

type Row = { label: string; ids: QuestionId[]; format?: (a: Answers) => string }

export const SUMMARY_ROWS: Row[] = [
  { label: 'Lavori', ids: ['q1'] },
  { label: 'Prezzo', ids: ['q2'] },
  {
    label: 'Tariffa',
    ids: ['q3', 'q4'],
    format: (a) => {
      const rate = formatAnswer('q3', effectiveAnswer(a, 'q3'))
      const helper = effectiveAnswer(a, 'q4')
      return helper.value === 'nessuno'
        ? `${rate} (senza aiutante)`
        : `${rate} (+ aiutante ${formatAnswer('q4', helper)})`
    },
  },
  { label: 'Sconti', ids: ['q6'] },
  { label: 'Serie', ids: ['q7'], format: (a) => `${formatAnswer('q7', effectiveAnswer(a, 'q7'))}` },
  { label: 'Linee', ids: ['q8'] },
  { label: 'Livello', ids: ['q9'] },
  { label: 'IVA', ids: ['q10'] },
  { label: 'Validità', ids: ['q11'] },
  { label: 'Pagamenti', ids: ['q12'] },
  { label: 'Esclusi', ids: ['q13'] },
]

type Props = { answers: Answers; onEdit?: (ids: QuestionId[]) => void }

/** One line per topic. Values coming from defaults are grey with "(consigliato)". */
export function MethodSummary({ answers, onEdit }: Props) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {SUMMARY_ROWS.map((row) => {
        const text = row.format ? row.format(answers) : formatAnswer(row.ids[0], effectiveAnswer(answers, row.ids[0]))
        const isDefault = row.ids.every((id) => effectiveAnswer(answers, id).source === 'default')
        const content = (
          <>
            <span className="w-24 shrink-0 font-semibold sm:w-28">
              {row.label}
              {row.label === 'Serie' && <span className="block text-xs font-normal text-muted">Base / Consigliata / Top</span>}
            </span>
            <span className={`flex-1 ${isDefault ? 'text-muted' : ''}`}>
              {text}
              {isDefault && <span className="text-sm"> (consigliato)</span>}
            </span>
          </>
        )
        return (
          <li key={row.label}>
            {onEdit ? (
              <button
                type="button"
                onClick={() => onEdit(row.ids)}
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
